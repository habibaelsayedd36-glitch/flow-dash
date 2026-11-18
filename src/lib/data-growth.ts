import { and, asc, count, desc, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { ensureDb } from "@/db/ensure";
import { adCampaigns, clients, healthChecks, keywords, leads, listings, orders, products, reviews, statements, type Listing } from "@/db/schema";
import { cairoMonth } from "./catalog";

/**
 * Queries for the Commerce Hub and Growth modules. Every figure is computed
 * from rows the team entered or imported. Nothing is fetched from a marketplace.
 */

/** Order statuses that count as a sale. */
export const SALE_STATUSES = ["new", "processing", "shipped", "delivered"];

// ------------------------------------------------------------------- orders

export async function getOrders(f: { clientId?: number; status?: string } = {}) {
  await ensureDb();
  return db
    .select({ o: orders, clientName: clients.name })
    .from(orders)
    .innerJoin(clients, eq(orders.clientId, clients.id))
    .where(and(f.clientId ? eq(orders.clientId, f.clientId) : undefined, f.status ? eq(orders.status, f.status) : undefined))
    .orderBy(desc(orders.orderedAt), desc(orders.id))
    .limit(300);
}

export async function getOrderStats(clientId?: number) {
  await ensureDb();
  const scope = clientId ? eq(orders.clientId, clientId) : undefined;
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [rows, [open]] = await Promise.all([
    db
      .select({ status: orders.status, n: count(), amount: sql<number>`coalesce(sum(${orders.amount}), 0)`.mapWith(Number) })
      .from(orders)
      .where(and(gte(orders.orderedAt, since), scope))
      .groupBy(orders.status),
    db.select({ n: count() }).from(orders).where(and(inArray(orders.status, ["new", "processing"]), scope)),
  ]);
  const placed = rows.filter((r) => r.status !== "cancelled").reduce((a, r) => a + r.n, 0);
  const returned = rows.find((r) => r.status === "returned")?.n ?? 0;
  return {
    orders: placed,
    revenue: rows.filter((r) => SALE_STATUSES.includes(r.status)).reduce((a, r) => a + r.amount, 0),
    toShip: open?.n ?? 0,
    returned,
    returnRate: placed ? Math.round((returned / placed) * 1000) / 10 : 0,
  };
}

/** Sales per client per Cairo month, keyed "clientId:YYYY-MM". Used by Billing and Advertising. */
export async function getSalesByClientMonth(): Promise<Record<string, { total: number; n: number }>> {
  await ensureDb();
  const rows = await db
    .select({ clientId: orders.clientId, amount: orders.amount, orderedAt: orders.orderedAt })
    .from(orders)
    .where(inArray(orders.status, SALE_STATUSES));
  const out: Record<string, { total: number; n: number }> = {};
  for (const r of rows) {
    const key = `${r.clientId}:${cairoMonth(r.orderedAt)}`;
    const cur = (out[key] ??= { total: 0, n: 0 });
    cur.total += r.amount;
    cur.n += 1;
  }
  return out;
}

// ---------------------------------------------------------------- inventory

export type StockState = "untracked" | "out" | "low" | "ok";

export async function getInventory(clientId?: number) {
  await ensureDb();
  const sold = (when: SQL) =>
    sql<number>`coalesce((select sum(${orders.qty}) from ${orders} where ${orders.clientId} = ${products.clientId} and ${orders.sku} = ${products.sku} and ${products.sku} <> '' and ${orders.status} not in ('cancelled', 'returned') and ${when}), 0)`.mapWith(
      Number,
    );
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      sku: products.sku,
      marketplace: products.marketplace,
      stock: products.stock,
      reorderPoint: products.reorderPoint,
      stockAt: products.stockAt,
      clientName: clients.name,
      soldSince: sold(sql`${orders.orderedAt} > coalesce(${products.stockAt}, 'epoch'::timestamptz)`),
      sold30: sold(sql`${orders.orderedAt} > now() - interval '30 days'`),
    })
    .from(products)
    .innerJoin(clients, eq(products.clientId, clients.id))
    .where(clientId ? eq(products.clientId, clientId) : undefined)
    .orderBy(asc(clients.name), asc(products.name));

  return rows.map((r) => {
    const available = r.stock === null ? null : r.stock - r.soldSince;
    const perDay = r.sold30 / 30;
    const state: StockState = available === null ? "untracked" : available <= 0 ? "out" : available <= r.reorderPoint ? "low" : "ok";
    return { ...r, available, cover: available !== null && perDay > 0 ? Math.max(0, Math.floor(available / perDay)) : null, state };
  });
}

// ----------------------------------------------------------------- keywords

export type Coverage = { state: "no_listing" | "title" | "copy" | "backend" | "missing"; missing: string[]; listingId: number | null };

/** Marketplaces match every search term anywhere in a listing, so coverage is checked word by word. */
function coverageOf(keyword: string, doc: Listing | undefined): Coverage {
  if (!doc) return { state: "no_listing", missing: [], listingId: null };
  const tokens = keyword.toLowerCase().match(/[a-z0-9\u0600-\u06ff]+/g) ?? [];
  const title = `${doc.titleEn} ${doc.titleAr}`.toLowerCase();
  const copy = [title, ...doc.bulletsEn, ...doc.bulletsAr, doc.descriptionEn, doc.descriptionAr].join(" ").toLowerCase();
  const all = `${copy} ${doc.searchTerms.toLowerCase()}`;
  const within = (text: string) => tokens.every((t) => text.includes(t));
  const state = within(title) ? "title" : within(copy) ? "copy" : within(all) ? "backend" : "missing";
  return { state, missing: state === "missing" ? tokens.filter((t) => !all.includes(t)) : [], listingId: doc.id };
}

