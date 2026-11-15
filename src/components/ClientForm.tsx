"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { createClientAction, type FormState } from "@/app/actions";
import { CLIENT_STATUSES, MARKETPLACES, MARKETPLACE_META, PLANS, PLAN_IDS, type PlanId } from "@/lib/catalog";
import { dictFor, num, tpl, type Locale } from "@/lib/i18n";

export function ClientForm({ locale }: { locale: Locale }) {
  const t = dictFor(locale);
  const c = t.clients;
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<PlanId>("starter");
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, saving] = useActionState<FormState, FormData>(createClientAction, {});

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setPlan("starter");
      setOpen(false);
    }
  }, [state]);

  const p = PLANS[plan];
  const hint =
    plan === "per_item"
      ? c.perItemHint
      : `${tpl(c.planHint, { fee: num(p.fee), pct: p.pct })}${p.quota ? ` · ${tpl(c.planHintQuota, { n: p.quota })}` : ""}`;

  return (
    <div className="mb-4">
      <div className="flex justify-end">
        <button type="button" className="btn btn-primary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? <X size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
          {open ? t.common.cancel : c.add}
        </button>
      </div>

      {open && (
        <section className="card rise mt-4 p-5 sm:p-6" aria-labelledby="add-client">
          <h2 id="add-client" className="h-section">{c.addTitle}</h2>
          <form ref={formRef} action={action} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="label" htmlFor="c-name">{c.name}</label>
              <input id="c-name" name="name" className="field" required maxLength={80} autoComplete="organization" aria-invalid={state.error === "required"} />
              {state.error === "required" && <p className="mt-1.5 text-[13px] text-danger">{t.common.required}</p>}
            </div>
            <div>
              <label className="label" htmlFor="c-contact">{c.contact}</label>
              <input id="c-contact" name="contact" className="field" maxLength={80} autoComplete="name" />
            </div>
            <div>
              <label className="label" htmlFor="c-phone">{c.phone}</label>
              <input id="c-phone" name="phone" type="tel" inputMode="tel" dir="ltr" className="field" maxLength={30} placeholder="01xxxxxxxxx" autoComplete="tel" />
            </div>
            <div className="sm:col-span-2 lg:col-span-2">
              <label className="label" htmlFor="c-plan">{c.plan}</label>
              <select id="c-plan" name="plan" className="field" value={plan} onChange={(e) => setPlan(e.target.value as PlanId)} aria-describedby="c-plan-hint">
                {PLAN_IDS.map((id) => (
                  <option key={id} value={id}>{t.plan[id]}</option>
                ))}
              </select>
              <p id="c-plan-hint" className="mt-1.5 text-[13px] text-mute">{hint}</p>
            </div>
            <div>
              <label className="label" htmlFor="c-status">{t.common.status}</label>
              <select id="c-status" name="status" className="field" defaultValue="active">
                {CLIENT_STATUSES.map((s) => (
                  <option key={s} value={s}>{t.clientStatus[s]}</option>
                ))}
              </select>
            </div>
            <fieldset className="sm:col-span-2 lg:col-span-3">
              <legend className="label">{c.marketplaces}</legend>
              <div className="flex flex-wrap gap-2">
                {MARKETPLACES.map((m) => (
                  <label key={m} className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-input bg-white px-3.5 text-sm text-ink transition-colors has-checked:border-forest has-checked:bg-lime-soft">
                    <input type="checkbox" name="marketplaces" value={m} className="size-4 accent-flow-green" defaultChecked={m === "amazon"} />
                    <span className="font-body" dir="ltr">{MARKETPLACE_META[m].label}</span>
                  </label>
                ))}
              </div>
              {state.error === "market" && <p role="alert" className="mt-1.5 text-[13px] text-danger">{c.pickMarket}</p>}
            </fieldset>
            <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving && <Loader2 size={16} className="animate-spin" aria-hidden />}
                {c.submit}
              </button>
              {state.error === "failed" && <p role="alert" className="text-sm text-danger">{t.common.failed}</p>}
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
