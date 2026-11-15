import { Info, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NewListingForm } from "@/components/NewListingForm";
import { DataTable, MarketBadge, PageHeader, ScoreBadge, StatusPill, Td, pname } from "@/components/ui";
import { getAiProvider } from "@/lib/ai";
import { MARKETPLACES, type Marketplace } from "@/lib/catalog";
import { getListings, getProductOptions } from "@/lib/data";
import { label, num, timeAgo } from "@/lib/i18n";
import { getI18n } from "@/lib/locale";
import { RULES } from "@/lib/rules";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI Listing Studio" };

/** What the compliance checker enforces, read straight from the rules it runs. */
function rulesOf(m: Marketplace) {
  const r = RULES[m];
  return {
    title: `${r.titleMin > 1 ? `${r.titleMin} to ${r.titleMax}` : `Up to ${r.titleMax}`} characters${r.titleSoft < r.titleMax ? `, aim for ${r.titleSoft}` : ""}`,
    brand: r.brand === "start" ? "Starts the title" : r.brand === "forbidden" ? "Not allowed in the title" : "Optional",
    bullets: `${r.bullets} bullets, up to ${r.bulletMax} characters each`,
    description: r.descMax ? `${r.descMin > 0 ? `${r.descMin} to ${num(r.descMax)}` : `Up to ${num(r.descMax)}`} characters` : r.descMin > 0 ? `${r.descMin} characters or more` : "No limit",
    hidden: r.terms?.kind === "bytes" ? `${r.terms.max} bytes` : r.terms?.kind === "tags" ? "Tags" : "None",
  };
}

export default async function StudioPage() {
  const [{ locale, t }, options, provider, listings] = await Promise.all([getI18n(), getProductOptions(), getAiProvider(), getListings()]);
  const recent = listings.slice(0, 5);

  return (
    <>
      <PageHeader title="AI Listing Studio" sub="Write a bilingual, marketplace-ready listing from a product brief, then check it against the marketplace's rules.">
        {provider && (
          <span className="pill pill-ok !h-8 !px-3">
            <Sparkles size={14} aria-hidden />
            {provider.label} · {provider.model}
          </span>
        )}
      </PageHeader>

      {!provider && (
        <aside className="mb-4 flex gap-3 rounded-2xl border border-amber-300 bg-amber-soft p-4 sm:p-5">
          <Info size={18} aria-hidden className="mt-0.5 shrink-0 text-amber-ink" />
          <div className="min-w-0">
            <h2 className="text-sm text-amber-ink">{t.listings.aiOffTitle}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-amber-900">{t.listings.aiOffBody}</p>
            <Link href="/settings" className="mt-2 inline-block text-sm font-medium text-amber-ink underline underline-offset-2">Open Settings & AI Key</Link>
          </div>
        </aside>
      )}

      <section className="card p-5 sm:p-6" aria-labelledby="new-listing">
        <h2 id="new-listing" className="h-section">{t.listings.newTitle}</h2>
        {options.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {t.listings.noProducts}{" "}
            <Link href="/pipeline?new=1" className="font-medium text-flow-green underline underline-offset-2">{t.pipeline.add}</Link>
          </p>
        ) : (
          <NewListingForm
            locale={locale}
            products={options.map((p) => ({ id: p.id, text: `${p.clientName} — ${pname(locale, p.name, p.nameAr)}`, marketplace: p.marketplace }))}
          />
        )}
      </section>

      <section className="mt-10" aria-labelledby="rules-title">
        <h2 id="rules-title" className="h-section mb-1">What each marketplace is checked against</h2>
        <p className="mb-4 max-w-3xl text-sm leading-relaxed text-muted-foreground">{t.editor.rulesNote}</p>
        <DataTable head={["Marketplace", "Title", "Brand name", "Bullet points", "Description", "Hidden keywords"]} minWidth={900}>
          {MARKETPLACES.map((m) => {
            const r = rulesOf(m);
            return (
              <tr key={m}>
                <Td><MarketBadge m={m} /></Td>
                <Td>{r.title}</Td>
                <Td>{r.brand}</Td>
                <Td>{r.bullets}</Td>
                <Td>{r.description}</Td>
                <Td>{r.hidden}</Td>
              </tr>
            );
          })}
        </DataTable>
      </section>

      {recent.length > 0 && (
        <section className="mt-10" aria-labelledby="recent-title">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="recent-title" className="h-section">Latest listings</h2>
            <Link href="/listings" className="shrink-0 rounded text-sm font-medium text-flow-green hover:underline">All listings</Link>
          </div>
          <ul className="card divide-y divide-border overflow-hidden">
            {recent.map((r) => (
              <li key={r.id}>
                <Link href={`/listings/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-muted">
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="block truncate text-sm text-foreground">{pname(locale, r.productName, r.productNameAr)}</span>
                    <span className="block truncate text-[13px] text-muted-foreground">{r.clientName}</span>
                  </span>
                  <MarketBadge m={r.marketplace} />
                  <StatusPill status={r.status} text={label(t.listingStatus, r.status)} />
                  <ScoreBadge score={r.score} labelText={t.common.score} />
                  <span className="w-24 text-end text-[13px] text-muted-foreground">{timeAgo(r.updatedAt, locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
