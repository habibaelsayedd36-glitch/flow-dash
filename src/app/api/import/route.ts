import { requireApiUser } from "@/lib/auth/server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { ensureDb } from "@/db/ensure";
import { adCampaigns, clients, keywords, orders, products, reviews } from "@/db/schema";
import { MARKETPLACE_META, isMarketplace } from "@/lib/catalog";
import { checkStockForSkus, emit } from "@/lib/engine";
import { parseSheet } from "@/lib/sheets";

export const dynamic = "force-dynamic";

/**
 * CSV / Excel import for Orders, Advertising, Inventory, Reviews and Keywords.
 * Columns are matched by their header text, so marketplace reports (for example
 * Amazon's "All Orders" or the Sponsored Products campaign report) and the
 * templates in /public/samples both work.
 */

type Kind = "orders" | "ads" | "inventory" | "reviews" | "keywords";
type Spec = [field: string, hints: string[]][];

const SPECS: Record<Kind, Spec> = {
  orders: [
    ["orderRef", ["order-id", "order id", "order_id", "order number", "order no", "رقم الطلب"]],
    ["status", ["order-status", "order status", "status", "الحالة"]],
    ["date", ["purchase-date", "purchase date", "order date", "date", "التاريخ"]],
    ["sku", ["sku", "كود"]],
    ["amount", ["item-price", "item price", "line total", "total", "amount", "price", "الإجمالي", "السعر"]],
    ["qty", ["quantity", "qty", "units", "الكمية"]],
    ["item", ["product-name", "product name", "item name", "title", "product", "item", "المنتج"]],
  ],
  ads: [
    ["name", ["campaign name", "campaign", "الحملة"]],
    ["spend", ["spend", "ad spend", "الإنفاق"]],
    ["sales", ["sales", "revenue", "المبيعات"]],
    ["clicks", ["clicks", "النقرات"]],
    ["impressions", ["impressions", "مرات الظهور"]],
    ["orders", ["orders", "purchases", "conversions", "الطلبات"]],
    ["budget", ["budget", "الميزانية"]],
  ],
  inventory: [
    ["sku", ["sku", "كود"]],
    ["reorder", ["reorder point", "reorder", "minimum", "حد إعادة الطلب"]],
    ["stock", ["stock", "on hand", "available", "quantity", "qty", "المخزون", "الكمية"]],
  ],
  reviews: [
    ["rating", ["rating", "stars", "star", "التقييم"]],
    ["author", ["author", "reviewer", "customer", "الاسم"]],
    ["body", ["review", "comment", "text", "body", "التعليق"]],
    ["date", ["date", "التاريخ"]],
    ["sku", ["sku"]],
  ],
  keywords: [
    ["keyword", ["keyword", "search term", "search query", "الكلمة"]],
    ["rank", ["rank", "position", "الترتيب"]],
    ["sku", ["sku"]],
  ],
};
const REQUIRED: Record<Kind, string[]> = { orders: ["amount"], ads: ["name", "spend"], inventory: ["sku", "stock"], reviews: ["rating"], keywords: ["keyword"] };
const EXPECTS: Record<Kind, string> = {
  orders: "order id, date, sku, item, quantity, line total, status",
  ads: "campaign name, spend, sales, clicks, impressions, orders, budget",
  inventory: "sku, stock, reorder point",
  reviews: "rating, review, reviewer, date, sku",
  keywords: "keyword, rank, sku",
};

