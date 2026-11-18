import { MessageCircle, Users } from "lucide-react";
import type { Metadata } from "next";
import { ClientForm } from "@/components/ClientForm";
import { ShareLink } from "@/components/PortalClient";
import { DeleteClientButton } from "@/components/DeleteClientButton";
import { Empty, MarketBadge, PageHeader, StatusPill, SubNav } from "@/components/ui";
import { PLANS, waLink, type PlanId } from "@/lib/catalog";
import { getClients } from "@/lib/data";
import { label, num, tpl } from "@/lib/i18n";
import { getI18n } from "@/lib/locale";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Clients" };

const COLS = "xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1.1fr)_168px_minmax(0,1fr)_112px_96px_128px]";

export default async function ClientsPage() {
  const [{ locale, t }, clients] = await Promise.all([getI18n(), getClients()]);
  const c = t.clients;
  const cellLabel = "eyebrow mb-1 block xl:hidden";

  return (
    <>
      <PageHeader title={c.title} sub={c.sub} />
      <SubNav current="/clients" items={[{ href: "/clients", label: "Clients" }, { href: "/billing", label: "Billing" }]} />
      <ClientForm locale={locale} />

      {clients.length === 0 ? (
        <Empty icon={<Users size={18} aria-hidden />}>{c.empty}</Empty>
      ) : (
        <div className="card overflow-hidden">
          <div className={`hidden gap-4 border-b border-line bg-sage-soft px-5 py-3 text-[13px] font-medium text-mute xl:grid ${COLS}`} aria-hidden>
            <span>{t.common.client}</span>
            <span>{c.plan}</span>
            <span>{c.marketplaces}</span>
            <span>{c.usage}</span>
            <span>{c.fee}</span>
            <span>{c.share}</span>
            <span>{t.common.status}</span>
          </div>
          <ul className="divide-y divide-line">
            {clients.map((cl) => {
              const plan = PLANS[cl.plan as PlanId];
              const pct = cl.quota ? Math.min(100, Math.round((cl.used / cl.quota) * 100)) : 0;
              const over = cl.quota ? cl.used - cl.quota : 0;
              return (
                <li key={cl.id} className={`grid grid-cols-2 gap-x-4 gap-y-4 px-5 py-4 xl:items-center ${COLS}`}>
                  <div className="col-span-2 min-w-0 xl:col-span-1">
                    <p className="truncate text-[15px] font-semibold text-ink">{cl.name}</p>
                    <p className="truncate text-[13px] text-mute">
                      {cl.contactName}
                      {cl.contactName && cl.phone && " · "}
                      {cl.phone && <span dir="ltr">{cl.phone}</span>}
                    </p>
                    <p className="mt-1.5">
                      <ShareLink clientId={cl.id} token={cl.shareToken} name={cl.name} />
                    </p>
                  </div>
                  <div className="min-w-0">
                    <span className={cellLabel}>{c.plan}</span>
                    <p className="text-sm text-ink">{label(t.plan, cl.plan)}</p>
                    {cl.plan === "per_item" && <p className="mt-0.5 text-xs leading-snug text-mute">{c.perItemHint}</p>}
                  </div>
                  <div>
                    <span className={cellLabel}>{c.marketplaces}</span>
                    <ul className="flex flex-wrap gap-1.5">
                      {cl.marketplaces.map((m) => (
                        <li key={m}><MarketBadge m={m} /></li>
                      ))}
                    </ul>
                  </div>
                  <div className="min-w-0">
                    <span className={cellLabel}>{c.usage}</span>
                    {cl.quota ? (
                      <>
                        <p className="num text-sm text-ink" dir="ltr">{cl.used} / {cl.quota}</p>
                        <div className="mt-1.5 h-1.5 max-w-36 overflow-hidden rounded-full bg-sage" role="img" aria-label={`${pct}%`}>
                          <div className={`h-full rounded-full ${pct >= 90 ? "bg-amber-ink" : "bg-moss"}`} style={{ width: `${Math.max(pct, 2)}%` }} />
                        </div>
                        {over > 0 && plan?.extraItem && <p className="mt-1 text-xs text-amber-ink">{tpl(c.over, { n: over, p: plan.extraItem })}</p>}
                      </>
                    ) : (
                      <p className="text-sm text-ink">
                        <span className="num">{cl.used}</span> <span className="text-[13px] text-mute">· {c.noLimit}</span>
                      </p>
                    )}
                  </div>
                  <div>
                    <span className={cellLabel}>{c.fee}</span>
                    {cl.monthlyFee > 0 ? (
                      <p className="num text-sm text-ink">
                        {num(cl.monthlyFee)} <span className="text-[13px] text-mute">{t.common.egp}</span>
                      </p>
                    ) : (
                      <p className="text-sm text-mute">—</p>
                    )}
                  </div>
                  <div>
                    <span className={cellLabel}>{c.share}</span>
                    {cl.commissionPct > 0 ? (
                      <p className="text-sm text-ink">
                        <span className="num" dir="ltr">{cl.commissionPct}%</span>
                        {plan?.pctCap && <span className="block text-xs text-mute">{tpl(c.shareUpTo, { n: plan.pctCap })}</span>}
                      </p>
                    ) : (
                      <p className="text-sm text-mute">—</p>
                    )}
                  </div>
                  <div className="col-span-2 flex items-center justify-between gap-2 xl:col-span-1">
                    <StatusPill status={cl.status} text={label(t.clientStatus, cl.status)} />
                    <DeleteClientButton clientId={cl.id} clientName={cl.name} />
                    {cl.phone && (
                      <a href={waLink(cl.phone, "")} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-icon" aria-label={`${c.whatsapp}: ${cl.name}`} title={c.whatsapp}>
                        <MessageCircle size={15} aria-hidden />
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
