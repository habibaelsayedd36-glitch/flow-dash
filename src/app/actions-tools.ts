"use server";


import { requireUser } from "@/lib/auth/server";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { ensureDb } from "@/db/ensure";
import { adCampaigns, automationRuns, automations, clients, healthChecks, jobs, keywords, leads, listings, orders, products, reviews, settings, statements, tasks, type JobItem } from "@/db/schema";
import { SPEC_KEYS, generateJobItem, getAiProvider, isProviderId, testProvider, type SpecKey } from "@/lib/ai";
import { PLANS, TONES, isMarketplace, type PlanId } from "@/lib/catalog";
import { checkQuota, emit } from "@/lib/engine";
import { isFlagged, type Mapping } from "@/lib/job-fields";
import { scoreListing, type ProductBrief } from "@/lib/rules";

const refresh = () => revalidatePath("/", "layout");
const clamp = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

// ----------------------------------------------------------------- AI key

async function setSetting(key: string, value: string) {
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
}

export type KeyState = { ok?: boolean; error?: string };

export async function saveAiKeyAction(_prev: KeyState, fd: FormData): Promise<KeyState> {
  await requireUser();
  await ensureDb();
  const provider = String(fd.get("provider") ?? "");
  const key = String(fd.get("key") ?? "").trim();
  const model = String(fd.get("model") ?? "").trim().slice(0, 80);
  if (!isProviderId(provider)) return { error: "Choose a provider." };
  const existing = await db.select().from(settings).where(eq(settings.key, "ai_key"));
  if (!key && !existing[0]?.value) return { error: "Paste your API key." };
  if (key && (key.length < 16 || key.length > 300 || /\s/.test(key))) return { error: "That does not look like an API key." };
  await setSetting("ai_provider", provider);
  if (key) await setSetting("ai_key", key);
  await setSetting("ai_model", model);
  refresh();
  return { ok: true };
}

export async function removeAiKeyAction() {
  await requireUser();
  await ensureDb();
  await db.delete(settings).where(inArray(settings.key, ["ai_provider", "ai_key", "ai_model"]));
  refresh();
}

/** Makes one real request to the provider and reports exactly what came back. */
export async function testAiAction(): Promise<{ ok: boolean; message: string }> {
  await requireUser();
  await ensureDb();
  const provider = await getAiProvider();
  if (!provider) return { ok: false, message: "No API key is saved yet." };
  try {
    const reply = await testProvider(provider);
    return { ok: true, message: `${provider.label} (${provider.model}) replied: "${reply}"` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "The request failed." };
  }
}

// ------------------------------------------------------------ listing jobs

export async function startListingJobAction(
  jobId: number,
  input: { clientId: number | null; marketplace: string; productType: string; tone: string; mapping: Mapping },
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  await ensureDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job || job.status !== "draft") return { ok: false, error: "This job has already started." };
  const client = input.clientId ? (await db.select().from(clients).where(eq(clients.id, input.clientId)))[0] : undefined;

  const items: JobItem[] = [];
  const missingBrandRows: number[] = [];
  for (const [rowIndex, row] of job.raw.slice(1).entries()) {
    const source: Record<string, string> = {};
    for (const key of ["name", "brand"] as const) {
      const col = input.mapping?.[key];
      const value = typeof col === "number" && col >= 0 ? String(row[col] ?? "").trim().slice(0, 1500) : "";
      if (value) source[key] = value;
    }
    if (!source.name && !source.brand) continue;
    if (!source.name) continue;
    if (!source.brand) {
      missingBrandRows.push(rowIndex + 2);
      continue;
    }
    items.push({ source, status: "pending" });
  }
  if (missingBrandRows.length) {
    const examples = missingBrandRows.slice(0, 8).join(", ");
    return { ok: false, error: `Add a brand for every product. Missing in spreadsheet row(s): ${examples}${missingBrandRows.length > 8 ? ", …" : ""}.` };
  }
  if (items.length === 0) return { ok: false, error: "No complete Product Name + Brand rows found. Check the two columns." };

  await db
    .update(jobs)
    .set({
      items,
      total: items.length,
      clientId: client?.id ?? null,
      marketplace: isMarketplace(input.marketplace) ? input.marketplace : "amazon",
      productType: String(input.productType ?? "").trim().slice(0, 60),
      tone: (TONES as readonly string[]).includes(input.tone) ? input.tone : "clear",
      status: "running",
    })
    .where(eq(jobs.id, jobId));
  refresh();
  return { ok: true };
}