const MAX_BYTES = 8 * 1024 * 1024;
const fail = (error: string, status = 400) => Response.json({ ok: false, error }, { status });
const number = (v: string) => {
  const n = parseFloat(v.replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const dateOf = (v: string) => {
  const d = v ? new Date(v) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

/** Exact header matches win, then "starts with", then "contains". */
function mapColumns(headers: string[], spec: Spec): Record<string, number> {
  const norm = headers.map((h) => h.toLowerCase().trim());
  const taken = new Set<number>();
  const out: Record<string, number> = {};
  const tests = [(h: string, x: string) => h === x, (h: string, x: string) => h.startsWith(x), (h: string, x: string) => h.includes(x)];
  for (const [field, hints] of spec) {
    let idx = -1;
    for (const test of tests) {
      for (const hint of hints) {
        idx = norm.findIndex((h, i) => !taken.has(i) && test(h, hint));
        if (idx >= 0) break;
      }
      if (idx >= 0) break;
    }
    if (idx >= 0) {
      out[field] = idx;
      taken.add(idx);
    }
  }
  return out;
}

function orderStatus(v: string): string {
  const s = v.toLowerCase();
  if (/cancel|ملغ/.test(s)) return "cancelled";
  if (/return|refund|مرتجع/.test(s)) return "returned";
  if (/deliver|complete|تم التسليم/.test(s)) return "delivered";
  if (/unshipped|pending/.test(s)) return "new";
  if (/process|تجهيز/.test(s)) return "processing";
  if (/ship|dispatch|شحن/.test(s)) return "shipped";
  return "new";
}

export async function POST(req: Request) {
  await ensureDb();
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Choose a file to import.");
  }
  const kind = String(form.get("type") ?? "") as Kind;
  if (!(kind in SPECS)) return fail("Unknown import type.");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a file to import.");
  if (file.size > MAX_BYTES) return fail("That file is larger than 8 MB.");
  if (!/\.(xlsx|xlsm|csv|txt|tsv)$/i.test(file.name)) return fail("Use an .xlsx, .csv or tab-delimited .txt file.");

  const clientId = Number(form.get("clientId")) || 0;
  const [client] = clientId ? await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)) : [];
  if (!client) return fail("Choose a client.");
  const mk = String(form.get("marketplace") ?? "");
  const marketplace = isMarketplace(mk) ? mk : "amazon";

  let rows: string[][];
  try {
    rows = await parseSheet(await file.arrayBuffer(), file.name, { maxRows: 2000 });
  } catch {
    return fail("That file could not be read. Check it opens in Excel and try again.", 422);
  }
  if (rows.length < 2) return fail("The sheet needs a header row and at least one data row.", 422);
  const col = mapColumns(rows[0], SPECS[kind]);
  const missing = REQUIRED[kind].filter((f) => col[f] === undefined);
  if (missing.length) return fail(`No column was found for: ${missing.join(", ")}. Expected columns: ${EXPECTS[kind]}.`, 422);
  const cell = (row: string[], field: string) => (col[field] === undefined ? "" : String(row[col[field]] ?? "").trim());
  const data = rows.slice(1);
  let skipped = 0;
  let message = "";

  if (kind === "orders") {
    const known = await db.select({ ref: orders.orderRef, sku: orders.sku }).from(orders).where(eq(orders.clientId, clientId));
    const seen = new Set(known.map((o) => `${o.ref}|${o.sku}`));
    const values: (typeof orders.$inferInsert)[] = [];
    for (const row of data) {
      const orderRef = cell(row, "orderRef").slice(0, 80);
      const sku = cell(row, "sku").slice(0, 60);
      const item = cell(row, "item").slice(0, 200);
      // Re-importing the same report must not double count: an order line is identified by order id + SKU.
      if ((!orderRef && !item && !sku) || (orderRef && seen.has(`${orderRef}|${sku}`))) {
        skipped++;
        continue;
      }
      if (orderRef) seen.add(`${orderRef}|${sku}`);
      values.push({
        clientId,
        marketplace,
        orderRef,
        sku,
        item,
        qty: Math.max(1, Math.round(number(cell(row, "qty"))) || 1),
        amount: Math.max(0, Math.round(number(cell(row, "amount")))),
        status: orderStatus(cell(row, "status")),
        orderedAt: dateOf(cell(row, "date")),
      });
    }
    for (let i = 0; i < values.length; i += 200) await db.insert(orders).values(values.slice(i, i + 200));
    await checkStockForSkus(clientId, values.map((v) => v.sku ?? ""));
    message = `Orders imported: ${values.length}.${skipped ? ` Skipped: ${skipped} (blank or already imported).` : ""}`;
  }

  if (kind === "ads") {
    const month = String(form.get("month") ?? "");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return fail("Choose the month this report covers.");
    const totals = new Map<string, { spend: number; sales: number; clicks: number; impressions: number; orders: number; budget: number }>();
    for (const row of data) {
      const name = cell(row, "name").slice(0, 120);
      if (!name) {
        skipped++;
        continue;
      }
      // Reports often have several rows per campaign (per day or per ad group): add them up.
      const t = totals.get(name) ?? { spend: 0, sales: 0, clicks: 0, impressions: 0, orders: 0, budget: 0 };
      t.spend += number(cell(row, "spend"));
      t.sales += number(cell(row, "sales"));
      t.clicks += number(cell(row, "clicks"));
      t.impressions += number(cell(row, "impressions"));
      t.orders += number(cell(row, "orders"));
      t.budget = Math.max(t.budget, number(cell(row, "budget")));
      totals.set(name, t);
    }
    for (const [name, t] of totals) {
      const figures = { spend: Math.round(t.spend), sales: Math.round(t.sales), clicks: Math.round(t.clicks), impressions: Math.round(t.impressions), orders: Math.round(t.orders) };
      const [existing] = await db
        .select({ id: adCampaigns.id })
        .from(adCampaigns)
        .where(and(eq(adCampaigns.clientId, clientId), eq(adCampaigns.marketplace, marketplace), eq(adCampaigns.name, name), eq(adCampaigns.month, month)));
      if (existing) await db.update(adCampaigns).set({ ...figures, ...(t.budget > 0 ? { budget: Math.round(t.budget) } : {}) }).where(eq(adCampaigns.id, existing.id));
      else await db.insert(adCampaigns).values({ clientId, marketplace, name, month, budget: Math.round(t.budget), ...figures });
    }
    message = `Campaigns saved for ${month}: ${totals.size}.${skipped ? ` Blank rows skipped: ${skipped}.` : ""}`;
  }

  if (kind === "inventory") {
    const matched: string[] = [];
    const unknown: string[] = [];
    for (const row of data) {
      const sku = cell(row, "sku");
      if (!sku) {
        skipped++;
        continue;
      }
      const reorder = col.reorder === undefined ? {} : { reorderPoint: Math.max(0, Math.round(number(cell(row, "reorder")))) };
      const updated = await db
        .update(products)
        .set({ stock: Math.max(0, Math.round(number(cell(row, "stock")))), stockAt: new Date(), ...reorder })
        .where(and(eq(products.clientId, clientId), eq(products.sku, sku)))
        .returning({ id: products.id });
      (updated.length ? matched : unknown).push(sku);
    }
    await checkStockForSkus(clientId, matched);
    message =
      `Products updated: ${matched.length}.` +
      (unknown.length ? ` SKUs not in this client's pipeline: ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? "…" : ""}.` : "");
  }

  if (kind === "reviews") {
    const catalogue = await db.select({ id: products.id, sku: products.sku }).from(products).where(eq(products.clientId, clientId));
    const recent = Date.now() - 14 * 86_400_000;
    let added = 0;
    for (const row of data) {
      const rating = Math.round(number(cell(row, "rating")));
      if (rating < 1 || rating > 5) {
        skipped++;
        continue;
      }
      const sku = cell(row, "sku");
      const productId = (sku && catalogue.find((p) => p.sku === sku)?.id) || null;
      const reviewedAt = dateOf(cell(row, "date"));
      const [created] = await db
        .insert(reviews)
        .values({ clientId, productId, marketplace, rating, body: cell(row, "body").slice(0, 2000), author: cell(row, "author").slice(0, 80), reviewedAt })
        .returning({ id: reviews.id });
      added++;
      // Old reviews in a historical import should not flood the task list.
      if (rating <= 2 && reviewedAt.getTime() > recent) {
        await emit("review_negative", { clientId, productId: productId ?? undefined, detail: `review #${created.id}, ${rating} of 5 on ${MARKETPLACE_META[marketplace].label}` });
      }
    }
    message = `Reviews imported: ${added}.${skipped ? ` Skipped: ${skipped} (no rating from 1 to 5).` : ""}`;
  }

  if (kind === "keywords") {
    const catalogue = await db.select({ id: products.id, sku: products.sku }).from(products).where(eq(products.clientId, clientId));
    let added = 0;
    let logged = 0;
    for (const row of data) {
      const keyword = cell(row, "keyword").slice(0, 120);
      if (!keyword) {
        skipped++;
        continue;
      }
      const sku = cell(row, "sku");
      const productId = (sku && catalogue.find((p) => p.sku === sku)?.id) || null;
      const rank = Math.round(number(cell(row, "rank")));
      const check = rank >= 1 && rank <= 1000 ? [{ at: new Date().toISOString(), rank }] : [];
      const [existing] = await db
        .select({ id: keywords.id })
        .from(keywords)
        .where(and(eq(keywords.clientId, clientId), eq(keywords.marketplace, marketplace), sql`lower(${keywords.keyword}) = ${keyword.toLowerCase()}`));
      if (existing) {
        if (check.length) {
          await db.update(keywords).set({ checks: sql`${keywords.checks} || ${JSON.stringify(check)}::jsonb` }).where(eq(keywords.id, existing.id));
          logged++;
        }
      } else {
        await db.insert(keywords).values({ clientId, productId, marketplace, keyword, checks: check });
        added++;
      }
    }
    message = `Keywords added: ${added}. Rank checks logged: ${logged}.${skipped ? ` Blank rows skipped: ${skipped}.` : ""}`;
  }

  revalidatePath("/", "layout");
  return Response.json({ ok: true, message });
}
