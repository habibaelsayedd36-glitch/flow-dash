import { and, asc, count, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureDb } from "@/db/ensure";
import { automationRuns, automations, clients, jobs, listings, products, settings, statements, tasks } from "@/db/schema";
import { STAGES } from "./catalog";

/** Every number the UI shows comes from these queries — nothing is hard-coded. */

export async function getClients() {
  await ensureDb();
  const rows = await db.select().from(clients).orderBy(asc(clients.name));
  const used = await db.select({ clientId: products.clientId, n: count() }).from(products).groupBy(products.clientId);
  const map = new Map(used.map((u) => [u.clientId, u.n]));
  return rows.map((c) => ({ ...c, used: map.get(c.id) ?? 0 }));
}
export type ClientRow = Awaited<ReturnType<typeof getClients>>[number];

export async function getPipeline() {
  await ensureDb();
  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      nameAr: products.nameAr,
      sku: products.sku,
      marketplace: products.marketplace,
      stage: products.stage,
      stageEnteredAt: products.stageEnteredAt,
      clientId: products.clientId,
      clientName: clients.name,
    })
    .from(products)
    .innerJoin(clients, eq(products.clientId, clients.id))
    .orderBy(asc(products.stageEnteredAt));
  const latest = await db
    .select({ productId: listings.productId, id: sql<number>`max(${listings.id})`.mapWith(Number) })
    .from(listings)
    .groupBy(listings.productId);
  const map = new Map(latest.map((l) => [l.productId, l.id]));
  return rows.map((r) => ({ ...r, listingId: map.get(r.id) ?? null }));
}
export type PipelineRow = Awaited<ReturnType<typeof getPipeline>>[number];

export async function getProductOptions() {
  await ensureDb();
  return db
    .select({ id: products.id, name: products.name, nameAr: products.nameAr, marketplace: products.marketplace, clientName: clients.name })
    .from(products)
    .innerJoin(clients, eq(products.clientId, clients.id))
    .orderBy(asc(clients.name), asc(products.name));
}

const listingCols = {
  id: listings.id,
  marketplace: listings.marketplace,
  status: listings.status,
  engine: listings.engine,
  model: listings.model,
  edited: listings.edited,
  score: listings.score,
  titleEn: listings.titleEn,
  updatedAt: listings.updatedAt,
  productId: products.id,
  productName: products.name,
  productNameAr: products.nameAr,
  clientName: clients.name,
};

export async function getListings(status?: string) {
  await ensureDb();
  return db
    .select(listingCols)
    .from(listings)
    .innerJoin(products, eq(listings.productId, products.id))
    .innerJoin(clients, eq(products.clientId, clients.id))
    .where(status ? eq(listings.status, status) : undefined)
    .orderBy(desc(listings.updatedAt));
}
export type ListingRow = Awaited<ReturnType<typeof getListings>>[number];

export async function getListing(id: number) {
  await ensureDb();
  const [row] = await db
    .select({ listing: listings, product: products, clientName: clients.name })
    .from(listings)
    .innerJoin(products, eq(listings.productId, products.id))
    .innerJoin(clients, eq(products.clientId, clients.id))
    .where(eq(listings.id, id));
  return row ?? null;
}

export async function getAutomations() {
  await ensureDb();
  return db.select().from(automations).orderBy(asc(automations.id));
}

export async function getRuns(limit: number) {
  await ensureDb();
  return db
    .select({
      id: automationRuns.id,
      status: automationRuns.status,
      code: automationRuns.code,
      subject: automationRuns.subject,
      extra: automationRuns.extra,
      createdAt: automationRuns.createdAt,
      name: automations.name,
      nameAr: automations.nameAr,
    })
    .from(automationRuns)
    .innerJoin(automations, eq(automationRuns.automationId, automations.id))
    .orderBy(desc(automationRuns.id))
    .limit(limit);
}
export type RunRow = Awaited<ReturnType<typeof getRuns>>[number];

export async function getSetting(key: string): Promise<string | null> {
  await ensureDb();
  const [row] = await db.select().from(settings).where(eq(settings.key, key));
  return row?.value ?? null;
}

export async function getTasks(opts: { done?: boolean; limit?: number } = {}) {
  await ensureDb();
  const q = db
    .select({
      id: tasks.id,
      kind: tasks.kind,
      title: tasks.title,
      team: tasks.team,
      dueAt: tasks.dueAt,
      done: tasks.done,
      doneAt: tasks.doneAt,
      automationId: tasks.automationId,
      waText: tasks.waText,
      listingId: tasks.listingId,
      productName: products.name,
      productNameAr: products.nameAr,
      clientName: clients.name,
      clientPhone: clients.phone,
    })
    .from(tasks)
    .leftJoin(products, eq(tasks.productId, products.id))
    .leftJoin(clients, sql`${clients.id} = coalesce(${tasks.clientId}, ${products.clientId})`)
    .where(opts.done === undefined ? undefined : eq(tasks.done, opts.done))
    .orderBy(asc(tasks.done), sql`${tasks.dueAt} asc nulls last`, desc(tasks.id));
  return opts.limit ? q.limit(opts.limit) : q;
}
export type TaskRow = Awaited<ReturnType<typeof getTasks>>[number];