const writeItem = (jobId: number, index: number, item: JobItem) =>
  db
    .update(jobs)
    .set({ items: sql`jsonb_set(${jobs.items}, ${`{${index}}`}::text[], ${JSON.stringify(item)}::jsonb)` })
    .where(eq(jobs.id, jobId));

async function recount(jobId: number) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) return;
  const pending = job.items.some((i) => i.status === "pending");
  await db
    .update(jobs)
    .set({ flagged: job.items.filter(isFlagged).length, status: pending ? "running" : "done" })
    .where(eq(jobs.id, jobId));
}

export async function processJobItemAction(jobId: number, index: number): Promise<{ ok: boolean; pause?: boolean }> {
  await requireUser();
  await ensureDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  const item = job?.items[index];
  if (!job || !item) return { ok: false };
  if (item.status !== "pending") return { ok: true };

  const m = isMarketplace(job.marketplace) ? job.marketplace : "amazon";
  const s = item.source;
  const known: Partial<Record<SpecKey, string>> = {};
  for (const k of SPEC_KEYS) if (s[k]) known[k] = s[k];
  const specLabels: Record<SpecKey, string> = {
    color: "Confirmed color",
    size: "Confirmed size",
    material: "Confirmed material",
    weight: "Confirmed weight",
    dimensions: "Confirmed dimensions",
    origin: "Confirmed country of origin",
  };
  const featureLines = (s.features ?? "").split(/[;|\n\u2022]+/).map((x) => x.trim()).filter(Boolean);
  const confirmedSpecLines = Object.entries(known).map(([key, value]) => `${specLabels[key as SpecKey]}: ${value}`);
  const brief: ProductBrief = {
    name: s.name || s.nameAr || "",
    nameAr: s.nameAr ?? "",
    brand: s.brand ?? "",
    category: "auto",
    // Include every mapped fact and both language feature fields in the AI brief.
    features: [...featureLines, ...confirmedSpecLines].join("\n"),
    featuresAr: (s.featuresAr ?? "").split(/[;|\n\u2022]+/).map((x) => x.trim()).filter(Boolean).join("\n"),
    keywords: (s.keywords ?? "").split(/[,،;|\n]+/).map((x) => x.trim()).filter(Boolean).join(", "),
  };
  const unknown = SPEC_KEYS.filter((k) => !known[k]);

  const provider = await getAiProvider();
  if (!provider) {
    await writeItem(jobId, index, { source: s, status: "failed", error: "No AI provider is connected. Connect the existing provider in Settings, then retry this row." });
    return { ok: false, pause: true };
  }
  try {
    // Retry transient research/provider failures automatically for this row.
    // Quota errors are deliberately not retried here: they pause the batch so
    // we do not burn the provider's remaining quota or duplicate successful rows.
    let made: Awaited<ReturnType<typeof generateJobItem>> | null = null;
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        made = await generateJobItem(provider, brief, m, job.tone, known, unknown);
        break;
      } catch (error) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const quota = /429|rate.?limit|quota|tokens per (minute|day)|tpm|tpd|too many requests/i.test(message);
        const transient = /fetch failed|network|timeout|timed out|502|503|504|temporarily unavailable|could not reach its public product research service|internal server error|service unavailable/i.test(message);
        if (quota || !transient || attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
      }
    }
    if (!made) throw lastError instanceof Error ? lastError : new Error("Listing generation failed after automatic retries.");
    const listingContent = made.content;
    if (!listingContent) throw new Error("The AI provider returned no listing content.");
    const out: JobItem = {
      source: s, status: "done", engine: "ai", content: listingContent,
      estimated: unknown.filter((k) => made.specs[k]),
      missing: unknown.filter((k) => !made.specs[k]),
      specs: { ...known, ...made.specs }, notes: [],
    };
    if (!listingContent.titleAr) out.notes?.push("no_arabic");
    out.score = scoreListing(listingContent, m, { brand: brief.brand, keywords: "" });
    await writeItem(jobId, index, out);
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 500) : "AI request failed";
    await writeItem(jobId, index, { source: s, status: "failed", error: message });
    const quota = /429|rate.?limit|quota|tokens per (minute|day)|tpm|tpd|too many requests/i.test(message);
    return { ok: false, pause: quota };
  }
}

