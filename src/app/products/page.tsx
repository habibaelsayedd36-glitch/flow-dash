import { and, asc, count, eq, ilike, or } from "drizzle-orm";
import { Boxes, Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { ensureDb } from "@/db/ensure";
import { clients, listings, products } from "@/db/schema";
import { MARKETPLACES, STAGES } from "@/lib/catalog";
import { label } from "@/lib/i18n";
import { getI18n } from "@/lib/locale";
import { Empty, MarketBadge, PageHeader, StatCard, Td } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Product Catalog" };

const stageLabel: Record<string, string> = {
  intake: "Intake",
  content: "Content",
  optimization: "Optimization",
  publishing: "Publishing",
  management: "Management",
  growth: "Growth",
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; client?: string; marketplace?: string }>;
}) {
  const [{ locale }, sp] = await Promise.all([getI18n(), searchParams]);
  await ensureDb();

  const q = (sp.q ?? "").trim().slice(0, 100);
  const clientId = Number(sp.client) || undefined;
  const marketplace = MARKETPLACES.includes(sp.marketplace as (typeof MARKETPLACES)[number]) ? sp.marketplace : undefined;

  const filters = [
    clientId ? eq(products.clientId, clientId) : undefined,
    marketplace ? eq(products.marketplace, marketplace) : undefined,
    q ? or(ilike(products.name, `%${q}%`), ilike(products.brand, `%${q}%`), ilike(products.sku, `%${q}%`)) : undefined,
  ].filter(Boolean);

  const [rows, clientsList, totals] = await Promise.all([
    db.select({
      id: products.id,
      name: products.name,
      nameAr: products.nameAr,
      brand: products.brand,
      sku: products.sku,
      category: products.category,
      marketplace: products.marketplace,
      stage: products.stage,
      clientId: products.clientId,
      clientName: clients.name,
      listingCount: count(listings.id),
    })
      .from(products)
      .innerJoin(clients, eq(products.clientId, clients.id))
      .leftJoin(listings, eq(listings.productId, products.id))
      .where(filters.length ? and(...filters) : undefined)
      .groupBy(products.id, clients.name)
      .orderBy(asc(clients.name), asc(products.name)),
    db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(asc(clients.name)),
    db.select({ total: count() }).from(products),
  ]);

  const stageCounts = STAGES.map((stage) => ({
    stage,
    n: rows.filter((row) => row.stage === stage).length,
  }));
  const total = totals[0]?.total ?? 0;

  return (
    <>
      <PageHeader title="Product Catalog" sub="One searchable master list of every product across your clients and marketplaces.">
        <Link href="/pipeline" className="btn btn-primary"><Plus size={16} aria-hidden /> Add product</Link>
      </PageHeader>

      <section className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Catalog summary">
        <StatCard label="All products" value={String(total)} hint="Across every client" />
        <StatCard label="Matching products" value={String(rows.length)} hint="Current filters" />
        <StatCard label="With listings" value={String(rows.filter((row) => row.listingCount > 0).length)} hint="At least one listing created" />
        <StatCard label="Brands" value={String(new Set(rows.map((row) => row.brand.trim().toLowerCase()).filter(Boolean)).size)} hint="In this view" />
      </section>

      <form method="get" className="card mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1">
          <span className="label">Search products</span>
          <span className="relative block">
            <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input name="q" defaultValue={q} placeholder="Product, brand or SKU" className="field ps-9" />
          </span>
        </label>
        <label className="sm:w-56">
          <span className="label">Client</span>
          <select name="client" defaultValue={clientId ?? ""} className="field">
            <option value="">All clients</option>
            {clientsList.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
        <label className="sm:w-44">
          <span className="label">Marketplace</span>
          <select name="marketplace" defaultValue={marketplace ?? ""} className="field">
            <option value="">All marketplaces</option>
            {MARKETPLACES.map((market) => <option key={market} value={market}>{market === "tiktok" ? "TikTok Shop" : market[0].toUpperCase() + market.slice(1)}</option>)}
          </select>
        </label>
        <button className="btn btn-primary" type="submit">Apply filters</button>
        <Link href="/products" className="btn btn-ghost">Reset</Link>
      </form>

      {rows.length === 0 ? (
        <Empty icon={<Boxes size={18} aria-hidden />}>No products match these filters. Add products from the Studio Pipeline or clear your search.</Empty>
      ) : (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-sage-soft px-5 py-3">
            <p className="text-sm font-semibold text-flow-green">Product master list</p>
            <p className="num text-xs text-muted-foreground">{rows.length} products</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-start text-sm">
              <thead className="bg-card text-xs text-muted-foreground">
                <tr>
                  {["Product / SKU", "Brand", "Client", "Category", "Marketplace", "Pipeline stage", "Listings"].map((heading) => <th key={heading} className="px-5 py-3 text-start font-medium">{heading}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-muted/60">
                    <td className="px-5 py-4">
                      <Link href={`/studio?product=${row.id}`} className="font-medium text-foreground hover:text-flow-green">{locale === "ar" && row.nameAr ? row.nameAr : row.name}</Link>
                      <span className="mt-1 block text-xs text-muted-foreground" dir="ltr">{row.sku || "No SKU"}</span>
                    </td>
                    <td className="px-5 py-4">{row.brand || "—"}</td>
                    <td className="px-5 py-4">{row.clientName}</td>
                    <td className="px-5 py-4 capitalize">{row.category}</td>
                    <td className="px-5 py-4"><MarketBadge m={row.marketplace} /></td>
                    <td className="px-5 py-4"><span className="pill pill-mute">{stageLabel[row.stage] ?? row.stage}</span></td>
                    <td className="px-5 py-4 num">{row.listingCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
