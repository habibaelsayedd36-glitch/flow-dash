import { HeartPulse, Star } from "lucide-react";
import type { Metadata } from "next";
import { createReviewAction, deleteReviewAction, saveHealthAction } from "@/app/actions-growth";
import { DeleteButton, Toolbar } from "@/components/Crud";
import { ReviewReply } from "@/components/GrowthClient";
import { ClientFilter, Empty, MarketBadge, PageHeader, SourceNote, Stars, StatCard } from "@/components/ui";
import { getAiProvider } from "@/lib/ai";
import { MARKETPLACES, MARKETPLACE_META } from "@/lib/catalog";
import { getClients, getProductOptions } from "@/lib/data";
import { getHealth, getReviews } from "@/lib/data-growth";
import { num, shortDate, timeAgo } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reviews & Health" };

/** Amazon's published account-health targets. */
const TARGETS = [
  { key: "odr", label: "Order defect rate", target: "under 1%", ok: (v: number) => v < 1 },
  { key: "lateShipment", label: "Late shipment rate", target: "under 4%", ok: (v: number) => v < 4 },
  { key: "cancelRate", label: "Pre-fulfilment cancel rate", target: "under 2.5%", ok: (v: number) => v < 2.5 },
  { key: "validTracking", label: "Valid tracking rate", target: "over 95%", ok: (v: number) => v > 95 },
] as const;

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const sp = await searchParams;
  const clientId = Number(sp.client) || undefined;
  const [clients, productOpts, rows, health, provider] = await Promise.all([getClients(), getProductOptions(), getReviews(clientId), getHealth(clientId), getAiProvider()]);
  const clientOpts = clients.map((c) => ({ id: c.id, name: c.name }));
  const clientSelect = clients.map((c) => ({ value: String(c.id), label: c.name }));
  const marketSelect = MARKETPLACES.map((m) => ({ value: m, label: MARKETPLACE_META[m].label }));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());

  const average = rows.length ? Math.round((rows.reduce((a, r) => a + r.r.rating, 0) / rows.length) * 10) / 10 : null;
  const needReply = rows.filter((r) => r.r.rating <= 3 && r.r.status === "new").length;
  const low = rows.filter((r) => r.r.rating <= 2).length;

  return (
    <>
      <PageHeader title="Reviews & Health" sub="Customer reviews that need an answer, and the account-health figures that keep a seller account open." />
      <div className="mb-6">
        <ClientFilter clients={clientOpts} value={clientId} />
      </div>

      <section aria-labelledby="health-title">
        <h2 id="health-title" className="h-section">Account health</h2>
        <SourceNote>
          Copy these figures from the Account Health page of the seller portal. They are not read from the account. Targets shown are Amazon&apos;s published ones; other
          marketplaces set their own.
        </SourceNote>
        <Toolbar
          add={{
            button: "Log a health check",
            title: "Log a health check",
            submit: "Save health check",
            action: saveHealthAction,
            fields: [
              { name: "clientId", label: "Client", type: "select", required: true, options: clientSelect },
              { name: "marketplace", label: "Marketplace", type: "select", options: marketSelect },
              { name: "odr", label: "Order defect rate (%)", type: "number", min: 0, max: 100, step: 0.01, required: true },
              { name: "lateShipment", label: "Late shipment rate (%)", type: "number", min: 0, max: 100, step: 0.01, required: true },
              { name: "cancelRate", label: "Pre-fulfilment cancel rate (%)", type: "number", min: 0, max: 100, step: 0.01, required: true },
              { name: "validTracking", label: "Valid tracking rate (%)", type: "number", min: 0, max: 100, step: 0.01, required: true },
              { name: "violations", label: "Open policy violations", type: "number", min: 0, defaultValue: "0" },
            ],
          }}
        />
        {health.length === 0 ? (
          <Empty icon={<HeartPulse size={18} aria-hidden />}>No health checks logged yet. Log one for each seller account you manage.</Empty>
        ) : (
          <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {health.map(({ h, clientName }) => {
              const failing = TARGETS.filter((t) => !t.ok(h[t.key]));
              const healthy = failing.length === 0 && h.violations === 0;
              return (
                <li key={h.id} className="card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-base text-flow-green">{clientName}</h3>
                      <span className="mt-1.5 block"><MarketBadge m={h.marketplace} /></span>
                    </div>
                    <span className={`pill shrink-0 ${healthy ? "pill-ok" : "pill-bad"}`}>{healthy ? "Healthy" : "At risk"}</span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                    {TARGETS.map((t) => {
                      const ok = t.ok(h[t.key]);
                      return (
                        <div key={t.key}>
                          <dt className="text-[13px] leading-snug text-muted-foreground">{t.label}</dt>
                          <dd className={`num mt-0.5 font-display text-lg font-bold ${ok ? "text-flow-green" : "text-destructive"}`}>
                            {h[t.key]}%
                            <span className="ms-1.5 font-body text-xs font-normal text-muted-foreground">{ok ? `target ${t.target}` : `misses the target, ${t.target}`}</span>
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                  <p className="mt-4 border-t border-border pt-3 text-[13px] text-muted-foreground">
                    Open policy violations: <span className={h.violations > 0 ? "text-destructive" : ""}>{h.violations}</span> · Checked {timeAgo(h.checkedAt, "en")}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-10" aria-labelledby="reviews-title">
        <h2 id="reviews-title" className="h-section">Reviews</h2>
        <SourceNote>Reviews are logged by hand or imported. Replies are written here and posted by a person in the seller portal. Nothing is posted for you.</SourceNote>

        <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard label="Average rating" value={average === null ? "—" : String(average)} unit={average === null ? undefined : "of 5"} hint={`Reviews logged: ${rows.length}`} />
          <StatCard label="Need a reply" value={num(needReply)} hint="3 stars or fewer, not answered" />
          <StatCard label="1 and 2 stars" value={num(low)} hint={rows.length ? `${Math.round((low / rows.length) * 100)}% of all reviews` : "No reviews yet"} />
          <StatCard label="Answered" value={num(rows.filter((r) => r.r.status !== "new").length)} hint="Replied or resolved" />
        </div>

        <Toolbar
          add={{
            button: "Add review",
            title: "Add a review",
            submit: "Add review",
            action: createReviewAction,
            fields: [
              { name: "clientId", label: "Client", type: "select", required: true, options: clientSelect },
              { name: "productId", label: "Product", type: "select", wide: true, options: [{ value: "", label: "Not linked to a product" }, ...productOpts.map((p) => ({ value: String(p.id), label: `${p.clientName} — ${p.name}` }))] },
              { name: "marketplace", label: "Marketplace", type: "select", options: marketSelect },
              { name: "rating", label: "Rating", type: "select", required: true, options: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} of 5` })) },
              { name: "date", label: "Review date", type: "date", defaultValue: today },
              { name: "author", label: "Reviewer" },
              { name: "body", label: "Review text", type: "textarea" },
            ],
          }}
          importer={{ type: "reviews", clients: clientOpts, marketplace: true, template: "/samples/reviews-template.csv", columns: "rating, review, reviewer, date, sku" }}
        />

        {rows.length === 0 ? (
          <Empty icon={<Star size={18} aria-hidden />}>No reviews logged yet. Add the ones that need an answer, or import a review export.</Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map(({ r, clientName, productName }) => {
              const state = r.status === "replied" ? { text: "Replied", cls: "pill-ok" } : r.status === "resolved" ? { text: "Resolved", cls: "pill-mute" } : r.rating <= 3 ? { text: "Needs a reply", cls: "pill-warn" } : { text: "New", cls: "pill-mute" };
              return (
                <li key={r.id} className="card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <Stars rating={r.rating} />
                      <span className="text-sm text-foreground" dir="auto">{r.author || "Customer"}</span>
                      <span className="text-[13px] text-muted-foreground">{shortDate(r.reviewedAt, "en")}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`pill ${state.cls}`}>{state.text}</span>
                      <DeleteButton label={`Delete the review by ${r.author || "customer"}`} confirm="Delete this review?" action={deleteReviewAction.bind(null, r.id)} />
                    </div>
                  </div>
                  {r.body && <p className="mt-3 text-sm leading-relaxed text-foreground" dir="auto">{r.body}</p>}
                  <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                    <MarketBadge m={r.marketplace} />
                    <span>{[clientName, productName].filter(Boolean).join(" · ")}</span>
                  </p>
                  {r.reply && (
                    <div className="mt-3 rounded-2xl bg-flow-bg-soft px-4 py-3">
                      <p className="eyebrow mb-1">Reply</p>
                      <p className="text-sm leading-relaxed text-foreground" dir="auto">{r.reply}</p>
                    </div>
                  )}
                  <ReviewReply id={r.id} status={r.status} reply={r.reply} aiReady={provider !== null} />
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
