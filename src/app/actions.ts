"use server";


import { requireUser } from "@/lib/auth/server";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { ensureDb } from "@/db/ensure";
import { automations, clients, listings, products, settings, tasks, type AutomationCondition, type AutomationConfig } from "@/db/schema";
import {
  ACTIONS,
  CATEGORIES,
  CLIENT_STATUSES,
  LISTING_STATUSES,
  PLANS,
  STAGES,
  TASK_KINDS,
  TEAMS,
  TONES,
  TRIGGERS,
  isMarketplace,
  isStage,
  type PlanId,
} from "@/lib/catalog";
import { briefOf, checkQuota, emit, moveProductStage, produceListing, runScheduledChecks, type RunResult } from "@/lib/engine";
import { LOCALE_COOKIE } from "@/lib/locale";
import { getAiProvider, generateText } from "@/lib/ai";
import { scoreListing, type ListingContent } from "@/lib/rules";

export type FormState = { ok?: boolean; error?: string; ran?: number };

const str = (fd: FormData, key: string, max = 200) => String(fd.get(key) ?? "").trim().slice(0, max);
const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const oneOf = <T extends string>(list: readonly T[], v: string, fallback: T): T =>
  (list as readonly string[]).includes(v) ? (v as T) : fallback;
const fired = (results: RunResult[]) => results.filter((r) => r.status === "success").length;
const refresh = () => revalidatePath("/", "layout");

export async function setLocaleAction(locale: "ar" | "en") {
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale === "en" ? "en" : "ar", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  refresh();
}

// ------------------------------------------------------------------ clients

export async function createClientAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  await ensureDb();
  const name = str(fd, "name", 80);
  if (!name) return { error: "required" };
  const markets = fd.getAll("marketplaces").map(String).filter(isMarketplace);
  if (markets.length === 0) return { error: "market" };
  const planId = oneOf(Object.keys(PLANS) as PlanId[], str(fd, "plan"), "starter");
  const plan = PLANS[planId];
  try {
    await db.insert(clients).values({
      name,
      contactName: str(fd, "contact", 80),
      phone: str(fd, "phone", 30),
      plan: planId,
      marketplaces: markets,
      quota: plan.quota,
      monthlyFee: plan.fee,
      commissionPct: plan.pct,
      status: oneOf(CLIENT_STATUSES, str(fd, "status"), "active"),
    });
  } catch {
    return { error: "failed" };
  }
  refresh();
  return { ok: true };
}

// ----------------------------------------------------------------- products

export async function createProductAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  await ensureDb();
  const name = str(fd, "name", 160);
  const clientId = int(fd.get("clientId"), 1, 2_000_000_000, 0);
  if (!name || !str(fd, "brand", 80) || !clientId) return { error: "required" };
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) return { error: "failed" };
  const marketplace = str(fd, "marketplace");
  try {
    const [row] = await db
      .insert(products)
      .values({
        clientId,
        name,
        nameAr: "",
        brand: str(fd, "brand", 80),
        sku: "",
        category: "auto",
        marketplace: isMarketplace(marketplace) ? marketplace : "amazon",
        features: "",
        featuresAr: "",
        keywords: "",
      })
      .returning({ id: products.id });
    const results = [
      ...(await emit("product_created", { productId: row.id, clientId })),
      ...(await checkQuota(clientId)),
    ];
    refresh();
    return { ok: true, ran: fired(results) };
  } catch {
    return { error: "failed" };
  }
}

export async function moveProductAction(productId: number, stage: string): Promise<{ ok: boolean; ran: number }> {
  await requireUser();
  await ensureDb();
  if (!Number.isInteger(productId) || !isStage(stage)) return { ok: false, ran: 0 };
  const results = await moveProductStage(productId, stage);
  refresh();
  return { ok: true, ran: fired(results) };
}

// ----------------------------------------------------------------- listings