export async function getKeywords(clientId?: number) {
  await ensureDb();
  const rows = await db
    .select({ k: keywords, clientName: clients.name, productName: products.name, sku: products.sku })
    .from(keywords)
    .innerJoin(clients, eq(keywords.clientId, clients.id))
    .leftJoin(products, eq(keywords.productId, products.id))
    .where(clientId ? eq(keywords.clientId, clientId) : undefined)
    .orderBy(asc(clients.name), asc(keywords.id));
  const productIds = [...new Set(rows.map((r) => r.k.productId).filter((x): x is number => x !== null))];
  const docs = productIds.length ? await db.select().from(listings).where(inArray(listings.productId, productIds)).orderBy(desc(listings.id)) : [];

  return rows.map((r) => {
    const checks = [...r.k.checks].sort((a, b) => a.at.localeCompare(b.at));
    const ranks = checks.map((c) => c.rank);
    const doc = docs.find((d) => d.productId === r.k.productId && d.marketplace === r.k.marketplace) ?? docs.find((d) => d.productId === r.k.productId);
    return {
      id: r.k.id,
      keyword: r.k.keyword,
      marketplace: r.k.marketplace,
      clientName: r.clientName,
      productName: r.productName,
      sku: r.sku,
      ranks: ranks.slice(-12),
      latest: ranks.length ? ranks[ranks.length - 1] : null,
      previous: ranks.length > 1 ? ranks[ranks.length - 2] : null,
      best: ranks.length ? Math.min(...ranks) : null,
      checkedAt: checks.length ? checks[checks.length - 1].at : null,
      coverage: coverageOf(r.k.keyword, doc),
    };
  });
}

// -------------------------------------------------------------- advertising

export async function getCampaigns(month: string, clientId?: number) {
  await ensureDb();
  return db
    .select({ c: adCampaigns, clientName: clients.name })
    .from(adCampaigns)
    .innerJoin(clients, eq(adCampaigns.clientId, clients.id))
    .where(and(eq(adCampaigns.month, month), clientId ? eq(adCampaigns.clientId, clientId) : undefined))
    .orderBy(desc(adCampaigns.spend));
}

// ------------------------------------------------------- reviews and health

export async function getReviews(clientId?: number) {
  await ensureDb();
  return db
    .select({ r: reviews, clientName: clients.name, productName: products.name })
    .from(reviews)
    .innerJoin(clients, eq(reviews.clientId, clients.id))
    .leftJoin(products, eq(reviews.productId, products.id))
    .where(clientId ? eq(reviews.clientId, clientId) : undefined)
    .orderBy(desc(reviews.reviewedAt), desc(reviews.id))
    .limit(200);
}

/** The latest health check for every client + marketplace pair. */
export async function getHealth(clientId?: number) {
  await ensureDb();
  const rows = await db
    .select({ h: healthChecks, clientName: clients.name })
    .from(healthChecks)
    .innerJoin(clients, eq(healthChecks.clientId, clients.id))
    .where(clientId ? eq(healthChecks.clientId, clientId) : undefined)
    .orderBy(desc(healthChecks.checkedAt), desc(healthChecks.id));
  const seen = new Set<string>();
  return rows.filter((r) => {
    const key = `${r.h.clientId}:${r.h.marketplace}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// -------------------------------------------------------------------- leads

export async function getLeads() {
  await ensureDb();
  return db.select().from(leads).orderBy(desc(leads.createdAt), desc(leads.id)).limit(300);
}

// ----------------------------------------------------------------- overview

export async function getGrowthOverview() {
  await ensureDb();
  const [stats, inventory, [lead], [review]] = await Promise.all([
    getOrderStats(),
    getInventory(),
    db.select({ n: count() }).from(leads).where(eq(leads.status, "new")),
    db
      .select({ n: count() })
      .from(reviews)
      .where(and(eq(reviews.status, "new"), sql`${reviews.rating} <= 3`)),
  ]);
  return {
    orders: stats.orders,
    revenue: stats.revenue,
    lowStock: inventory.filter((i) => i.state === "low" || i.state === "out").length,
    leadsNew: lead?.n ?? 0,
    reviewsOpen: review?.n ?? 0,
  };
}


/** FLOW cash actually collected, grouped by Cairo calendar day. */
export async function getCashflowOverview() {
  await ensureDb();
  const rows = await db.select({ total: statements.total, paid: statements.paid, paidAt: statements.paidAt })
    .from(statements);
  const now = new Date();
  const month = cairoMonth(now);
  const [year, mm] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, mm, 0)).getUTCDate();
  const daily = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, amount: 0 }));
  let collected = 0;
  let outstanding = 0;
  const byMonth = new Map<string, number>();
  for (const row of rows) {
    if (row.paid && row.paidAt) {
      const key = cairoMonth(row.paidAt);
      byMonth.set(key, (byMonth.get(key) ?? 0) + row.total);
      if (key === month) {
        collected += row.total;
        const day = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", day: "2-digit" }).format(row.paidAt));
        if (daily[day - 1]) daily[day - 1].amount += row.total;
      }
    } else if (!row.paid) {
      outstanding += row.total;
    }
  }
  const prev = mm === 1 ? `${year - 1}-12` : `${year}-${String(mm - 1).padStart(2, "0")}`;
  return { month, daily, collected, outstanding, previousCollected: byMonth.get(prev) ?? 0 };
}
