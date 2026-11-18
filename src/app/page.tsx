import { CheckCheck, Plus, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { GridPattern } from "@/components/Brand";
import { Empty, MarketBadge, PageHeader, RunItem, ScoreBadge, StatCard, pname, taskTitle } from "@/components/ui";
import { getClients, getOverview, getRuns, getTasks } from "@/lib/data";
import { getCashflowOverview, getGrowthOverview } from "@/lib/data-growth";
import { label, num, shortDate, tpl } from "@/lib/i18n";
import { getI18n } from "@/lib/locale";

export const dynamic = "force-dynamic";

const LINK = "shrink-0 rounded text-sm font-medium text-flow-green hover:underline";

export default async function OverviewPage() {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");

  const { locale, t } = await getI18n();
  const [o, g, cash, tasks, runs, clients] = await Promise.all([getOverview(), getGrowthOverview(), getCashflowOverview(), getTasks({ done: false, limit: 5 }), getRuns(6), getClients()]);
  const maxStage = Math.max(1, ...o.stages.map((s) => s.n));
  const withQuota = clients.filter((c) => c.quota).sort((a, b) => b.used / (b.quota ?? 1) - a.used / (a.quota ?? 1));
  const now = Date.now();

  return (
    <>
      <PageHeader title={t.overview.title} sub={t.overview.sub}>
        <Link href="/pipeline?new=1" className="btn btn-ghost">
          <Plus size={16} aria-hidden />
          {t.overview.addProduct}
        </Link>
        <Link href="/tools/listing" className="btn btn-primary">
          <Sparkles size={16} aria-hidden />
          Bulk Listing
        </Link>
      </PageHeader>

      {/* Brand panel: flat flow-green with the lime grid, as on the dashboard's sign-in screen */}
      <section className="panel-dark on-dark relative isolate overflow-hidden rounded-3xl p-6 sm:p-8" aria-labelledby="flow-title">
        <GridPattern id="overview-grid" />
        <div className="relative">
          <p className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-white/60 sm:text-sm sm:tracking-[0.25em]">{tpl(t.overview.flowCount, { n: o.totalProducts })}</p>
          <h2 id="flow-title" className="mt-3 max-w-xl text-balance text-3xl text-white sm:text-4xl">
            {t.brand.tagline}
          </h2>
          <ol className="mt-8 grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-3 xl:grid-cols-6">
            {o.stages.map((s, i) => (
              <li key={s.stage}>
                <Link href="/pipeline" className="group block rounded-lg">
                  <span className="font-display text-xs font-semibold text-white/60">0{i + 1}</span>
                  <span className="mt-1 block font-display text-4xl font-bold leading-none text-white">{s.n}</span>
                  <span className="mt-2 block text-sm leading-snug text-white/70 group-hover:text-white">{label(t.stage, s.stage)}</span>
                  <span className="mt-3 block h-1 overflow-hidden rounded-full bg-white/10">
                    <span className="block h-full rounded-full bg-flow-lime transition-[width] duration-500" style={{ width: `${(s.n / maxStage) * 100}%` }} />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mt-6" aria-labelledby="delivery-stats">
        <h2 id="delivery-stats" className="eyebrow mb-2.5">Delivery</h2>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard href="/tasks" label={`${t.nav.tasks} · ${t.tasks.open}`} value={num(o.openTasks)} hint={tpl(t.overview.overdue, { n: o.overdue })} />
          <StatCard href="/listings" label={t.overview.awaiting} value={num(o.awaiting)} hint={t.overview.awaitingHint} />
          <StatCard href="/clients" label={t.overview.retainers} value={num(o.retainers)} unit={t.common.egp} hint={tpl(t.overview.retainersHint, { n: o.activeClients })} />
          <StatCard href="/automations" label={t.overview.runs} value={num(o.runs7)} hint={tpl(t.overview.runsHint, { n: o.rulesOn })} />
        </div>
      </section>

      <section className="mt-6" aria-labelledby="growth-stats">
        <h2 id="growth-stats" className="eyebrow mb-2.5">Commerce and growth</h2>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard href="/leads" label="New leads" value={num(g.leadsNew)} hint="Not contacted yet" />
          <StatCard href="/orders" label="Orders, last 30 days" value={num(g.orders)} hint={`Revenue: ${num(g.revenue)} EGP`} />
          <StatCard href="/inventory" label="Low or out of stock" value={num(g.lowStock)} hint="At or under the reorder point" />
          <StatCard href="/reviews" label="Reviews to answer" value={num(g.reviewsOpen)} hint="3 stars or fewer" />
        </div>
      </section>

      <section className="mt-6" aria-labelledby="cashflow-title">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <h2 id="cashflow-title" className="eyebrow">Cashflow · {cash.month}</h2>
          <Link href="/billing" className={LINK}>View billing</Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="card p-5">
            <p className="text-[13px] text-mute">Collected this month</p>
            <p className="num mt-3 font-display text-3xl font-bold text-flow-green">{num(cash.collected)} <span className="text-sm font-medium text-mute">EGP</span></p>
          </div>
          <div className="card p-5">
            <p className="text-[13px] text-mute">Outstanding invoices</p>
            <p className="num mt-3 font-display text-3xl font-bold text-flow-green">{num(cash.outstanding)} <span className="text-sm font-medium text-mute">EGP</span></p>
          </div>
          <div className="card p-5">
            <p className="text-[13px] text-mute">Previous month collected</p>
            <p className="num mt-3 font-display text-3xl font-bold text-flow-green">{num(cash.previousCollected)} <span className="text-sm font-medium text-mute">EGP</span></p>
          </div>
        </div>
        <div className="card mt-4 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="h-section">Daily cash received</h3>
            <span className="num text-sm text-mute">{num(cash.collected)} EGP total</span>
          </div>
          <div className="mt-5 flex h-44 items-end gap-1.5 overflow-x-auto pb-1" role="img" aria-label="Daily collected cash chart">
            {cash.daily.map((d) => {
              const peak = Math.max(1, ...cash.daily.map((x) => x.amount));
              const height = d.amount ? Math.max(5, (d.amount / peak) * 100) : 2;
              return (
                <div key={d.day} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`Day ${d.day}: ${num(d.amount)} EGP`}>
                  <div className="w-full rounded-t bg-flow-green-light transition-opacity group-hover:opacity-70" style={{ height: `${height}%`, minHeight: d.amount ? 5 : 2 }} />
                  <span className="num text-[10px] text-mute">{d.day}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-mute">Only invoices marked as paid are counted. Marking an invoice paid records its collection date.</p>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="card p-5 sm:p-6" aria-labelledby="attn">
          <div className="flex items-center justify-between gap-3">
            <h2 id="attn" className="h-section">{t.overview.attention}</h2>
            <Link href="/tasks" className={LINK}>{t.overview.viewAll}</Link>
          </div>
          {tasks.length === 0 ? (
            <div className="mt-4">
              <Empty icon={<CheckCheck size={18} aria-hidden />}>{t.overview.noTasks}</Empty>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {tasks.map((task) => {
                const late = task.dueAt ? task.dueAt.getTime() < now : false;
                return (
                  <li key={task.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">{taskTitle(task, t)}</p>
                      <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                        {[pname(locale, task.productName, task.productNameAr), task.clientName, label(t.team, task.team)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {task.dueAt && <span className={`pill shrink-0 ${late ? "pill-bad" : "pill-mute"}`}>{late ? t.tasks.overdue : shortDate(task.dueAt, locale)}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card p-5 sm:p-6" aria-labelledby="runs">
          <div className="flex items-center justify-between gap-3">
            <h2 id="runs" className="h-section">{t.overview.recentRuns}</h2>
            <Link href="/automations" className={LINK}>{t.overview.viewAll}</Link>
          </div>
          {runs.length === 0 ? (
            <div className="mt-4">
              <Empty icon={<Zap size={18} aria-hidden />}>{t.overview.noRuns}</Empty>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {runs.map((run) => (
                <RunItem key={run.id} run={run} t={t} locale={locale} />
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5 sm:p-6" aria-labelledby="quota">
          <h2 id="quota" className="h-section">{t.overview.quota}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.overview.quotaSub}</p>
          {withQuota.length === 0 ? (
            <p className="mt-5 text-sm text-muted-foreground">{t.overview.noQuota}</p>
          ) : (
            <ul className="mt-5 flex flex-col gap-4">
              {withQuota.map((c) => {
                const pct = Math.min(100, Math.round((c.used / (c.quota ?? 1)) * 100));
                return (
                  <li key={c.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm text-foreground">
                        {c.name}
                        <span className="text-muted-foreground"> · {label(t.plan, c.plan)}</span>
                      </span>
                      <span className="num shrink-0 text-sm text-muted-foreground" dir="ltr">
                        {c.used} / {c.quota}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${pct}%`}>
                      <div className={`h-full rounded-full ${pct >= 90 ? "bg-warning" : "bg-flow-green-light"}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card p-5 sm:p-6" aria-labelledby="quality">
          <h2 id="quality" className="h-section">{t.overview.quality}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t.overview.qualitySub}</p>
          {o.quality.length === 0 ? (
            <p className="mt-5 text-sm text-muted-foreground">{t.overview.noListings}</p>
          ) : (
            <ul className="mt-5 flex flex-col gap-4">
              {o.quality.map((q) => (
                <li key={q.marketplace}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <MarketBadge m={q.marketplace} />
                      <span className="truncate text-[13px] text-muted-foreground">{tpl(t.overview.listingsCount, { n: q.n })}</span>
                    </span>
                    <ScoreBadge score={q.avg} labelText={t.common.score} />
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
                    <div className="h-full rounded-full bg-flow-green-light" style={{ width: `${q.avg}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