export async function generateListingAction(_prev: FormState, fd: FormData): Promise<FormState> {
  try {
    await requireUser();
  await ensureDb();
    const productId = int(fd.get("productId"), 1, 2_000_000_000, 0);
    const [product] = productId ? await db.select().from(products).where(eq(products.id, productId)) : [];
    if (!product) return { error: "No product was selected or the product no longer exists." };

    const made = await produceListing(product, {
      marketplace: str(fd, "marketplace"),
      tone: oneOf(TONES, str(fd, "tone"), "clear"),
    });
    await emit("listing_generated", { productId: product.id, clientId: product.clientId, listingId: made.listingId, score: made.score });
    const target = `/listings/${made.listingId}${made.aiError ? `?ai_error=${encodeURIComponent(made.aiError.slice(0, 300))}` : ""}`;
    refresh();
    redirect(target);
  } catch (e) {
    // Next.js redirect is a thrown control-flow signal and must pass through.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")) {
      throw e;
    }
    const message = e instanceof Error ? e.message : "Listing generation failed. Please retry.";
    return { error: message.slice(0, 500) };
  }
}

export async function saveBrandVoiceAction(value: string): Promise<{ ok: boolean }> {
  await requireUser();
  await ensureDb();
  const cleanValue = String(value ?? "").trim().slice(0, 2000);
  if (!cleanValue) return { ok: false };
  await db.insert(settings).values({ key: "brand_voice", value: cleanValue }).onConflictDoUpdate({ target: settings.key, set: { value: cleanValue } });
  refresh();
  return { ok: true };
}

export type BulkGenerateResult = { ok: boolean; results: Array<{ productId: number; productName: string; listingId?: number; engine?: string; aiError?: string; error?: string }> };

export async function bulkGenerateListingsAction(productIds: number[], marketplace: string): Promise<BulkGenerateResult> {
  await requireUser();
  await ensureDb();
  if (!isMarketplace(marketplace) || !Array.isArray(productIds)) return { ok: false, results: [] };
  const ids = [...new Set(productIds.map((id) => int(id, 1, 2_000_000_000, 0)).filter(Boolean))].slice(0, 25);
  if (!ids.length) return { ok: false, results: [] };
  const rows = await db.select().from(products).where((await import("drizzle-orm")).inArray(products.id, ids));
  // Run a small number of independent model requests concurrently instead of
  // waiting for every product to finish before starting the next one.
  // A limit of 3 improves throughput without flooding the connected provider.
  const results: BulkGenerateResult["results"] = [];
  const concurrency = 3;
  for (let offset = 0; offset < rows.length; offset += concurrency) {
    const batch = rows.slice(offset, offset + concurrency);
    const batchResults = await Promise.all(batch.map(async (product): Promise<BulkGenerateResult["results"][number]> => {
      try {
        const made = await produceListing(product, { marketplace, tone: "clear" });
        await emit("listing_generated", { productId: product.id, clientId: product.clientId, listingId: made.listingId, score: made.score });
        return { productId: product.id, productName: product.name, listingId: made.listingId, engine: made.engine, aiError: made.aiError ?? undefined };
      } catch (error) {
        return { productId: product.id, productName: product.name, error: error instanceof Error ? error.message.slice(0, 180) : "Generation failed" };
      }
    }));
    results.push(...batchResults);
  }
  refresh();
  return { ok: results.length > 0 && results.every((r) => !r.error), results };
}

export type AutoBriefResult = { ok: boolean; features?: string; featuresAr?: string; keywords?: string; error?: string };

/** Fill missing product brief fields from confirmed product/listing facts using the connected AI provider. */
export async function autoGenerateListingBriefAction(listingId: number): Promise<AutoBriefResult> {
  await requireUser();
  await ensureDb();
  const [row] = await db.select({ product: products, listing: listings }).from(listings)
    .innerJoin(products, eq(listings.productId, products.id)).where(eq(listings.id, listingId));
  if (!row) return { ok: false, error: "Product not found." };
  const provider = await getAiProvider();
  if (!provider) return { ok: false, error: "Connect an AI provider in Settings to generate these fields automatically." };
  try {
    const p = row.product;
    const raw = await generateText(
      provider,
      "You are a careful e-commerce product researcher. Return valid JSON only. Use only confirmed product fields supplied below. Never treat generated listing copy as evidence. Never invent materials, sizes, ingredients, certifications, performance claims, or product specifications. If facts are insufficient, return empty feature arrays. Arabic must be natural Modern Standard Arabic.",
      `Create a concise product brief for marketplace listing generation.
Product name EN: ${p.name}
Product name AR: ${p.nameAr || "(not provided)"}
Brand: ${p.brand || "(not provided)"}
Category: ${p.category}
Existing confirmed features EN: ${p.features || "(none)"}
Existing confirmed features AR: ${p.featuresAr || "(none)"}
Existing keywords: ${p.keywords || "(none)"}
Do not use any current or previously generated listing text as a source of product facts.
Return JSON with exactly:
{"featuresEn":["feature 1"],"featuresAr":["ميزة 1"],"keywords":["keyword 1"]}
Features must only restate supplied facts. Keywords may include only the product name, brand, category, and supplied feature terms. Do not add ingredients, benefits, claims, or generic unrelated traffic terms.`
    );
    const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("AI returned an invalid response.");
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const lines = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map(x => x.trim()).filter(Boolean).slice(0, 8).join("\n") : "";
    const features = p.features.trim() || lines(parsed.featuresEn);
    const featuresAr = p.featuresAr.trim() || lines(parsed.featuresAr);
    const keywords = p.keywords.trim() || (Array.isArray(parsed.keywords) ? parsed.keywords.filter((x): x is string => typeof x === "string").map(x => x.trim()).filter(Boolean).slice(0, 15).join(", ") : "");
    return { ok: Boolean(features || featuresAr || keywords), features, featuresAr, keywords };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "AI generation failed." };
  }
}