export async function retryFailedJobItemsAction(jobId: number): Promise<{ ok: boolean; count: number }> {
  await requireUser();
  await ensureDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job || job.imported) return { ok: false, count: 0 };
  const items = job.items.map((item) => item.status === "failed" ? { source: item.source, status: "pending" as const } : item);
  const count = items.filter((item) => item.status === "pending").length;
  if (!count) return { ok: false, count: 0 };
  await db.update(jobs).set({ items, status: "running" }).where(eq(jobs.id, jobId));
  refresh();
  return { ok: true, count };
}

export async function pauseJobAction(jobId: number) {
  await requireUser();
  await ensureDb();
  await db.update(jobs).set({ status: "paused" }).where(eq(jobs.id, jobId));
  refresh();
}

export async function finishJobAction(jobId: number) {
  await requireUser();
  await ensureDb();
  await recount(jobId);
  refresh();
}

/** A person has checked the estimates for this row: clear the flags so they flow into the flat file. */
export async function verifyJobItemAction(jobId: number, index: number) {
  await requireUser();
  await ensureDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  const item = job?.items[index];
  if (!job || !item) return;
  await writeItem(jobId, index, { ...item, estimated: [] });
  await recount(jobId);
  refresh();
}

export async function importJobAction(jobId: number): Promise<{ ok: boolean; created: number; error?: string }> {
  await requireUser();
  await ensureDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job || job.imported) return { ok: false, created: 0, error: "Already added to the pipeline." };
  if (!job.clientId) return { ok: false, created: 0, error: "This job has no client." };
  let created = 0;
  for (const item of job.items) {
    if (item.status !== "done" || !item.content) continue;
    const [p] = await db
      .insert(products)
      .values({
        clientId: job.clientId,
        name: item.source.name || item.source.nameAr || "Untitled",
        nameAr: item.source.nameAr ?? "",
        brand: item.source.brand ?? "",
        sku: item.source.sku ?? "",
        marketplace: job.marketplace,
        stage: "optimization",
        features: item.source.features ?? "",
      })
      .returning({ id: products.id });
    await db.insert(listings).values({ ...item.content, productId: p.id, marketplace: job.marketplace, status: "draft", engine: item.engine ?? "template", tone: job.tone, score: item.score ?? 0 });
    created++;
  }
  await db.update(jobs).set({ imported: true }).where(eq(jobs.id, jobId));
  await checkQuota(job.clientId);
  refresh();
  return { ok: true, created };
}

/** Image jobs run entirely in the browser; only a record of the run is kept. */
export async function logImageJobAction(input: { type: "cleanup" | "shots"; title: string; total: number; flagged: number; marketplace: string }) {
  await requireUser();
  await ensureDb();
  await db.insert(jobs).values({
    type: input.type === "shots" ? "shots" : "cleanup",
    title: String(input.title ?? "").slice(0, 120),
    total: clamp(input.total, 0, 5000, 0),
    flagged: clamp(input.flagged, 0, 5000, 0),
    marketplace: String(input.marketplace ?? "").slice(0, 60),
    status: "done",
  });
  refresh();
}

// ------------------------------------------------------------ client portal

export async function createShareLinkAction(clientId: number) {
  await requireUser();
  await ensureDb();
  await db.update(clients).set({ shareToken: randomUUID().replace(/-/g, "") }).where(eq(clients.id, clientId));
  refresh();
}

export async function revokeShareLinkAction(clientId: number) {
  await requireUser();
  await ensureDb();
  await db.update(clients).set({ shareToken: null }).where(eq(clients.id, clientId));
  refresh();
}