export async function getOverview() {
  await ensureDb();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  const [byStage, awaiting, retainers, runs7, rulesOn, openTasks, overdue, quality] = await Promise.all([
    db.select({ stage: products.stage, n: count() }).from(products).groupBy(products.stage),
    db.select({ n: count() }).from(listings).where(inArray(listings.status, ["draft", "review"])),
    db
      .select({ total: sql<number>`coalesce(sum(${clients.monthlyFee}), 0)`.mapWith(Number), n: count() })
      .from(clients)
      .where(eq(clients.status, "active")),
    db.select({ n: count() }).from(automationRuns).where(gte(automationRuns.createdAt, weekAgo)),
    db.select({ n: count() }).from(automations).where(eq(automations.enabled, true)),
    db.select({ n: count() }).from(tasks).where(eq(tasks.done, false)),
    db
      .select({ n: count() })
      .from(tasks)
      .where(and(eq(tasks.done, false), sql`${tasks.dueAt} < now()`)),
    db
      .select({ marketplace: listings.marketplace, avg: sql<number>`round(avg(${listings.score}))`.mapWith(Number), n: count() })
      .from(listings)
      .groupBy(listings.marketplace),
  ]);

  const stageMap = new Map(byStage.map((s) => [s.stage, s.n]));
  const stages = STAGES.map((s) => ({ stage: s, n: stageMap.get(s) ?? 0 }));

  return {
    stages,
    totalProducts: stages.reduce((a, s) => a + s.n, 0),
    awaiting: awaiting[0]?.n ?? 0,
    retainers: retainers[0]?.total ?? 0,
    activeClients: retainers[0]?.n ?? 0,
    runs7: runs7[0]?.n ?? 0,
    rulesOn: rulesOn[0]?.n ?? 0,
    openTasks: openTasks[0]?.n ?? 0,
    overdue: overdue[0]?.n ?? 0,
    quality,
  };
}

export async function getJobs(limit = 40, type?: string) {
  await ensureDb();
  return db
    .select({
      id: jobs.id,
      type: jobs.type,
      title: jobs.title,
      status: jobs.status,
      total: jobs.total,
      flagged: jobs.flagged,
      marketplace: jobs.marketplace,
      imported: jobs.imported,
      createdAt: jobs.createdAt,
      clientName: clients.name,
    })
    .from(jobs)
    .leftJoin(clients, eq(jobs.clientId, clients.id))
    .where(and(ne(jobs.status, "draft"), type ? eq(jobs.type, type) : undefined))
    .orderBy(desc(jobs.id))
    .limit(limit);
}

export async function getJob(id: number) {
  await ensureDb();
  const [row] = await db.select({ job: jobs, clientName: clients.name }).from(jobs).leftJoin(clients, eq(jobs.clientId, clients.id)).where(eq(jobs.id, id));
  return row ?? null;
}

export async function getStatements() {
  await ensureDb();
  return db
    .select({ s: statements, clientName: clients.name, phone: clients.phone, contactName: clients.contactName })
    .from(statements)
    .innerJoin(clients, eq(statements.clientId, clients.id))
    .orderBy(desc(statements.month), desc(statements.id));
}

/** Everything the public client portal shows for one share token. */
export async function getPortal(token: string) {
  await ensureDb();
  if (!token || token.length < 16) return null;
  const [client] = await db.select().from(clients).where(eq(clients.shareToken, token));
  if (!client) return null;
  const items = await db
    .select({ id: products.id, name: products.name, nameAr: products.nameAr, sku: products.sku, stage: products.stage, marketplace: products.marketplace })
    .from(products)
    .where(eq(products.clientId, client.id))
    .orderBy(asc(products.name));
  const docs = await db
    .select({
      id: listings.id,
      productId: listings.productId,
      marketplace: listings.marketplace,
      status: listings.status,
      titleEn: listings.titleEn,
      titleAr: listings.titleAr,
      bulletsEn: listings.bulletsEn,
      bulletsAr: listings.bulletsAr,
      updatedAt: listings.updatedAt,
      productName: products.name,
    })
    .from(listings)
    .innerJoin(products, eq(listings.productId, products.id))
    .where(and(eq(products.clientId, client.id), ne(listings.status, "draft")))
    .orderBy(desc(listings.updatedAt));
  return { client: { name: client.name, plan: client.plan, quota: client.quota }, products: items, listings: docs };
}