export type RegenerateInput = { features: string; featuresAr: string; keywords: string; marketplace: string; tone: string; notes: string };
export type RegenerateResult =
  | { ok: false; error?: string }
  | { ok: true; content: ListingContent; marketplace: string; engine: string; model: string | null; aiError: string | null; ran: number };

export async function regenerateListingAction(listingId: number, input: RegenerateInput): Promise<RegenerateResult> {
  try {
    await requireUser();
    await ensureDb();
    const [listing] = await db.select().from(listings).where(eq(listings.id, listingId));
    if (!listing) return { ok: false, error: "This listing could not be found. Refresh the page and try again." };

    const [product] = await db
      .update(products)
      .set({
        features: String(input.features ?? "").trim().slice(0, 2000),
        featuresAr: String(input.featuresAr ?? "").trim().slice(0, 2000),
        keywords: String(input.keywords ?? "").trim().slice(0, 500),
      })
      .where(eq(products.id, listing.productId))
      .returning();
    if (!product) return { ok: false, error: "The product linked to this listing could not be found." };

    const made = await produceListing(product, {
      marketplace: isMarketplace(input.marketplace) ? input.marketplace : listing.marketplace,
      tone: oneOf(TONES, String(input.tone), "clear"),
      notes: String(input.notes ?? "").trim().slice(0, 500),
      listingId,
    });
    const results = await emit("listing_generated", { productId: product.id, clientId: product.clientId, listingId, score: made.score });
    const [fresh] = await db.select().from(listings).where(eq(listings.id, listingId));
    if (!fresh) return { ok: false, error: "The generated listing was not saved. Your previous listing is still available." };
    refresh();
    return {
      ok: true,
      content: {
        titleEn: fresh.titleEn,
        titleAr: fresh.titleAr,
        bulletsEn: fresh.bulletsEn,
        bulletsAr: fresh.bulletsAr,
        descriptionEn: fresh.descriptionEn,
        descriptionAr: fresh.descriptionAr,
        searchTerms: fresh.searchTerms,
      },
      marketplace: fresh.marketplace,
      engine: fresh.engine,
      model: fresh.model,
      aiError: made.aiError,
      ran: fired(results),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 300) : "Listing regeneration failed. Please retry.",
    };
  }
}

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const cleanList = (v: unknown) => (Array.isArray(v) ? v.slice(0, 8).map((b) => clean(b, 600)).filter(Boolean) : []);

export async function saveListingAction(listingId: number, input: ListingContent): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireUser();
    await ensureDb();
    const [row] = await db
      .select({ listing: listings, product: products })
      .from(listings)
      .innerJoin(products, eq(listings.productId, products.id))
      .where(eq(listings.id, listingId));
    if (!row || !isMarketplace(row.listing.marketplace)) {
      return { ok: false, error: "This listing could not be found. Refresh the page and try again." };
    }
    const content: ListingContent = {
      titleEn: clean(input?.titleEn, 400),
      titleAr: clean(input?.titleAr, 400),
      bulletsEn: cleanList(input?.bulletsEn),
      bulletsAr: cleanList(input?.bulletsAr),
      descriptionEn: clean(input?.descriptionEn, 10_000),
      descriptionAr: clean(input?.descriptionAr, 10_000),
      searchTerms: clean(input?.searchTerms, 1000),
    };
    await db
      .update(listings)
      .set({ ...content, edited: true, score: scoreListing(content, row.listing.marketplace, briefOf(row.product)), updatedAt: new Date() })
      .where(eq(listings.id, listingId));
    refresh();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 300) : "Could not save this listing. Please retry." };
  }
}