export async function portalDecisionAction(token: string, listingId: number, decision: "approve" | "changes", note: string): Promise<{ ok: boolean }> {
  await ensureDb();
  if (typeof token !== "string" || token.length < 16) return { ok: false };
  const [client] = await db.select().from(clients).where(eq(clients.shareToken, token));
  if (!client) return { ok: false };
  const [row] = await db
    .select({ id: listings.id, productId: products.id })
    .from(listings)
    .innerJoin(products, eq(listings.productId, products.id))
    .where(and(eq(listings.id, listingId), eq(products.clientId, client.id), eq(listings.status, "review")));
  if (!row) return { ok: false };

  if (decision === "approve") {
    await db.update(listings).set({ status: "approved", updatedAt: new Date() }).where(eq(listings.id, listingId));
    await emit("listing_approved", { productId: row.productId, clientId: client.id, listingId });
  } else {
    await db.update(listings).set({ status: "draft", updatedAt: new Date() }).where(eq(listings.id, listingId));
    await db.insert(tasks).values({
      kind: "custom",
      title: `Client requested changes: ${String(note ?? "").trim().slice(0, 140) || "no note given"}`,
      clientId: client.id,
      productId: row.productId,
      listingId,
      team: "content",
      dueAt: new Date(Date.now() + 86_400_000),
    });
  }
  refresh();
  return { ok: true };
}

// ------------------------------------------------------------------ billing

export type StatementState = { ok?: boolean; error?: string };

export async function createStatementAction(_prev: StatementState, fd: FormData): Promise<StatementState> {
  await requireUser();
  await ensureDb();
  const clientId = clamp(fd.get("clientId"), 1, 2_000_000_000, 0);
  const month = String(fd.get("month") ?? "");
  if (!clientId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { error: "Choose a client and a month." };
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) return { error: "Client not found." };
  const plan = PLANS[client.plan as PlanId];
  const used = (await db.select({ n: count() }).from(products).where(eq(products.clientId, clientId)))[0]?.n ?? 0;
  const sales = Math.round(clamp(fd.get("sales"), 0, 1_000_000_000, 0));
  const pct = clamp(fd.get("pct"), 0, plan?.pctCap ?? client.commissionPct, client.commissionPct);
  const extraItems = client.quota ? Math.max(0, used - client.quota) : 0;
  const extraRate = plan?.extraItem ?? 0;
  const total = client.monthlyFee + Math.round((sales * pct) / 100) + extraItems * extraRate;
  await db.insert(statements).values({ clientId, month, fee: client.monthlyFee, sales, pct, extraItems, extraRate, total });
  refresh();
  return { ok: true };
}

export async function toggleStatementPaidAction(id: number, paid: boolean) {
  await requireUser();
  await ensureDb();
  await db.update(statements).set({ paid: Boolean(paid), paidAt: paid ? new Date() : null }).where(eq(statements.id, id));
  refresh();
}

export async function deleteStatementAction(id: number) {
  await requireUser();
  await ensureDb();
  await db.delete(statements).where(eq(statements.id, id));
  refresh();
}


/** Permanently remove a client and all client-owned records. */
export async function deleteClientAction(clientId: number): Promise<{ ok: boolean }> {
  await requireUser();
  await ensureDb();
  const id = clamp(clientId, 1, 2_000_000_000, 0);
  if (!id) return { ok: false };
  await db.delete(statements).where(eq(statements.clientId, id));
  await db.delete(orders).where(eq(orders.clientId, id));
  await db.delete(keywords).where(eq(keywords.clientId, id));
  await db.delete(adCampaigns).where(eq(adCampaigns.clientId, id));
  await db.delete(reviews).where(eq(reviews.clientId, id));
  await db.delete(healthChecks).where(eq(healthChecks.clientId, id));
  await db.delete(leads).where(eq(leads.clientId, id));
  await db.delete(clients).where(eq(clients.id, id));
  refresh();
  return { ok: true };
}

/** Clear operational data while preserving login accounts and system settings. */
export async function deleteAllOperationalDataAction(): Promise<{ ok: boolean }> {
  await requireUser();
  await ensureDb();
  await db.delete(statements);
  await db.delete(orders);
  await db.delete(reviews);
  await db.delete(healthChecks);
  await db.delete(keywords);
  await db.delete(adCampaigns);
  await db.delete(leads);
  await db.delete(tasks);
  await db.delete(listings);
  await db.delete(products);
  await db.delete(jobs);
  await db.delete(automationRuns);
  await db.delete(automations);
  await db.delete(clients);
  refresh();
  return { ok: true };
}
