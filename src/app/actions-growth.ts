"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { ensureDb } from "@/db/ensure";
import { adCampaigns, clients, healthChecks, keywords, leads, orders, products, reviews } from "@/db/schema";
import { generateText, getAiProvider } from "@/lib/ai";
import { LEAD_SOURCES, LEAD_STATUSES, MARKETPLACE_META, ORDER_STATUSES, PLANS, REVIEW_STATUSES, isMarketplace, type PlanId } from "@/lib/catalog";
import { checkStock, checkStockForSkus, emit } from "@/lib/engine";

export type GrowthState = { ok?: boolean; error?: string };
type Result = { ok: boolean; message?: string };

const refresh = () => revalidatePath("/", "layout");
const text = (fd: FormData, key: string, max = 200) => String(fd.get(key) ?? "").trim().slice(0, max);
const whole = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const decimal = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const pick = <T extends string>(list: readonly T[], v: string, fallback: T): T => ((list as readonly string[]).includes(v) ? (v as T) : fallback);
const market = (v: string) => (isMarketplace(v) ? v : "amazon");
/** A date from a date input, pinned to midday in Cairo so it never slips to the day before. */
const dayOf = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00+02:00`) : new Date());

async function clientOf(fd: FormData) {
  const id = whole(fd.get("clientId"), 0, 2_000_000_000, 0);
  if (!id) return null;
  const [row] = await db.select().from(clients).where(eq(clients.id, id));
  return row ?? null;
}

// ------------------------------------------------------------------- orders

export async function createOrderAction(_prev: GrowthState, fd: FormData): Promise<GrowthState> {
  await ensureDb();
  const client = await clientOf(fd);
  const orderRef = text(fd, "orderRef", 80);
  const item = text(fd, "item", 200);
  if (!client) return { error: "Choose a client." };
  if (!orderRef && !item) return { error: "Enter the order number or the item." };
  const sku = text(fd, "sku", 60);
  await db.insert(orders).values({
    clientId: client.id,
    marketplace: market(text(fd, "marketplace")),
    orderRef,
    sku,
    item,
    qty: whole(fd.get("qty"), 1, 100_000, 1),
    amount: whole(fd.get("amount"), 0, 1_000_000_000, 0),
    status: pick(ORDER_STATUSES, text(fd, "status"), "new"),
    orderedAt: dayOf(text(fd, "date", 10)),
  });
  await checkStockForSkus(client.id, [sku]);
  refresh();
  return { ok: true };
}

export async function setOrderStatusAction(id: number, status: string) {
  await ensureDb();
  if (!(ORDER_STATUSES as readonly string[]).includes(status)) return;
  const [before] = await db.select().from(orders).where(eq(orders.id, id));
  if (!before || before.status === status) return;
  await db.update(orders).set({ status }).where(eq(orders.id, id));
  if (status === "returned") {
    await emit("order_returned", { clientId: before.clientId, detail: `${before.orderRef || `#${before.id}`}${before.item ? ` · ${before.item}` : ""}` });
  }
  refresh();
}

export async function deleteOrderAction(id: number) {
  await ensureDb();
  await db.delete(orders).where(eq(orders.id, id));
  refresh();
}

// ---------------------------------------------------------------- inventory

export async function setStockAction(productId: number, values: Record<string, number>): Promise<Result> {
  await ensureDb();
  const stock = whole(values.stock, 0, 10_000_000, -1);
  if (stock < 0) return { ok: false, message: "Enter the units on hand." };
  const updated = await db
    .update(products)
    .set({ stock, reorderPoint: whole(values.reorder, 0, 10_000_000, 0), stockAt: new Date() })
    .where(eq(products.id, productId))
    .returning({ id: products.id });
  if (updated.length === 0) return { ok: false, message: "Product not found." };
  const fired = (await checkStock(productId)).some((r) => r.status === "success");
  refresh();
  return { ok: true, message: fired ? "Saved. Stock is low, so a restock task was created." : "Saved" };
}

// ----------------------------------------------------------------- keywords

export async function createKeywordsAction(_prev: GrowthState, fd: FormData): Promise<GrowthState> {
  await ensureDb();
  const productId = whole(fd.get("productId"), 0, 2_000_000_000, 0);
  const [product] = productId ? await db.select().from(products).where(eq(products.id, productId)) : [];
  if (!product) return { error: "Choose a product." };
  const marketplace = market(text(fd, "marketplace") || product.marketplace);
  const lines = [...new Set(text(fd, "keywords", 3000).split(/\r?\n|,|،/).map((k) => k.trim().slice(0, 120)).filter(Boolean))].slice(0, 30);
  if (lines.length === 0) return { error: "Enter at least one keyword." };
  const existing = await db.select({ keyword: keywords.keyword }).from(keywords).where(and(eq(keywords.productId, product.id), eq(keywords.marketplace, marketplace)));
  const have = new Set(existing.map((e) => e.keyword.toLowerCase()));
  const fresh = lines.filter((k) => !have.has(k.toLowerCase()));
  if (fresh.length === 0) return { error: "Those keywords are already tracked for this product." };
  await db.insert(keywords).values(fresh.map((keyword) => ({ clientId: product.clientId, productId: product.id, marketplace, keyword })));
  refresh();
  return { ok: true };
}

export async function logRankAction(id: number, values: Record<string, number>): Promise<Result> {
  await ensureDb();
  const rank = whole(values.rank, 0, 1000, 0);
  if (rank < 1) return { ok: false, message: "Enter a position from 1 to 1000." };
  const check = JSON.stringify([{ at: new Date().toISOString(), rank }]);
  await db.update(keywords).set({ checks: sql`${keywords.checks} || ${check}::jsonb` }).where(eq(keywords.id, id));
  refresh();
  return { ok: true, message: "Logged" };
}

export async function deleteKeywordAction(id: number) {
  await ensureDb();
  await db.delete(keywords).where(eq(keywords.id, id));
  refresh();
}

// -------------------------------------------------------------- advertising

export async function saveCampaignAction(_prev: GrowthState, fd: FormData): Promise<GrowthState> {
  await ensureDb();
  const client = await clientOf(fd);
  const name = text(fd, "name", 120);
  const month = text(fd, "month", 7);
  if (!client) return { error: "Choose a client." };
  if (!name) return { error: "Enter the campaign name." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { error: "Choose the month these figures cover." };
  const marketplace = market(text(fd, "marketplace"));
  const figures = {
    budget: whole(fd.get("budget"), 0, 1_000_000_000, 0),
    spend: whole(fd.get("spend"), 0, 1_000_000_000, 0),
    sales: whole(fd.get("sales"), 0, 1_000_000_000, 0),
    clicks: whole(fd.get("clicks"), 0, 1_000_000_000, 0),
    impressions: whole(fd.get("impressions"), 0, 2_000_000_000, 0),
    orders: whole(fd.get("orders"), 0, 1_000_000_000, 0),
    targetAcos: decimal(fd.get("targetAcos"), 1, 500, 30),
  };
  // One row per campaign per month: saving again replaces that month's figures.
  const [existing] = await db
    .select({ id: adCampaigns.id })
    .from(adCampaigns)
    .where(and(eq(adCampaigns.clientId, client.id), eq(adCampaigns.marketplace, marketplace), eq(adCampaigns.name, name), eq(adCampaigns.month, month)));
  if (existing) await db.update(adCampaigns).set(figures).where(eq(adCampaigns.id, existing.id));
  else await db.insert(adCampaigns).values({ clientId: client.id, marketplace, name, month, ...figures });
  refresh();
  return { ok: true };
}

export async function deleteCampaignAction(id: number) {
  await ensureDb();
  await db.delete(adCampaigns).where(eq(adCampaigns.id, id));
  refresh();
}

// ------------------------------------------------------- reviews and health

export async function createReviewAction(_prev: GrowthState, fd: FormData): Promise<GrowthState> {
  await ensureDb();
  const client = await clientOf(fd);
  if (!client) return { error: "Choose a client." };
  const rating = whole(fd.get("rating"), 0, 5, 0);
  if (rating < 1) return { error: "Choose a rating from 1 to 5." };
  const productId = whole(fd.get("productId"), 0, 2_000_000_000, 0);
  const [product] = productId ? await db.select().from(products).where(and(eq(products.id, productId), eq(products.clientId, client.id))) : [];
  const marketplace = market(text(fd, "marketplace"));
  const [row] = await db
    .insert(reviews)
    .values({
      clientId: client.id,
      productId: product?.id ?? null,
      marketplace,
      rating,
      body: text(fd, "body", 2000),
      author: text(fd, "author", 80),
      reviewedAt: dayOf(text(fd, "date", 10)),
    })
    .returning({ id: reviews.id });
  if (rating <= 2) {
    await emit("review_negative", { clientId: client.id, productId: product?.id, detail: `review #${row.id}, ${rating} of 5 on ${MARKETPLACE_META[marketplace].label}` });
  }
  refresh();
  return { ok: true };
}

