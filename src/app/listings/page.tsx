import { FileText, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Empty, FilterTabs, MarketBadge, PageHeader, ScoreBadge, StatusPill, pname } from "@/components/ui";
import { LISTING_STATUSES } from "@/lib/catalog";
import { getListings } from "@/lib/data";
import { label, timeAgo } from "@/lib/i18n";
import { getI18n } from "@/lib/locale";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Listings" };

const COLS = "md:grid-cols-[minmax(0,1fr)_128px_118px_56px_150px_104px]";

export default async function ListingsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const [{ locale, t }, sp] = await Promise.all([getI18n(), searchParams]);
  const status = (LISTING_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status : undefined;
  const rows = await getListings(status);

  return (
    <>
      <PageHeader title={t.listings.title} sub={t.listings.sub}>
        <Link href="/studio" className="btn btn-primary">
          <Sparkles size={16} aria-hidden />
          {t.overview.newListing}
        </Link>
      </PageHeader>

      <FilterTabs
        label={t.common.status}
        tabs={[{ href: "/listings", label: t.common.all, active: !status }, ...LISTING_STATUSES.map((s) => ({ href: `/listings?status=${s}`, label: t.listingStatus[s], active: status === s }))]}
      />

      {rows.length === 0 ? (
        <Empty icon={<FileText size={18} aria-hidden />}>{t.listings.empty}</Empty>
      ) : (
        <div className="card overflow-hidden">
          <div className={`hidden gap-4 border-b border-border bg-sage-soft px-5 py-3 text-[13px] text-muted-foreground md:grid ${COLS}`} aria-hidden>
            <span>{t.common.product}</span>
            <span>{t.common.marketplace}</span>
            <span>{t.common.status}</span>
            <span>{t.common.score}</span>
            <span>{t.listings.engine}</span>
            <span>{t.common.updated}</span>
          </div>
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/listings/${r.id}`} className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-muted md:grid ${COLS}`}>
                  <span className="min-w-0 basis-full">
                    <span className="block truncate text-sm text-foreground">{pname(locale, r.productName, r.productNameAr)}</span>
                    <span className="block truncate text-[13px] text-muted-foreground">{r.clientName}</span>
                  </span>
                  <span><MarketBadge m={r.marketplace} /></span>
                  <span><StatusPill status={r.status} text={label(t.listingStatus, r.status)} /></span>
                  <span><ScoreBadge score={r.score} labelText={t.common.score} /></span>
                  <span className="truncate text-[13px] text-muted-foreground">
                    {r.engine === "ai" && r.model ? <span dir="ltr">{r.model}</span> : label(t.engine, r.engine)}
                    {r.edited && <span> · {t.editor.edited}</span>}
                  </span>
                  <span className="text-[13px] text-muted-foreground">{timeAgo(r.updatedAt, locale)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
