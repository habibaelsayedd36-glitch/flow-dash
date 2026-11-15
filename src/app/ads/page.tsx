import { Megaphone } from "lucide-react";
import type { Metadata } from "next";
import { deleteCampaignAction, saveCampaignAction } from "@/app/actions-growth";
import { DeleteButton, Toolbar } from "@/components/Crud";
import { DataTable, Empty, MarketBadge, PageHeader, SourceNote, StatCard, Td } from "@/components/ui";
import { MARKETPLACES, MARKETPLACE_META, cairoMonth, monthName, prevMonth } from "@/lib/catalog";
import { getClients } from "@/lib/data";
import { getCampaigns, getSalesByClientMonth } from "@/lib/data-growth";
import { num } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Advertising" };

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const show = (v: number | null, suffix = "%") => (v === null ? "—" : `${v}${suffix}`);

export default async function AdsPage({ searchParams }: { searchParams: Promise<{ client?: string; month?: string }> }) {
  const sp = await searchParams;
  const clientId = Number(sp.client) || undefined;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? "") ? (sp.month as string) : cairoMonth();
  const before = prevMonth(month);
  const [clients, rows, last, salesByMonth] = await Promise.all([getClients(), getCampaigns(month, clientId), getCampaigns(before, clientId), getSalesByClientMonth()]);
  const clientOpts = clients.map((c) => ({ id: c.id, name: c.name }));

  const sum = (list: typeof rows, key: "spend" | "sales") => list.reduce((a, r) => a + r.c[key], 0);
  const spend = sum(rows, "spend");
  const sales = sum(rows, "sales");
  const acos = pct(spend, sales);
  const lastAcos = pct(sum(last, "spend"), sum(last, "sales"));
  // TACoS = ad spend against ALL sales, so it needs the month's orders for the same clients.
  const scope = clientId ? [clientId] : [...new Set(rows.map((r) => r.c.clientId))];
  const revenue = scope.reduce((a, id) => a + (salesByMonth[`${id}:${month}`]?.total ?? 0), 0);
  const tacos = pct(spend, revenue);

  return (
    <>
      <PageHeader title="Advertising" sub="Sponsored campaigns by month: what was spent, what it sold, and which campaigns cost too much." />
      <SourceNote>
        Campaign figures are typed in or imported from the marketplace&apos;s advertising report, one month at a time. Nothing is pulled live from an ads account, and no bids or
        budgets are changed from here.
      </SourceNote>

      <form method="get" className="mb-6 flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="ads-month">Month</label>
          <input id="ads-month" type="month" name="month" defaultValue={month} className="field w-auto" />
        </div>
        <div>
          <label className="label" htmlFor="ads-client">Client</label>
          <select id="ads-client" name="client" defaultValue={clientId ?? ""} className="field w-auto min-w-40">
            <option value="">All clients</option>
            {clientOpts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-ghost">Show</button>
      </form>

      <section className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4" aria-label={`Advertising summary for ${monthName(month)}`}>
        <StatCard label="Ad spend" value={num(spend)} unit="EGP" hint={`${monthName(before)}: ${num(sum(last, "spend"))} EGP`} />
        <StatCard label="Ad sales" value={num(sales)} unit="EGP" hint={`${monthName(before)}: ${num(sum(last, "sales"))} EGP`} />
        <StatCard label="ACoS" value={show(acos)} hint={`Spend ÷ ad sales. ${monthName(before)}: ${show(lastAcos)}`} />
        <StatCard label="TACoS" value={show(tacos)} hint={revenue > 0 ? `Spend ÷ ${num(revenue)} EGP of total sales in Orders` : "Log this month's orders to see it"} />
      </section>

      <Toolbar
        add={{
          button: "Add campaign",
          title: "Add or update a campaign",
          submit: "Save campaign",
          action: saveCampaignAction,
          fields: [
            { name: "clientId", label: "Client", type: "select", required: true, options: clients.map((c) => ({ value: String(c.id), label: c.name })) },
            { name: "marketplace", label: "Marketplace", type: "select", options: MARKETPLACES.map((m) => ({ value: m, label: MARKETPLACE_META[m].label })) },
            { name: "name", label: "Campaign name", required: true, wide: true, help: "Saving the same name and month again replaces its figures." },
            { name: "month", label: "Month", type: "month", required: true, defaultValue: month },
            { name: "budget", label: "Monthly budget (EGP)", type: "number", min: 0 },
            { name: "spend", label: "Spend (EGP)", type: "number", min: 0, required: true },
            { name: "sales", label: "Ad sales (EGP)", type: "number", min: 0 },
            { name: "clicks", label: "Clicks", type: "number", min: 0 },
            { name: "impressions", label: "Impressions", type: "number", min: 0 },
            { name: "orders", label: "Orders from ads", type: "number", min: 0 },
            { name: "targetAcos", label: "Target ACoS (%)", type: "number", min: 1, max: 500, step: 0.5, defaultValue: "30" },
          ],
        }}
        importer={{ type: "ads", clients: clientOpts, marketplace: true, month, template: "/samples/ads-template.csv", columns: "campaign name, spend, sales, clicks, impressions, orders, budget" }}
      />

      {rows.length === 0 ? (
        <Empty icon={<Megaphone size={18} aria-hidden />}>No campaigns logged for {monthName(month)}. Add one, or import the month&apos;s advertising report.</Empty>
      ) : (
        <DataTable head={["Campaign", "Spend", "Ad sales", "ACoS", "ROAS", "CPC", "CTR", "Conversion", ""]} minWidth={1040}>
          {rows.map(({ c, clientName }) => {
            const a = pct(c.spend, c.sales);
            const used = c.budget > 0 ? Math.min(100, Math.round((c.spend / c.budget) * 100)) : null;
            const tone = a === null ? (c.spend > 0 ? "pill-bad" : "pill-mute") : a <= c.targetAcos ? "pill-ok" : a <= c.targetAcos * 1.25 ? "pill-warn" : "pill-bad";
            return (
              <tr key={c.id}>
                <Td>
                  <span className="block text-foreground">{c.name}</span>
                  <span className="block text-[13px] text-muted-foreground">{clientName}</span>
                  <span className="mt-1.5 block"><MarketBadge m={c.marketplace} /></span>
                </Td>
                <Td className="whitespace-nowrap">
                  <span className="num block text-foreground">{num(c.spend)} <span className="text-[13px] text-muted-foreground">EGP</span></span>
                  {used !== null && (
                    <>
                      <span className="mt-1.5 block h-1.5 w-24 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${used}% of the budget used`}>
                        <span className={`block h-full rounded-full ${used >= 100 ? "bg-warning" : "bg-flow-green-light"}`} style={{ width: `${Math.max(used, 2)}%` }} />
                      </span>
                      <span className="num mt-1 block text-xs text-muted-foreground">of {num(c.budget)}</span>
                    </>
                  )}
                </Td>
                <Td className="num whitespace-nowrap">{num(c.sales)} <span className="text-[13px] text-muted-foreground">EGP</span></Td>
                <Td className="whitespace-nowrap">
                  <span className={`pill num ${tone}`}>{a === null ? (c.spend > 0 ? "No sales" : "—") : `${a}%`}</span>
                  <span className="num mt-1 block text-xs text-muted-foreground">Target {c.targetAcos}%</span>
                </Td>
                <Td className="num">{c.spend > 0 ? `${Math.round((c.sales / c.spend) * 10) / 10}×` : "—"}</Td>
                <Td className="num whitespace-nowrap">{c.clicks > 0 ? `${Math.round((c.spend / c.clicks) * 100) / 100} EGP` : "—"}</Td>
                <Td className="num">{show(pct(c.clicks, c.impressions))}</Td>
                <Td className="num">{show(pct(c.orders, c.clicks))}</Td>
                <Td>
                  <DeleteButton label={`Delete ${c.name} for ${monthName(month)}`} confirm="Delete this campaign's figures for the month?" action={deleteCampaignAction.bind(null, c.id)} />
                </Td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </>
  );
}
