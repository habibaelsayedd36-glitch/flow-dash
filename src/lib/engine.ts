import { and, count, eq, gt, lt, ne, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  automationRuns,
  automations,
  clients,
  listings,
  orders,
  products,
  settings,
  tasks,
  type Automation,
  type Client,
  type Product,
} from "@/db/schema";
import { getAiProvider, generateWithAi } from "./ai";
import { MARKETPLACE_META, isMarketplace, isStage, type Marketplace, type Trigger } from "./catalog";
import { buildTemplateListing, scoreListing, type ListingContent, type ProductBrief } from "./rules";

/**
 * Automation engine. Server actions emit events; every enabled rule that
 * matches runs a real action (create a task, move a stage, draft a listing)
 * and writes a row to automation_runs. Actions can chain (moving a stage emits
 * a new event); MAX_DEPTH stops runaway loops.
 */

const MAX_DEPTH = 4;

export type RunResult = { automationId: number; status: "success" | "skipped" | "failed"; code: string };
/** `detail` names what the event is about when no product is involved (a lead, an order number, a review). */
export type EventCtx = { productId?: number; clientId?: number; listingId?: number; stage?: string; score?: number; pct?: number; detail?: string };

export const briefOf = (p: Product): ProductBrief => ({
  name: p.name,
  nameAr: p.nameAr,
  brand: p.brand,
  category: p.category,
  features: p.features,
  featuresAr: p.featuresAr,
  keywords: p.keywords,
});

// ---------------------------------------------------------------------------
// Listing generation: connected LLM when a key exists, template engine otherwise.
// ---------------------------------------------------------------------------

export type ProduceResult = { listingId: number; engine: "ai" | "template"; score: number; aiError: string | null };

export async function produceListing(
  product: Product,
  opts: { marketplace?: string; tone?: string; notes?: string; listingId?: number } = {},
): Promise<ProduceResult> {
  const m: Marketplace = isMarketplace(opts.marketplace) ? opts.marketplace : isMarketplace(product.marketplace) ? product.marketplace : "amazon";
  const tone = opts.tone || "clear";
  const brief = briefOf(product);
  const provider = await getAiProvider();
  const [voiceRow] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, "brand_voice"));
  const brandVoice = voiceRow?.value?.trim() ?? "";
  const aiNotes = [brandVoice ? `Brand voice rules (follow these): ${brandVoice}` : "", opts.notes ?? ""].filter(Boolean).join("\\n\\n");

  let content: ListingContent;
  let engine: "ai" | "template" = "template";
  let aiError: string | null = null;

  if (provider) {
    try {
      content = await generateWithAi(provider, brief, m, tone, aiNotes);
      engine = "ai";
    } catch (e) {
      aiError = e instanceof Error ? e.message : "AI request failed";
      content = buildTemplateListing(brief, m);
    }
  } else {
    content = buildTemplateListing(brief, m);
  }

  const score = scoreListing(content, m, brief);
  const values = {
    ...content,
    marketplace: m,
    tone,
    engine,
    model: engine === "ai" ? (provider?.model ?? null) : null,
    edited: false,
    score,
    updatedAt: new Date(),
  };

  if (opts.listingId) {
    await db.update(listings).set({ ...values, status: "draft" }).where(eq(listings.id, opts.listingId));
    return { listingId: opts.listingId, engine, score, aiError };
  }
  const [row] = await db.insert(listings).values({ ...values, productId: product.id, status: "draft" }).returning({ id: listings.id });
  return { listingId: row.id, engine, score, aiError };
}

// ---------------------------------------------------------------------------
// WhatsApp drafts. Egyptian sellers are messaged in Egyptian Arabic. These are
// only prepared — a teammate opens the link and presses send.
// ---------------------------------------------------------------------------

