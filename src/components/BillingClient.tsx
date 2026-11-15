"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { createStatementAction, deleteStatementAction, toggleStatementPaidAction, type StatementState } from "@/app/actions-tools";

export type BillingClientOpt = { id: number; name: string; fee: number; pct: number; pctCap: number | null; overQuota: number; extraRate: number };
const egp = (n: number) => new Intl.NumberFormat("en-US").format(n);

export function StatementForm({ clients, month, orderSales }: { clients: BillingClientOpt[]; month: string; orderSales: Record<string, { total: number; n: number }> }) {
  const [period, setPeriod] = useState(month);
  const [clientId, setClientId] = useState(String(clients[0]?.id ?? ""));
  const client = clients.find((c) => String(c.id) === clientId) ?? clients[0];
  const [sales, setSales] = useState("");
  const [pct, setPct] = useState(String(client?.pct ?? 0));
  const [state, action, saving] = useActionState<StatementState, FormData>(createStatementAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) setSales("");
  }, [state]);

  if (!client) return <p className="text-sm text-mute">Add a client first.</p>;

  const max = client.pctCap ?? client.pct;
  const logged = orderSales[`${client.id}:${period}`];
  const share = Math.round(((Number(sales) || 0) * Math.min(Number(pct) || 0, max)) / 100);
  const extra = client.overQuota * client.extraRate;
  const total = client.fee + share + extra;

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <div>
        <label className="label" htmlFor="st-client">Client</label>
        <select
          id="st-client"
          name="clientId"
          className="field"
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            const next = clients.find((c) => String(c.id) === e.target.value);
            if (next) setPct(String(next.pct));
          }}
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="st-month">Month</label>
        <input id="st-month" name="month" type="month" className="field" value={period} onChange={(e) => setPeriod(e.target.value)} required />
      </div>
      <div>
        <label className="label" htmlFor="st-sales">Sales this month (EGP)</label>
        <input id="st-sales" name="sales" type="number" inputMode="numeric" min={0} step={1} className="field" value={sales} placeholder="From the seller dashboard" onChange={(e) => setSales(e.target.value)} />
        {logged ? (
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            Orders logged for this month add up to <span className="num text-foreground">{egp(logged.total)}</span> EGP (logged: {logged.n}).{" "}
            <button type="button" className="rounded font-medium text-flow-green hover:underline" onClick={() => setSales(String(logged.total))}>
              Use this figure
            </button>
          </p>
        ) : (
          <p className="mt-1.5 text-[13px] text-muted-foreground">No orders are logged for this client and month.</p>
        )}
      </div>
      <div>
        <label className="label" htmlFor="st-pct">Sales share (%)</label>
        <input id="st-pct" name="pct" type="number" inputMode="decimal" min={0} max={max} step={0.5} className="field" value={pct} onChange={(e) => setPct(e.target.value)} aria-describedby="st-pct-help" />
        <p id="st-pct-help" className="mt-1.5 text-[13px] text-mute">
          {client.pctCap ? `This plan starts at ${client.pct}% and rises with performance, capped at ${client.pctCap}%.` : `This plan has a fixed share of ${client.pct}%.`}
        </p>
      </div>

      <dl className="rounded-2xl bg-sage-soft p-4 text-sm">
        {[
          ["Monthly fee", client.fee],
          ["Sales share", share],
          [`Extra items (${client.overQuota} × ${client.extraRate})`, extra],
        ].map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 py-1">
            <dt className="text-mute">{k}</dt>
            <dd className="num text-ink">{egp(Number(v))}</dd>
          </div>
        ))}
        <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-line pt-3">
          <dt className="font-semibold text-ink">Total</dt>
          <dd className="num text-lg font-semibold text-ink">{egp(total)} <span className="text-[13px] font-medium text-mute">EGP</span></dd>
        </div>
      </dl>

      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Plus size={16} aria-hidden />}
        Create statement
      </button>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
    </form>
  );
}

export function StatementActions({ id, paid, label }: { id: number; paid: boolean; label: string }) {
  const [pending, start] = useTransition();
  const [local, setLocal] = useState(paid);
  return (
    <span className="inline-flex items-center gap-2">
      <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-ink">
        <input
          type="checkbox"
          className="size-4 accent-flow-green"
          checked={local}
          disabled={pending}
          onChange={(e) => {
            setLocal(e.target.checked);
            start(() => toggleStatementPaidAction(id, e.target.checked));
          }}
          aria-label={`Mark the ${label} statement as paid`}
        />
        <span className="font-body">Paid</span>
      </label>
      <button type="button" className="btn btn-ghost btn-icon" disabled={pending} aria-label={`Delete the ${label} statement`}
        onClick={() => window.confirm("Delete this statement?") && start(() => deleteStatementAction(id))}>
        <Trash2 size={15} aria-hidden />
      </button>
    </span>
  );
}
