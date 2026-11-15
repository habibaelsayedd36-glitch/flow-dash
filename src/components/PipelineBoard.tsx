"use client";

import { ArrowLeft, ArrowRight, FileText, Loader2, Plus, X, Zap } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { createProductAction, moveProductAction, type FormState } from "@/app/actions";
import { CATEGORIES, MARKETPLACES, MARKETPLACE_META, STAGES, nextStage, prevStage } from "@/lib/catalog";
import { dictFor, tpl, type Locale } from "@/lib/i18n";
import { MarketBadge, pname } from "./ui";

export type Card = {
  id: number;
  name: string;
  nameAr: string;
  sku: string;
  marketplace: string;
  stage: string;
  clientId: number;
  clientName: string;
  listingId: number | null;
  days: number;
};
type ClientOpt = { id: number; name: string; marketplaces: string[] };

export function PipelineBoard({ locale, cards, clients, openForm }: { locale: Locale; cards: Card[]; clients: ClientOpt[]; openForm: boolean }) {
  const t = dictFor(locale);
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(openForm);
  const [notice, setNotice] = useState("");
  const [movingId, setMovingId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, saving] = useActionState<FormState, FormData>(createProductAction, {});

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setShowForm(false);
      setNotice(state.ran ? tpl(t.pipeline.ran, { n: state.ran }) : "");
    }
  }, [state, t]);

  const say = (ran: number) => setNotice(ran > 0 ? tpl(t.pipeline.ran, { n: ran }) : t.pipeline.ranNone);

  const move = (id: number, stage: string | null) => {
    if (!stage || movingId !== null) return;
    setMovingId(id);
    startTransition(async () => {
      const res = await moveProductAction(id, stage);
      setMovingId(null);
      if (res.ok) say(res.ran);
      else setNotice(t.common.failed);
    });
  };

  const visible = filter === "all" ? cards : cards.filter((c) => String(c.clientId) === filter);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="client-filter">{t.pipeline.filter}</label>
        <select id="client-filter" className="field w-auto min-w-44" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">{t.pipeline.allClients}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <span className="num text-sm text-mute">{tpl(t.pipeline.count, { n: visible.length })}</span>
        <button type="button" className="btn btn-primary ms-auto" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}>
          {showForm ? <X size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
          {showForm ? t.common.cancel : t.pipeline.add}
        </button>
      </div>

      <p role="status" aria-live="polite" className={notice ? "rise mb-4 flex items-center gap-2 rounded-xl bg-lime-soft px-4 py-2.5 text-sm text-forest" : "sr-only"}>
        {notice && <Zap size={15} aria-hidden className="shrink-0" />}
        {notice}
      </p>

      {showForm && (
        <section className="card rise mb-6 p-5 sm:p-6" aria-labelledby="add-product">
          <h2 id="add-product" className="h-section">{t.pipeline.addTitle}</h2>
          {clients.length === 0 ? (
            <p className="mt-3 text-sm text-mute">
              {t.pipeline.noClients}{" "}
              <Link href="/clients" className="font-medium text-flow-green underline underline-offset-2">{t.nav.clients}</Link>
            </p>
          ) : (
            <form ref={formRef} action={formAction} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="label" htmlFor="p-client">{t.common.client}</label>
                <select id="p-client" name="clientId" className="field" required defaultValue={filter !== "all" ? filter : clients[0].id}>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="p-market">{t.common.marketplace}</label>
                <select id="p-market" name="marketplace" className="field" defaultValue="amazon">
                  {MARKETPLACES.map((m) => (
                    <option key={m} value={m}>{MARKETPLACE_META[m].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="p-cat">{t.pipeline.category}</label>
                <select id="p-cat" name="category" className="field" defaultValue="home">
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{t.category[c]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="p-sku">{t.pipeline.sku}</label>
                <input id="p-sku" name="sku" className="field" dir="ltr" maxLength={40} autoComplete="off" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="p-name">{t.pipeline.name}</label>
                <input id="p-name" name="name" className="field" lang="en" dir="ltr" required maxLength={160} aria-invalid={state.error === "required"} autoComplete="off" />
                {state.error === "required" && <p className="mt-1.5 text-[13px] text-danger">{t.common.required}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="p-name-ar">{t.pipeline.nameAr}</label>
                <input id="p-name-ar" name="nameAr" className="field" lang="ar" dir="rtl" maxLength={160} autoComplete="off" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="p-feat">{t.pipeline.features}</label>
                <textarea id="p-feat" name="features" className="field" lang="en" dir="ltr" rows={4} maxLength={2000} />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="p-feat-ar">{t.pipeline.featuresAr}</label>
                <textarea id="p-feat-ar" name="featuresAr" className="field" lang="ar" dir="rtl" rows={4} maxLength={2000} />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="p-brand">{t.pipeline.brand}</label>
                <input id="p-brand" name="brand" className="field" dir="ltr" maxLength={80} autoComplete="off" />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="p-kw">{t.pipeline.keywords}</label>
                <input id="p-kw" name="keywords" className="field" maxLength={500} autoComplete="off" />
              </div>
              <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving && <Loader2 size={16} className="animate-spin" aria-hidden />}
                  {t.pipeline.submit}
                </button>
                {state.error === "failed" && <p role="alert" className="text-sm text-danger">{t.common.failed}</p>}
              </div>
            </form>
          )}
        </section>
      )}

      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <ol className="grid snap-x snap-mandatory auto-cols-[78vw] grid-flow-col gap-3 sm:auto-cols-[260px] sm:snap-none">
          {STAGES.map((stage, i) => {
            const items = visible.filter((c) => c.stage === stage);
            return (
              <li
                key={stage}
                className={`flex snap-start flex-col rounded-2xl border p-2.5 transition-colors ${overStage === stage ? "border-moss bg-lime-soft" : "border-line bg-sage-soft"}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverStage(stage);
                }}
                onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  setOverStage(null);
                  const id = Number(e.dataTransfer.getData("text/plain"));
                  const card = cards.find((c) => c.id === id);
                  if (card && card.stage !== stage) move(id, stage);
                }}
              >
                <div className="flex items-center justify-between gap-2 px-1.5 pb-2.5 pt-1">
                  <h2 className="flex min-w-0 items-baseline gap-2 text-sm font-semibold text-ink">
                    <span className="num text-xs font-medium text-mute">0{i + 1}</span>
                    <span className="truncate">{t.stage[stage]}</span>
                  </h2>
                  <span className="num pill pill-mute !bg-white">{items.length}</span>
                </div>
                <ul className="flex min-h-24 flex-col gap-2">
                  {items.length === 0 && <li className="grid flex-1 place-items-center rounded-xl border border-dashed border-input px-3 py-6 text-[13px] text-mute">{t.pipeline.empty}</li>}
                  {items.map((c) => {
                    const busy = movingId === c.id;
                    const prev = prevStage(c.stage);
                    const next = nextStage(c.stage);
                    return (
                      <li
                        key={c.id}
                        draggable={!busy}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", String(c.id));
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        className={`rounded-xl border border-line bg-white p-3 transition-shadow hover:shadow-md ${busy ? "opacity-60" : "sm:cursor-grab"}`}
                      >
                        <p className="text-sm font-medium leading-snug text-ink">{pname(locale, c.name, c.nameAr)}</p>
                        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-mute"><bdi className="truncate">{c.clientName}</bdi>{c.sku && <><span aria-hidden>·</span><bdi className="shrink-0">{c.sku}</bdi></>}</p>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <MarketBadge m={c.marketplace} />
                          <span className={`num text-xs ${c.days >= 3 && next ? "text-amber-ink" : "text-mute"}`}>
                            {c.days === 0 ? t.pipeline.today : tpl(t.pipeline.days, { n: c.days })}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center gap-1.5 border-t border-line pt-2.5">
                          <button type="button" className="btn btn-ghost btn-icon" onClick={() => move(c.id, prev)} disabled={!prev || busy} aria-label={`${t.pipeline.back}: ${c.name}`} title={t.pipeline.back}>
                            <ArrowLeft size={15} aria-hidden className="rtl:-scale-x-100" />
                          </button>
                          {c.listingId && (
                            <Link href={`/listings/${c.listingId}`} className="btn btn-ghost btn-icon" aria-label={`${t.pipeline.openListing}: ${c.name}`} title={t.pipeline.openListing}>
                              <FileText size={15} aria-hidden />
                            </Link>
                          )}
                          <button type="button" className="btn btn-primary btn-sm ms-auto" onClick={() => move(c.id, next)} disabled={!next || busy} aria-label={`${t.pipeline.next}: ${c.name}`} title={t.pipeline.next}>
                            {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <ArrowRight size={15} aria-hidden className="rtl:-scale-x-100" />}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