function waMessage(kind: string, client: Client | null, product: Product | null, used: number): string {
  const hi = client?.contactName ? `أهلاً ${client.contactName}` : "أهلاً";
  const name = product ? `«${product.nameAr || product.name}»` : "";
  const market = product && isMarketplace(product.marketplace) ? MARKETPLACE_META[product.marketplace].label : "";
  switch (kind) {
    case "upsell_plan":
      return `${hi}، معاك فريق FLOW. منتجاتك وصلت ${used} من ${client?.quota ?? ""} في باقتك الحالية. تحب نراجع معاك ترقية الباقة علشان نكمّل رفع باقي المنتجات؟`;
    case "verify_live":
      return `${hi}، معاك فريق FLOW. منتج ${name} اتنشر على ${market}. بنراجع ظهوره في البحث وهنأكد عليك أول ما نخلص.`;
    case "schedule_shoot":
      return `${hi}، معاك فريق FLOW. استلمنا بيانات منتج ${name}. إمتى يناسبك نستلم العيّنة علشان التصوير؟`;
    case "restock":
      return `${hi}، معاك فريق FLOW. مخزون منتج ${name} قرب يخلص. تحب نجهّز معاك طلب تزويد جديد؟`;
    case "follow_up":
      return `${hi}، معاك فريق FLOW. محتاجين تأكيد منك بخصوص منتج ${name} علشان نكمّل الشغل عليه.`;
    default:
      return `${hi}، معاك فريق FLOW${name ? ` بخصوص منتج ${name}` : ""}.`;
  }
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

function matches(rule: Automation, ctx: EventCtx): boolean {
  switch (rule.trigger) {
    case "stage_entered":
      return rule.condition.stage === ctx.stage;
    case "listing_generated":
      return (ctx.score ?? 100) < (rule.condition.maxScore ?? 80);
    case "quota_reached":
      return (ctx.pct ?? 0) >= (rule.condition.pct ?? 90);
    default:
      return true;
  }
}

async function log(rule: Automation, status: RunResult["status"], code: string, subject: string, extra = ""): Promise<RunResult> {
  await db.insert(automationRuns).values({ automationId: rule.id, status, code, subject, extra: extra.slice(0, 300) });
  if (status === "success") {
    await db
      .update(automations)
      .set({ runCount: sql`${automations.runCount} + 1`, lastRunAt: new Date() })
      .where(eq(automations.id, rule.id));
  }
  return { automationId: rule.id, status, code };
}

async function execute(rule: Automation, ctx: EventCtx, depth: number): Promise<RunResult[]> {
  let subject = "";
  try {
    const product = ctx.productId ? ((await db.select().from(products).where(eq(products.id, ctx.productId)))[0] ?? null) : null;
    const clientId = ctx.clientId ?? product?.clientId;
    const client = clientId ? ((await db.select().from(clients).where(eq(clients.id, clientId)))[0] ?? null) : null;
    subject = product?.name ?? client?.name ?? ctx.detail ?? "";

    if (rule.action === "create_task") {
      const kind = rule.config.kind ?? "custom";
      const title = kind === "custom" ? (rule.config.title ?? "") : (ctx.detail ?? "").slice(0, 140);
      const scope = product ? eq(tasks.productId, product.id) : client ? eq(tasks.clientId, client.id) : undefined;
      const open = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.done, false), eq(tasks.kind, kind), eq(tasks.title, title), scope))
        .limit(1);
      if (open.length > 0) return [await log(rule, "skipped", "duplicate_task", subject, kind)];

      let used = 0;
      if (client) {
        used = (await db.select({ n: count() }).from(products).where(eq(products.clientId, client.id)))[0]?.n ?? 0;
      }
      const days = Math.max(0, Math.min(60, rule.config.dueDays ?? 1));
      await db.insert(tasks).values({
        kind,
        title,
        clientId: client?.id ?? null,
        productId: product?.id ?? null,
        listingId: ctx.listingId ?? null,
        team: rule.config.team ?? "accounts",
        dueAt: new Date(Date.now() + days * 86_400_000),
        automationId: rule.id,
        waText: rule.config.whatsapp && client?.phone ? waMessage(kind, client, product, used) : null,
      });
      return [await log(rule, "success", "task_created", subject, kind === "custom" ? title || kind : kind)];
    }

    if (rule.action === "move_stage") {
      const target = rule.config.stage;
      if (!product || !isStage(target)) return [await log(rule, "skipped", "no_product", subject)];
      if (product.stage === target) return [await log(rule, "skipped", "already_there", subject, target)];
      const own = await log(rule, "success", "stage_moved", subject, target);
      return [own, ...(await moveProductStage(product.id, target, depth + 1))];
    }

    if (rule.action === "generate_listing") {
      if (!product) return [await log(rule, "skipped", "no_product", subject)];
      const existing = await db
        .select({ id: listings.id })
        .from(listings)
        .where(and(eq(listings.productId, product.id), eq(listings.marketplace, product.marketplace)))
        .limit(1);
      if (existing.length > 0) return [await log(rule, "skipped", "has_listing", subject)];
      const made = await produceListing(product);
      const own = await log(rule, "success", "listing_generated", subject, String(made.score));
      const chained = await emit("listing_generated", { productId: product.id, clientId: product.clientId, listingId: made.listingId, score: made.score }, depth + 1);
      return [own, ...chained];
    }

    return [await log(rule, "failed", "error", subject, `Unknown action: ${rule.action}`)];
  } catch (e) {
    return [await log(rule, "failed", "error", subject, e instanceof Error ? e.message : "error")];
  }
}

