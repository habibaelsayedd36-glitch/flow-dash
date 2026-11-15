import { Boxes } from "lucide-react";
import type { Metadata } from "next";
import { setStockAction } from "@/app/actions-growth";
import { InlineEdit, Toolbar } from "@/components/Crud";
import { ClientFilter, DataTable, Empty, MarketBadge, PageHeader, SourceNote, StatCard, Td } from "@/components/ui";
import { getClients } from "@/lib/data";
import { getInventory, type StockState } from "@/lib/data-growth";
import { num, shortDate } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Inventory" };

const STATE: Record<StockState, { text: string; cls: string; order: number }> = {
  out: { text: "Out of stock", cls: "pill-bad", order: 0 },
  low: { text: "Low stock", cls: "pill-warn", order: 1 },
  ok: { text: "In stock", cls: "pill-ok", order: 2 },
  untracked: { text: "Not tracked", cls: "pill-mute", order: 3 },
};

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const sp = await searchParams;
  const clientId = Number(sp.client) || undefined;
  const [clients, rows] = await Promise.all([getClients(), getInventory(clientId)]);
  const clientOpts = clients.map((c) => ({ id: c.id, name: c.name }));
  const sorted = [...rows].sort((a, b) => STATE[a.state].order - STATE[b.state].order);
  const count = (s: StockState) => rows.filter((r) => r.state === s).length;

  return (
    <>
      <PageHeader title="Inventory" sub="Stock on hand for every pipeline product, with what has sold since the last count." />
      <SourceNote>
        Available stock is your last count minus the units ordered since that count, taken from Orders. Cancelled and returned orders are left out. Nothing is read from a
        warehouse or a marketplace.
      </SourceNote>

      <section className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4" aria-label="Stock summary">
        <StatCard label="Products tracked" value={num(rows.length - count("untracked"))} hint={`Not tracked yet: ${count("untracked")}`} />
        <StatCard label="Low stock" value={num(count("low"))} hint="At or under the reorder point" />
        <StatCard label="Out of stock" value={num(count("out"))} hint="Nothing left to sell" />
        <StatCard label="Units sold, last 30 days" value={num(rows.reduce((a, r) => a + r.sold30, 0))} hint="From Orders, matched by SKU" />
      </section>

      <Toolbar importer={{ type: "inventory", clients: clientOpts, template: "/samples/inventory-template.csv", columns: "sku, stock, reorder point" }}>
        <ClientFilter clients={clientOpts} value={clientId} />
      </Toolbar>

      {sorted.length === 0 ? (
        <Empty icon={<Boxes size={18} aria-hidden />}>No products yet. Add products in the Studio Pipeline, then count their stock here.</Empty>
      ) : (
        <DataTable head={["Product", "Last count", "Sold since", "Available", "Sold, 30 days", "Days of cover", "Status", "Update the count"]} minWidth={1080}>
          {sorted.map((r) => (
            <tr key={r.id}>
              <Td>
                <span className="block text-foreground">{r.name}</span>
                <span className="block text-[13px] text-muted-foreground">
                  {r.clientName}
                  {r.sku && <span dir="ltr"> · {r.sku}</span>}
                </span>
                <span className="mt-1.5 block"><MarketBadge m={r.marketplace} /></span>
              </Td>
              <Td className="whitespace-nowrap">
                {r.stock === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <>
                    <span className="num block text-foreground">{num(r.stock)}</span>
                    {r.stockAt && <span className="block text-[13px] text-muted-foreground">{shortDate(r.stockAt, "en")}</span>}
                  </>
                )}
              </Td>
              <Td className="num">{r.stock === null ? "—" : num(r.soldSince)}</Td>
              <Td className="num font-display text-base font-bold text-flow-green">{r.available === null ? "—" : num(r.available)}</Td>
              <Td className="num">{num(r.sold30)}</Td>
              <Td className="num whitespace-nowrap">{r.cover === null ? "—" : num(r.cover)}</Td>
              <Td><span className={`pill ${STATE[r.state].cls}`}>{STATE[r.state].text}</span></Td>
              <Td>
                <InlineEdit
                  label={`Stock count for ${r.name}`}
                  submit="Save count"
                  action={setStockAction.bind(null, r.id)}
                  fields={[
                    { name: "stock", label: "On hand", value: r.stock, min: 0 },
                    { name: "reorder", label: "Reorder at", value: r.reorderPoint, min: 0 },
                  ]}
                />
              </Td>
            </tr>
          ))}
        </DataTable>
      )}
    </>
  );
}
