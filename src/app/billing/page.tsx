import { MessageCircle, Receipt } from "lucide-react";
import type { Metadata } from "next";
import { StatementActions, StatementForm } from "@/components/BillingClient";
import { Empty, PageHeader, SubNav } from "@/components/ui";
import { PLANS, waLink, type PlanId } from "@/lib/catalog";
import { getClients, getStatements } from "@/lib/data";
import { getSalesByClientMonth } from "@/lib/data-growth";
import { num } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Billing" };

const monthName = (m: string) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));

export default async function BillingPage() {
  const [clients, rows, orderSales] = await Promise.all([getClients(), getStatements(), getSalesByClientMonth()]);
  const thisMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
  const billedNow = rows.filter((r) => r.s.month === thisMonth).reduce((a, r) => a + r.s.total, 0);
  const outstanding = rows.filter((r) => !r.s.paid).reduce((a, r) => a + r.s.total, 0);
  const collected = rows.filter((r) => r.s.paid).reduce((a, r) => a + r.s.total, 0);

  const kpis = [
    { label: `Billed for ${monthName(thisMonth)}`, value: billedNow },
    { label: "Outstanding", value: outstanding },
    { label: "Collected", value: collected },
  ];

  return (
    <>
      <PageHeader title="Billing" sub="Monthly statements built from each plan: the fee, the share of sales, and items over the plan limit." />
      <SubNav current="/billing" items={[{ href: "/clients", label: "Clients" }, { href: "/billing", label: "Billing" }]} />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3" aria-label="Billing summary">
        {kpis.map((k) => (
          <div key={k.label} className="card p-5">
            <p className="text-[13px] text-mute">{k.label}</p>
            <p className="num mt-3 font-display text-3xl font-bold leading-none text-flow-green">
              {num(k.value)}
              <span className="ms-1.5 text-sm font-medium text-mute">EGP</span>
            </p>
          </div>
        ))}
      </section>

      <div className="mt-4 grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="statements">
          <h2 id="statements" className="sr-only">Statements</h2>
          {rows.length === 0 ? (
            <Empty icon={<Receipt size={18} aria-hidden />}>No statements yet. Enter a client&apos;s sales for the month to create the first one.</Empty>
          ) : (
            <ul className="flex flex-col gap-3">
              {rows.map(({ s, clientName, phone, contactName }) => {
                const share = Math.round((s.sales * s.pct) / 100);
                const extra = s.extraItems * s.extraRate;
                const message = `أهلاً ${contactName || ""}، ده كشف حساب FLOW عن شهر ${s.month}:\nالاشتراك الشهري: ${num(s.fee)} ج.م\nنسبة المبيعات (${s.pct}% من ${num(s.sales)}): ${num(share)} ج.م${extra ? `\nمنتجات إضافية (${s.extraItems} × ${s.extraRate}): ${num(extra)} ج.م` : ""}\nالإجمالي: ${num(s.total)} ج.م`;
                return (
                  <li key={s.id} className="card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-semibold text-ink">{clientName}</h3>
                        <p className="text-[13px] text-mute">{monthName(s.month)}</p>
                      </div>
                      <p className="num text-xl font-semibold text-ink">
                        {num(s.total)} <span className="text-[13px] font-medium text-mute">EGP</span>
                      </p>
                    </div>
                    <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                      <div>
                        <dt className="text-[13px] text-mute">Monthly fee</dt>
                        <dd className="num text-ink">{num(s.fee)}</dd>
                      </div>
                      <div>
                        <dt className="text-[13px] text-mute">Sales share · {s.pct}% of {num(s.sales)}</dt>
                        <dd className="num text-ink">{num(share)}</dd>
                      </div>
                      <div>
                        <dt className="text-[13px] text-mute">Extra items · {s.extraItems} × {s.extraRate}</dt>
                        <dd className="num text-ink">{num(extra)}</dd>
                      </div>
                    </dl>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3.5">
                      <span className={`pill ${s.paid ? "pill-ok" : "pill-warn"}`}>{s.paid ? "Paid" : "Unpaid"}</span>
                      <span className="inline-flex flex-wrap items-center gap-3">
                        {phone && (
                          <a href={waLink(phone, message)} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                            <MessageCircle size={14} aria-hidden />
                            Send on WhatsApp
                          </a>
                        )}
                        <StatementActions id={s.id} paid={s.paid} label={`${clientName} ${monthName(s.month)}`} />
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card p-5 sm:p-6" aria-labelledby="new-statement">
          <h2 id="new-statement" className="h-section">New statement</h2>
          <p className="mb-4 mt-1 text-[13px] leading-relaxed text-mute">Type the month's sales, or use the total of the orders logged in Orders. Nothing is pulled from a marketplace.</p>
          <StatementForm
            month={thisMonth}
            orderSales={orderSales}
            clients={clients.map((c) => {
              const plan = PLANS[c.plan as PlanId];
              return { id: c.id, name: c.name, fee: c.monthlyFee, pct: c.commissionPct, pctCap: plan?.pctCap ?? null, overQuota: c.quota ? Math.max(0, c.used - c.quota) : 0, extraRate: plan?.extraItem ?? 0 };
            })}
          />
        </section>
      </div>
    </>
  );
}