export async function setListingStatusAction(listingId: number, status: string): Promise<{ ok: boolean; ran: number; error?: string }> {
  try {
    await requireUser();
    await ensureDb();
    if (!(LISTING_STATUSES as readonly string[]).includes(status)) return { ok: false, ran: 0, error: "Invalid listing status." };
    const [row] = await db
      .update(listings)
      .set({ status, updatedAt: new Date() })
      .where(eq(listings.id, listingId))
      .returning({ productId: listings.productId });
    if (!row) return { ok: false, ran: 0, error: "This listing could not be found. Refresh the page and try again." };
    const [product] = await db.select().from(products).where(eq(products.id, row.productId));
    let results: RunResult[] = [];
    const ctx = { productId: row.productId, clientId: product?.clientId, listingId };
    if (status === "approved") results = await emit("listing_approved", ctx);
    if (status === "published") results = await emit("listing_published", ctx);
    refresh();
    return { ok: true, ran: fired(results) };
  } catch (error) {
    return { ok: false, ran: 0, error: error instanceof Error ? error.message.slice(0, 300) : "Could not update the listing status. Please retry." };
  }
}

// -------------------------------------------------------------- automations

export async function createAutomationAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  await ensureDb();
  const name = str(fd, "name", 100);
  if (!name) return { error: "required" };
  const trigger = oneOf(TRIGGERS, str(fd, "trigger"), "product_created");
  const action = oneOf(ACTIONS, str(fd, "action"), "create_task");

  const condition: AutomationCondition = {};
  if (trigger === "stage_entered") condition.stage = oneOf(STAGES, str(fd, "condStage"), "content");
  if (trigger === "listing_generated") condition.maxScore = int(fd.get("maxScore"), 1, 100, 80);
  if (trigger === "quota_reached") condition.pct = int(fd.get("pct"), 1, 200, 90);
  if (trigger === "product_stale") condition.days = int(fd.get("days"), 1, 60, 3);

  const config: AutomationConfig = {};
  if (action === "create_task") {
    config.kind = oneOf(TASK_KINDS, str(fd, "kind"), "follow_up");
    if (config.kind === "custom") {
      config.title = str(fd, "taskTitle", 120);
      if (!config.title) return { error: "required" };
    }
    config.team = oneOf(TEAMS, str(fd, "team"), "accounts");
    config.dueDays = int(fd.get("dueDays"), 0, 60, 1);
    config.whatsapp = fd.get("whatsapp") === "on";
  }
  if (action === "move_stage") config.stage = oneOf(STAGES, str(fd, "toStage"), "publishing");

  try {
    await db.insert(automations).values({ name, trigger, condition, action, config });
  } catch {
    return { error: "failed" };
  }
  refresh();
  return { ok: true };
}

export async function toggleAutomationAction(id: number, enabled: boolean) {
  await requireUser();
  await ensureDb();
  await db.update(automations).set({ enabled: Boolean(enabled) }).where(eq(automations.id, id));
  refresh();
}

export async function deleteAutomationAction(id: number) {
  await requireUser();
  await ensureDb();
  await db.delete(automations).where(eq(automations.id, id));
  refresh();
}

export async function runChecksAction(): Promise<{ fired: number }> {
  await requireUser();
  await ensureDb();
  const results = await runScheduledChecks();
  refresh();
  return { fired: fired(results) };
}

// -------------------------------------------------------------------- tasks

export async function createTaskAction(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireUser();
  await ensureDb();
  const title = str(fd, "title", 160);
  if (!title) return { error: "required" };
  try {
    await db.insert(tasks).values({
      kind: "custom",
      title,
      team: oneOf(TEAMS, str(fd, "team"), "accounts"),
      dueAt: new Date(Date.now() + int(fd.get("dueDays"), 0, 60, 1) * 86_400_000),
    });
  } catch {
    return { error: "failed" };
  }
  refresh();
  return { ok: true };
}

export async function toggleTaskAction(id: number, done: boolean) {
  await requireUser();
  await ensureDb();
  await db.update(tasks).set({ done: Boolean(done), doneAt: done ? new Date() : null }).where(eq(tasks.id, id));
  refresh();
}