export async function emit(trigger: Trigger, ctx: EventCtx, depth = 0): Promise<RunResult[]> {
  if (depth > MAX_DEPTH) return [];
  const rules = await db
    .select()
    .from(automations)
    .where(and(eq(automations.trigger, trigger), eq(automations.enabled, true)))
    .orderBy(automations.id);
  const results: RunResult[] = [];
  for (const rule of rules) {
    if (!matches(rule, ctx)) continue;
    results.push(...(await execute(rule, ctx, depth)));
  }
  return results;
}

export async function moveProductStage(productId: number, stage: string, depth = 0): Promise<RunResult[]> {
  if (!isStage(stage)) return [];
  const [row] = await db
    .update(products)
    .set({ stage, stageEnteredAt: new Date() })
    .where(eq(products.id, productId))
    .returning({ clientId: products.clientId });
  if (!row) return [];
  return emit("stage_entered", { productId, clientId: row.clientId, stage }, depth);
}

/** Fires quota rules for a client whose product count just changed. */
export async function checkQuota(clientId: number, depth = 0): Promise<RunResult[]> {
  const client = (await db.select().from(clients).where(eq(clients.id, clientId)))[0];
  if (!client?.quota) return [];
  const used = (await db.select({ n: count() }).from(products).where(eq(products.clientId, clientId)))[0]?.n ?? 0;
  return emit("quota_reached", { clientId, pct: Math.round((used / client.quota) * 100) }, depth);
}

/** Time-based rules. Called by /api/automations/tick (cron) and the "Run checks now" button. */
export async function runScheduledChecks(): Promise<RunResult[]> {
  const rules = await db
    .select()
    .from(automations)
    .where(and(eq(automations.trigger, "product_stale"), eq(automations.enabled, true)))
    .orderBy(automations.id);
  const results: RunResult[] = [];
  for (const rule of rules) {
    const days = Math.max(1, rule.condition.days ?? 3);
    const cutoff = new Date(Date.now() - days * 86_400_000);
    // "Sales growth" is the ongoing final stage, so products there are never stale.
    const stuck = await db
      .select({ id: products.id, clientId: products.clientId, stage: products.stage })
      .from(products)
      .where(and(lt(products.stageEnteredAt, cutoff), ne(products.stage, "growth")));
    for (const p of stuck) {
      results.push(...(await execute(rule, { productId: p.id, clientId: p.clientId, stage: p.stage }, 0)));
    }
  }
  const now = new Date().toISOString();
  await db.insert(settings).values({ key: "last_tick", value: now }).onConflictDoUpdate({ target: settings.key, set: { value: now } });
  return results;
}

// ---------------------------------------------------------------------------
// Stock. Available = the last count minus units ordered since that count
// (cancelled and returned orders are left out).
// ---------------------------------------------------------------------------

export async function stockLevel(productId: number) {
  const [product] = await db.select().from(products).where(eq(products.id, productId));
  if (!product || product.stock === null) return null;
  let sold = 0;
  if (product.sku) {
    const [row] = await db
      .select({ n: sql<number>`coalesce(sum(${orders.qty}), 0)`.mapWith(Number) })
      .from(orders)
      .where(
        and(
          eq(orders.clientId, product.clientId),
          eq(orders.sku, product.sku),
          gt(orders.orderedAt, product.stockAt ?? new Date(0)),
          notInArray(orders.status, ["cancelled", "returned"]),
        ),
      );
    sold = row?.n ?? 0;
  }
  return { product, available: product.stock - sold };
}

/** Fires the "stock runs low" rules when a tracked product is at or under its reorder point. */
export async function checkStock(productId: number): Promise<RunResult[]> {
  const level = await stockLevel(productId);
  if (!level || level.available > level.product.reorderPoint) return [];
  return emit("stock_low", { productId, clientId: level.product.clientId });
}

export async function checkStockForSkus(clientId: number, skus: string[]): Promise<RunResult[]> {
  const results: RunResult[] = [];
  for (const sku of new Set(skus.filter(Boolean))) {
    const [p] = await db.select({ id: products.id }).from(products).where(and(eq(products.clientId, clientId), eq(products.sku, sku)));
    if (p) results.push(...(await checkStock(p.id)));
  }
  return results;
}
