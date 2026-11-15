import { CheckCheck, Mail, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Brand } from "@/components/Brand";
import { PortalActions } from "@/components/PortalClient";
import { Empty, MarketBadge, StatusPill } from "@/components/ui";
import { STAGES } from "@/lib/catalog";
import { getPortal } from "@/lib/data";
import { dictFor, label, shortDate } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Flow Space", robots: { index: false, follow: false } };

/** Public, read-only page for one client. The token in the URL is the only credential. */
export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getPortal(token);
  if (!data) notFound();
  const t = dictFor("en");
  const waiting = data.listings.filter((l) => l.status === "review");
  const decided = data.listings.filter((l) => l.status !== "review");
  const max = Math.max(1, ...STAGES.map((s) => data.products.filter((p) => p.stage === s).length));

  return (
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6">
        <Brand product="Space" />
        <span className="text-sm text-muted-foreground">Client portal</span>
      </header>

      <section className="mt-8">
        <p className="eyebrow">{label(t.plan, data.client.plan)}</p>
        <h1 className="h-page mt-1.5">{data.client.name}</h1>
        <p className="mt-2 max-w-xl text-mute">Where each of your products is right now, and the listings waiting for your approval before they go live.</p>
      </section>

      <section className="mt-6 rounded-3xl bg-flow-lime p-6 text-flow-green sm:p-8" aria-labelledby="progress">
        <h2 id="progress" className="font-display text-sm font-semibold uppercase leading-snug tracking-[0.25em] text-flow-green/70">Your products: {data.products.length}</h2>
        <ol className="mt-5 grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
          {STAGES.map((s, i) => {
            const n = data.products.filter((p) => p.stage === s).length;
            return (
              <li key={s}>
                <span className="font-display text-xs font-semibold text-flow-green/60">0{i + 1}</span>
                <span className="mt-1 block font-display text-4xl font-bold leading-none text-flow-green">{n}</span>
                <span className="mt-2 block text-sm leading-snug text-flow-green/80">{t.stage[s]}</span>
                <span className="mt-3 block h-1 overflow-hidden rounded-full bg-flow-green/15">
                  <span className="block h-full rounded-full bg-flow-green" style={{ width: `${(n / max) * 100}%` }} />
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="mt-10" aria-labelledby="waiting">
        <h2 id="waiting" className="h-section">Waiting for your approval</h2>
        {waiting.length === 0 ? (
          <div className="mt-4">
            <Empty icon={<CheckCheck size={18} aria-hidden />}>Nothing needs your approval right now. We will let you know when a listing is ready.</Empty>
          </div>
        ) : (
          <ul className="mt-4 flex flex-col gap-4">
            {waiting.map((l) => (
              <li key={l.id} className="card p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[15px] font-semibold text-ink">{l.productName}</h3>
                  <MarketBadge m={l.marketplace} />
                </div>
                <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
                  <div lang="en" dir="ltr" className="min-w-0">
                    <p className="eyebrow mb-1.5">English</p>
                    <p className="text-sm font-medium leading-snug text-ink">{l.titleEn}</p>
                    <ul className="mt-2.5 flex list-disc flex-col gap-1 ps-5 text-sm leading-relaxed text-mute">
                      {l.bulletsEn.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </div>
                  <div lang="ar" dir="rtl" className="min-w-0">
                    <p className="eyebrow mb-1.5">العربية</p>
                    <p className="text-sm font-semibold leading-relaxed text-ink">{l.titleAr || "—"}</p>
                    <ul className="mt-2.5 flex list-disc flex-col gap-1 ps-5 text-sm leading-relaxed text-mute">
                      {l.bulletsAr.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <PortalActions token={token} listingId={l.id} productName={l.productName} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {decided.length > 0 && (
        <section className="mt-10" aria-labelledby="decided">
          <h2 id="decided" className="h-section">Approved and published</h2>
          <ul className="card mt-4 divide-y divide-line overflow-hidden">
            {decided.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5">
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{l.productName}</span>
                <MarketBadge m={l.marketplace} />
                <StatusPill status={l.status} text={label(t.listingStatus, l.status)} />
                <span className="text-[13px] text-mute">{shortDate(l.updatedAt, "en")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10" aria-labelledby="all-products">
        <h2 id="all-products" className="h-section">All products</h2>
        {data.products.length === 0 ? (
          <p className="mt-3 text-sm text-mute">No products have been received yet.</p>
        ) : (
          <ul className="card mt-4 divide-y divide-line overflow-hidden">
            {data.products.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-5 py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-ink">{p.name}</span>
                  {p.sku && <span className="block text-[13px] text-mute">{p.sku}</span>}
                </span>
                <MarketBadge m={p.marketplace} />
                <span className="pill pill-mute">{label(t.stage, p.stage)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-sm text-mute">
        <p>Questions? Your FLOW account manager is one message away.</p>
        <div className="flex flex-wrap gap-2">
          <a href="https://wa.me/201550408340" target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
            <MessageCircle size={14} aria-hidden />
            WhatsApp
          </a>
          <a href="mailto:flowagency.eg@gmail.com" className="btn btn-ghost btn-sm">
            <Mail size={14} aria-hidden />
            Email
          </a>
        </div>
      </footer>
    </div>
  );
}
