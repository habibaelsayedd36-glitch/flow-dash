import { ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import { createOrderAction, deleteOrderAction, setOrderStatusAction } from "@/app/actions-growth";
import { DeleteButton, StatusSelect, Toolbar } from "@/components/Crud";
import { ClientFilter, DataTable, Empty, FilterTabs, MarketBadge, PageHeader, SourceNote, StatCard, Td } from "@/components/ui";
import { MARKETPLACES, MARKETPLACE_META, ORDER_STATUSES } from "@/lib/catalog";
import { getClients } from "@/lib/data";
import { getOrderStats, getOrders } from "@/lib/data-growth";
import { num, shortDate } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Orders" };

const LABEL: Record<string, string> = { new: "New", processing: "Processing", shipped: "Shipped", delivered: "Delivered", returned: "Returned", cancelled: "Cancelled" };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ client?: string; status?: string }> }) {
  const sp = await searchParams;
  const clientId = Number(sp.client) || undefined;
  const status = (ORDER_STATUSES as readonly string[]).includes(sp.status ?? "") ? sp.status : undefined;
  const [clients, rows, stats] = await Promise.all([getClients(), getOrders({ clientId, status }), getOrderStats(clientId)]);
  const clientOpts = clients.map((c) => ({ id: c.id, name: c.name }));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
  const statusOpts = ORDER_STATUSES.map((s) => ({ value: s, label: LABEL[s] }));
  const href = (s?: string) => {
    const q = new URLSearchParams();
    if (clientId) q.set("client", String(clientId));
    if (s) q.set("status", s);
    return q.size ? `/orders?${q}` : "/orders";
  };

  return (
    <>
      <PageHeader title="Orders" sub="Every marketplace order you log or import, across all clients." />
      <SourceNote>Orders are added by hand or imported from a marketplace order report. Nothing is synced live from a seller account.</SourceNote>

      <section className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4" aria-label="Order summary">
        <StatCard label="Orders, last 30 days" value={num(stats.orders)} hint="Cancelled orders left out" />
        <StatCard label="Revenue, last 30 days" value={num(stats.revenue)} unit="EGP" hint="Returns and cancellations left out" />
        <StatCard label="Waiting to ship" value={num(stats.toShip)} hint="New and processing" />
        <StatCard label="Return rate, last 30 days" value={stats.orders ? `${stats.returnRate}%` : "—"} hint={`Returned: ${stats.returned}`} />
      </section>

      <Toolbar
        add={{
          button: "Add order",
          title: "Add an order",
          submit: "Add order",
          action: createOrderAction,
          fields: [
            { name: "clientId", label: "Client", type: "select", required: true, options: clients.map((c) => ({ value: String(c.id), label: c.name })) },
            { name: "marketplace", label: "Marketplace", type: "select", options: MARKETPLACES.map((m) => ({ value: m, label: MARKETPLACE_META[m].label })) },
            { name: "orderRef", label: "Order number", dir: "ltr" },
            { name: "date", label: "Order date", type: "date", defaultValue: today },
            { name: "item", label: "Item", wide: true, dir: "auto" },
            { name: "sku", label: "SKU", dir: "ltr", help: "Use a pipeline SKU to count the order against stock." },
            { name: "qty", label: "Quantity", type: "number", defaultValue: "1", min: 1 },
            { name: "amount", label: "Line total (EGP)", type: "number", min: 0, required: true },
            { name: "status", label: "Status", type: "select", options: statusOpts },
          ],
        }}
        importer={{ type: "orders", clients: clientOpts, marketplace: true, template: "/samples/orders-template.csv", columns: "order id, date, sku, item, quantity, line total, status" }}
      >
        <ClientFilter clients={clientOpts} value={clientId} hidden={{ status: status ?? "" }} />
      </Toolbar>

      <FilterTabs label="Order status" tabs={[{ href: href(), label: "All", active: !status }, ...ORDER_STATUSES.map((s) => ({ href: href(s), label: LABEL[s], active: status === s }))]} />

      {rows.length === 0 ? (
        <Empty icon={<ShoppingBag size={18} aria-hidden />}>No orders here yet. Add one, or import an order report.</Empty>
      ) : (
        <DataTable head={["Order", "Client", "Item", "Marketplace", "Qty", "Line total", "Status", ""]} minWidth={940}>
          {rows.map(({ o, clientName }) => (
            <tr key={o.id}>
              <Td>
                <span className="block whitespace-nowrap text-foreground" dir="ltr">{o.orderRef || `#${o.id}`}</span>
                <span className="block text-[13px] text-muted-foreground">{shortDate(o.orderedAt, "en")}</span>
              </Td>
              <Td className="whitespace-nowrap">{clientName}</Td>
              <Td>
                <span className="block text-foreground" dir="auto">{o.item || "—"}</span>
                {o.sku && <span className="block text-[13px] text-muted-foreground" dir="ltr">{o.sku}</span>}
              </Td>
              <Td><MarketBadge m={o.marketplace} /></Td>
              <Td className="num">{o.qty}</Td>
              <Td className="num whitespace-nowrap">
                {num(o.amount)} <span className="text-[13px] text-muted-foreground">EGP</span>
              </Td>
              <Td>
                <StatusSelect value={o.status} options={statusOpts} label={`Status of order ${o.orderRef || o.id}`} action={setOrderStatusAction.bind(null, o.id)} />
              </Td>
              <Td>
                <DeleteButton label={`Delete order ${o.orderRef || o.id}`} confirm="Delete this order?" action={deleteOrderAction.bind(null, o.id)} />
              </Td>
            </tr>
          ))}
        </DataTable>
      )}
    </>
  );
}