export async function setReviewStatusAction(id: number, status: string) {
  await ensureDb();
  if (!(REVIEW_STATUSES as readonly string[]).includes(status)) return;
  await db.update(reviews).set({ status }).where(eq(reviews.id, id));
  refresh();
}

export async function saveReviewReplyAction(id: number, reply: string): Promise<Result> {
  await ensureDb();
  const clean = String(reply ?? "").trim().slice(0, 2000);
  if (!clean) return { ok: false, message: "Write the reply first." };
  await db.update(reviews).set({ reply: clean, status: "replied" }).where(eq(reviews.id, id));
  refresh();
  return { ok: true, message: "Saved. Copy it and post it in the seller portal." };
}

const REPLY_SYSTEM = `You write short public replies to customer reviews on behalf of an online seller in Egypt.

Rules:
- Reply in the language of the review. For Arabic reviews use clear, warm Modern Standard Arabic.
- Two or three sentences. Thank the customer, address the specific point they raised without excuses, and invite them to reach the seller through the marketplace's messaging.
- Never offer a refund, gift or discount in exchange for changing the review, and never ask the customer to edit or remove it.
- Never include phone numbers, email addresses or links.
- State only what the review itself says. Do not invent facts about the product, the order or what went wrong.
- Reply with the text only.`;

