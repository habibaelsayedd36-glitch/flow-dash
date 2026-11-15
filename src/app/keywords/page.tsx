import { TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { createKeywordsAction, deleteKeywordAction, logRankAction } from "@/app/actions-growth";
import { DeleteButton, InlineEdit, Toolbar } from "@/components/Crud";
import { ClientFilter, DataTable, Empty, MarketBadge, PageHeader, SourceNote, StatCard, Td } from "@/components/ui";
import { MARKETPLACES, MARKETPLACE_META } from "@/lib/catalog";
import { getClients, getProductOptions } from "@/lib/data";
import { getKeywords, type Coverage } from "@/lib/data-growth";
import { num, timeAgo } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Keywords & Ranks" };

const COVERAGE: Record<Coverage["state"], { text: string; cls: string }> = {
  title: { text: "In the title", cls: "pill-ok" },
  copy: { text: "In the copy", cls: "pill-ok" },
  backend: { text: "Backend terms only", cls: "pill-mute" },
  missing: { text: "Missing", cls: "pill-warn" },
  no_listing: { text: "No listing yet", cls: "pill-mute" },
};

/** Rank history as a small line. Position 1 is the top of the chart. */
function Spark({ ranks }: { ranks: number[] }) {
  if (ranks.length < 2) return <span className="text-[13px] text-muted-foreground">—</span>;
  const w = 88;
  const h = 28;
  const min = Math.min(...ranks);
  const span = Math.max(1, Math.max(...ranks) - min);
  const points = ranks.map((r, i) => `${(i / (ranks.length - 1)) * (w - 4) + 2},${((r - min) / span) * (h - 8) + 4}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`Positions over time: ${ranks.join(", ")}`} className="text-flow-green-light">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function KeywordsPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const sp = await searchParams;
  const clientId = Number(sp.client) || undefined;
  const [clients, productOpts, rows] = await Promise.all([getClients(), getProductOptions(), getKeywords(clientId)]);
  const clientOpts = clients.map((c) => ({ id: c.id, name: c.name }));
  const ranked = rows.filter((r) => r.latest !== null);
  const improved = rows.filter((r) => r.latest !== null && r.previous !== null && r.latest < r.previous).length;

  return (
    <>
      <PageHeader title="Keywords & Ranks" sub="The search terms each product should win, where it ranks, and whether the listing covers them." />
      <SourceNote>
        Positions are logged by your team after searching the marketplace, or imported from a rank tracker. They are not checked automatically. Listing coverage is worked out from
        the listings saved in this dashboard.
      </SourceNote>

      <section className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4" aria-label="Keyword summary">
        <StatCard label="Keywords tracked" value={num(rows.length)} hint={`With a logged position: ${ranked.length}`} />
        <StatCard label="In the top 10" value={num(ranked.filter((r) => (r.latest ?? 99) <= 10).length)} hint="By the latest check" />
        <StatCard label="Improved" value={num(improved)} hint="Since the check before" />
        <StatCard label="Missing from the listing" value={num(rows.filter((r) => r.coverage.state === "missing").length)} hint="A word is not in the listing at all" />
      </section>

      <Toolbar
        add={{
          button: "Track keywords",
          title: "Track keywords",
          submit: "Track keywords",
          action: createKeywordsAction,
          fields: [
            { name: "productId", label: "Product", type: "select", required: true, wide: true, options: productOpts.map((p) => ({ value: String(p.id), label: `${p.clientName} — ${p.name}` })) },
            { name: "marketplace", label: "Marketplace", type: "select", options: MARKETPLACES.map((m) => ({ value: m, label: MARKETPLACE_META[m].label })) },
            { name: "keywords", label: "Keywords, one per line", type: "textarea", required: true, placeholder: "usb c charger\nشاحن سريع" },
          ],
        }}
        importer={{ type: "keywords", clients: clientOpts, marketplace: true, template: "/samples/keywords-template.csv", columns: "keyword, rank, sku" }}
      >
        <ClientFilter clients={clientOpts} value={clientId} />
      </Toolbar>

      {rows.length === 0 ? (
        <Empty icon={<TrendingUp size={18} aria-hidden />}>No keywords tracked yet. Add the terms a product should rank for, then log its position each week.</Empty>
      ) : (
        <DataTable head={["Keyword", "Product", "Position", "Best", "Trend", "In the listing", "Log a position", ""]} minWidth={1080}>
          {rows.map((r) => {
            const change = r.latest !== null && r.previous !== null ? r.previous - r.latest : 0;
            const cov = COVERAGE[r.coverage.state];
            return (
              <tr key={r.id}>
                <Td>
                  <span className="block text-foreground" dir="auto">{r.keyword}</span>
                  <span className="mt-1.5 block"><MarketBadge m={r.marketplace} /></span>
                </Td>
                <Td>
                  <span className="block text-foreground">{r.productName ?? "Not linked to a product"}</span>
                  <span className="block text-[13px] text-muted-foreground">{r.clientName}</span>
                </Td>
                <Td className="whitespace-nowrap">
                  {r.latest === null ? (
                    <span className="text-[13px] text-muted-foreground">Not logged</span>
                  ) : (
                    <>
                      <span className="num font-display text-base font-bold text-flow-green">{r.latest}</span>
                      {change !== 0 && (
                        <span className={`pill ms-2 num ${change > 0 ? "pill-ok" : "pill-bad"}`}>
                          <span className="sr-only">{change > 0 ? "Up" : "Down"} </span>
                          {change > 0 ? "▲" : "▼"} {Math.abs(change)}
                        </span>
                      )}
                      {r.checkedAt && <span className="block text-[13px] text-muted-foreground">{timeAgo(r.checkedAt, "en")}</span>}
                    </>
                  )}
                </Td>
                <Td className="num">{r.best ?? "—"}</Td>
                <Td><Spark ranks={r.ranks} /></Td>
                <Td>
                  <span className={`pill !h-auto !whitespace-normal py-1 text-start leading-snug ${cov.cls}`}>
                    {r.coverage.missing.length > 0 ? `${cov.text}: ${r.coverage.missing.join(", ")}` : cov.text}
                  </span>
                  {r.coverage.listingId && (
                    <Link href={`/listings/${r.coverage.listingId}`} className="mt-1.5 block text-[13px] font-medium text-flow-green hover:underline">
                      Open the listing
                    </Link>
                  )}
                </Td>
                <Td className="min-w-48">
                  <InlineEdit label={`Log a position for ${r.keyword}`} submit="Log" clearOnSave action={logRankAction.bind(null, r.id)} fields={[{ name: "rank", label: "Position", min: 1, max: 1000 }]} />
                </Td>
                <Td>
                  <DeleteButton label={`Stop tracking ${r.keyword}`} confirm="Stop tracking this keyword and delete its history?" action={deleteKeywordAction.bind(null, r.id)} />
                </Td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </>
  );
}