/** Drafts a reply with the connected model. The draft is only shown in the editor: a person edits, saves and posts it. */
export async function draftReviewReplyAction(id: number): Promise<{ ok: boolean; text?: string; error?: string }> {
  await ensureDb();
  const provider = await getAiProvider();
  if (!provider) return { ok: false, error: "No AI key is connected. Add one in Settings & AI Key." };
  const [row] = await db
    .select({ r: reviews, productName: products.name })
    .from(reviews)
    .leftJoin(products, eq(reviews.productId, products.id))
    .where(eq(reviews.id, id));
  if (!row) return { ok: false, error: "Review not found." };
  try {
    const draft = await generateText(
      provider,
      REPLY_SYSTEM,
      `Marketplace: ${MARKETPLACE_META[market(row.r.marketplace)].label}\nProduct: ${row.productName ?? "(not specified)"}\nRating: ${row.r.rating} out of 5\nReview: ${row.r.body || "(no text)"}`,
    );
    return { ok: true, text: draft.slice(0, 2000) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 240) : "The AI request failed." };
  }
}

export async function deleteReviewAction(id: number) {
  await ensureDb();
  await db.delete(reviews).where(eq(reviews.id, id));
  refresh();
}

export async function saveHealthAction(_prev: GrowthState, fd: FormData): Promise<GrowthState> {
  await ensureDb();
  const client = await clientOf(fd);
  if (!client) return { error: "Choose a client." };
  await db.insert(healthChecks).values({
    clientId: client.id,
    marketplace: market(text(fd, "marketplace")),
    odr: decimal(fd.get("odr"), 0, 100, 0),
    lateShipment: decimal(fd.get("lateShipment"), 0, 100, 0),
    cancelRate: decimal(fd.get("cancelRate"), 0, 100, 0),
    validTracking: decimal(fd.get("validTracking"), 0, 100, 100),
    violations: whole(fd.get("violations"), 0, 10_000, 0),
  });
  refresh();
  return { ok: true };
}

// -------------------------------------------------------------------- leads

export async function createLeadAction(_prev: GrowthState, fd: FormData): Promise<GrowthState> {
  await ensureDb();
  const name = text(fd, "name", 120);
  const phone = text(fd, "phone", 30);
  const email = text(fd, "email", 160);
  if (name.length < 2) return { error: "Enter the lead's name." };
  if (!phone && !email) return { error: "Enter a phone number or an email address." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email address does not look right." };
  await db.insert(leads).values({
    name,
    phone,
    email,
    platform: text(fd, "platform", 40),
    productsCount: text(fd, "productsCount", 20),
    service: text(fd, "service", 80),
    message: text(fd, "message", 2000),
    source: pick(LEAD_SOURCES, text(fd, "source"), "manual"),
  });
  await emit("lead_created", { detail: name });
  refresh();
  return { ok: true };
}

export async function setLeadStatusAction(id: number, status: string) {
  await ensureDb();
  if (!(LEAD_STATUSES as readonly string[]).includes(status)) return;
  await db.update(leads).set({ status }).where(eq(leads.id, id));
  refresh();
}

const PLATFORM_MARKET: Record<string, string> = { Amazon: "amazon", Noon: "noon", "TikTok Shop": "tiktok", Shopify: "shopify" };

/** Turns a lead into a client on the chosen plan, with the plan's real fee, sales share and product limit. */
export async function convertLeadAction(id: number, planId: string): Promise<Result> {
  await ensureDb();
  const [lead] = await db.select().from(leads).where(eq(leads.id, id));
  if (!lead) return { ok: false, message: "Lead not found." };
  if (lead.clientId) return { ok: false, message: "This lead is already a client." };
  const plan = (planId in PLANS ? planId : "starter") as PlanId;
  const terms = PLANS[plan];
  const [client] = await db
    .insert(clients)
    .values({
      name: lead.name,
      contactName: lead.name,
      phone: lead.phone,
      plan,
      marketplaces: [PLATFORM_MARKET[lead.platform] ?? "amazon"],
      quota: terms.quota,
      monthlyFee: terms.fee,
      commissionPct: terms.pct,
      status: "onboarding",
    })
    .returning({ id: clients.id });
  await db.update(leads).set({ clientId: client.id, status: "won" }).where(eq(leads.id, id));
  refresh();
  return { ok: true, message: `${lead.name} was added to Clients as onboarding.` };
}

export async function deleteLeadAction(id: number) {
  await ensureDb();
  await db.delete(leads).where(eq(leads.id, id));
  refresh();
}
