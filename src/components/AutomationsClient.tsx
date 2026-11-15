"use client";

import { ArrowRight, Clock, Loader2, MessageCircle, Play, Plus, Trash2, X, Zap } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { createAutomationAction, deleteAutomationAction, runChecksAction, toggleAutomationAction, type FormState } from "@/app/actions";
import { ACTIONS, STAGES, TASK_KINDS, TEAMS, TRIGGERS } from "@/lib/catalog";
import { describeAction, describeTrigger, dictFor, timeAgo, tpl, type Locale } from "@/lib/i18n";
import { Empty } from "./ui";

type Rule = {
  id: number;
  name: string;
  nameAr: string;
  trigger: string;
  condition: { stage?: string; maxScore?: number; pct?: number; days?: number };
  action: string;
  config: { kind?: string; title?: string; team?: string; dueDays?: number; whatsapp?: boolean; stage?: string };
  enabled: boolean;
  runCount: number;
  lastRunAt: string | null;
};

function Sentence({ locale, rule }: { locale: Locale; rule: Pick<Rule, "trigger" | "condition" | "action" | "config"> }) {
  const t = dictFor(locale);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm leading-snug text-ink">
      <span className="pill pill-mute">{t.automations.when}</span>
      <span>{describeTrigger(rule, t)}</span>
      <ArrowRight size={15} aria-hidden className="shrink-0 text-mute rtl:-scale-x-100" />
      <span className="pill pill-dark">{t.automations.then}</span>
      <span>{describeAction(rule, t)}</span>
    </p>
  );
}

export function RulesManager({ locale, rules }: { locale: Locale; rules: Rule[] }) {
  const t = dictFor(locale);
  const a = t.automations;
  const [showForm, setShowForm] = useState(false);
  const [override, setOverride] = useState<Record<number, boolean>>({});
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, saving] = useActionState<FormState, FormData>(createAutomationAction, {});

  const [draft, setDraft] = useState({ trigger: "stage_entered", condStage: "content", maxScore: 80, pct: 90, days: 3, action: "create_task", kind: "follow_up", taskTitle: "", team: "accounts", toStage: "publishing" });
  const set = (p: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...p }));

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setShowForm(false);
    }
  }, [state]);

  const toggle = (rule: Rule) => {
    const next = !(override[rule.id] ?? rule.enabled);
    setOverride((o) => ({ ...o, [rule.id]: next }));
    startTransition(() => toggleAutomationAction(rule.id, next));
  };
  const remove = (rule: Rule) => {
    if (window.confirm(a.confirmDelete)) startTransition(() => deleteAutomationAction(rule.id));
  };

  const preview = {
    trigger: draft.trigger,
    condition: { stage: draft.condStage, maxScore: draft.maxScore, pct: draft.pct, days: draft.days },
    action: draft.action,
    config: { kind: draft.kind, title: draft.taskTitle, team: draft.team, stage: draft.toStage },
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="num text-sm text-mute">{tpl(t.overview.runsHint, { n: rules.filter((r) => override[r.id] ?? r.enabled).length })}</p>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)} aria-expanded={showForm}>
          {showForm ? <X size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
          {showForm ? t.common.cancel : a.new}
        </button>
      </div>

      {showForm && (
        <section className="card rise mb-6 p-5 sm:p-6" aria-labelledby="builder">
          <h2 id="builder" className="h-section">{a.newTitle}</h2>
          <form ref={formRef} action={formAction} className="mt-5 flex flex-col gap-5">
            <div className="max-w-md">
              <label className="label" htmlFor="au-name">{a.name}</label>
              <input id="au-name" name="name" className="field" required maxLength={100} placeholder={a.namePh} autoComplete="off" aria-invalid={state.error === "required"} />
              {state.error === "required" && <p className="mt-1.5 text-[13px] text-danger">{t.common.required}</p>}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <fieldset className="min-w-0 rounded-2xl border border-line bg-sage-soft p-4">
                <legend className="pill pill-mute !bg-white px-3">{a.when}</legend>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="sr-only" htmlFor="au-trigger">{a.when}</label>
                    <select id="au-trigger" name="trigger" className="field" value={draft.trigger} onChange={(e) => set({ trigger: e.target.value })}>
                      {TRIGGERS.map((tr) => (
                        <option key={tr} value={tr}>{t.triggerLabel[tr]}</option>
                      ))}
                    </select>
                  </div>
                  {draft.trigger === "stage_entered" && (
                    <div className="sm:col-span-2">
                      <label className="label" htmlFor="au-cstage">{a.stage}</label>
                      <select id="au-cstage" name="condStage" className="field" value={draft.condStage} onChange={(e) => set({ condStage: e.target.value })}>
                        {STAGES.map((s) => (
                          <option key={s} value={s}>{t.stage[s]}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {draft.trigger === "listing_generated" && (
                    <div>
                      <label className="label" htmlFor="au-score">{a.scoreBelow}</label>
                      <input id="au-score" name="maxScore" type="number" inputMode="numeric" min={1} max={100} className="field" value={draft.maxScore} onChange={(e) => set({ maxScore: Number(e.target.value) })} />
                    </div>
                  )}
                  {draft.trigger === "quota_reached" && (
                    <div>
                      <label className="label" htmlFor="au-pct">{a.usage}</label>
                      <input id="au-pct" name="pct" type="number" inputMode="numeric" min={1} max={200} className="field" value={draft.pct} onChange={(e) => set({ pct: Number(e.target.value) })} />
                    </div>
                  )}
                  {draft.trigger === "product_stale" && (
                    <div>
                      <label className="label" htmlFor="au-days">{a.days}</label>
                      <input id="au-days" name="days" type="number" inputMode="numeric" min={1} max={60} className="field" value={draft.days} onChange={(e) => set({ days: Number(e.target.value) })} />
                    </div>
                  )}
                </div>
              </fieldset>

              <fieldset className="min-w-0 rounded-2xl border border-line bg-sage-soft p-4">
                <legend className="pill pill-dark px-3">{a.then}</legend>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="sr-only" htmlFor="au-action">{a.then}</label>
                    <select id="au-action" name="action" className="field" value={draft.action} onChange={(e) => set({ action: e.target.value })}>
                      {ACTIONS.map((ac) => (
                        <option key={ac} value={ac}>{t.actionLabel[ac]}</option>
                      ))}
                    </select>
                  </div>
                  {draft.action === "move_stage" && (
                    <div className="sm:col-span-2">
                      <label className="label" htmlFor="au-tstage">{a.stage}</label>
                      <select id="au-tstage" name="toStage" className="field" value={draft.toStage} onChange={(e) => set({ toStage: e.target.value })}>
                        {STAGES.map((s) => (
                          <option key={s} value={s}>{t.stage[s]}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {draft.action === "create_task" && (
                    <>
                      <div className="sm:col-span-2">
                        <label className="label" htmlFor="au-kind">{a.taskType}</label>
                        <select id="au-kind" name="kind" className="field" value={draft.kind} onChange={(e) => set({ kind: e.target.value })}>
                          {TASK_KINDS.map((k) => (
                            <option key={k} value={k}>{t.taskKind[k]}</option>
                          ))}
                        </select>
                      </div>
                      {draft.kind === "custom" && (
                        <div className="sm:col-span-2">
                          <label className="label" htmlFor="au-title">{a.customTitle}</label>
                          <input id="au-title" name="taskTitle" className="field" required maxLength={120} value={draft.taskTitle} onChange={(e) => set({ taskTitle: e.target.value })} />
                        </div>
                      )}
                      <div>
                        <label className="label" htmlFor="au-team">{a.team}</label>
                        <select id="au-team" name="team" className="field" value={draft.team} onChange={(e) => set({ team: e.target.value })}>
                          {TEAMS.map((tm) => (
                            <option key={tm} value={tm}>{t.team[tm]}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label" htmlFor="au-due">{a.dueIn}</label>
                        <input id="au-due" name="dueDays" type="number" inputMode="numeric" min={0} max={60} defaultValue={1} className="field" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink">
                          <input type="checkbox" name="whatsapp" className="mt-1 size-4 shrink-0 accent-flow-green" />
                          <span>
                            <span className="font-body">{a.whatsapp}</span>
                            <span className="mt-0.5 block font-body text-[13px] text-mute">{a.whatsappNote}</span>
                          </span>
                        </label>
                      </div>
                    </>
                  )}
                </div>
              </fieldset>
            </div>

            <div className="rounded-xl border border-dashed border-input px-4 py-3">
              <Sentence locale={locale} rule={preview} />
            </div>

            <div className="flex items-center gap-3">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving && <Loader2 size={16} className="animate-spin" aria-hidden />}
                {a.create}
              </button>
              {state.error === "failed" && <p role="alert" className="text-sm text-danger">{t.common.failed}</p>}
            </div>
          </form>
        </section>
      )}

      {rules.length === 0 ? (
        <Empty icon={<Zap size={18} aria-hidden />}>{a.empty}</Empty>
      ) : (
        <ul className="flex flex-col gap-3">
          {rules.map((rule) => {
            const on = override[rule.id] ?? rule.enabled;
            const name = locale === "ar" && rule.nameAr ? rule.nameAr : rule.name;
            return (
              <li key={rule.id} className={`card flex items-start gap-4 p-4 transition-opacity sm:p-5 ${on ? "" : "opacity-70"}`}>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[15px] font-semibold leading-snug text-ink">{name}</h3>
                  <div className="mt-2.5">
                    <Sentence locale={locale} rule={rule} />
                  </div>
                  <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-mute">
                    <span className="num">{tpl(a.runs, { n: rule.runCount })}</span>
                    <span suppressHydrationWarning>{rule.lastRunAt ? tpl(a.lastRun, { t: timeAgo(rule.lastRunAt, locale) }) : a.never}</span>
                    {rule.config.whatsapp && (
                      <span className="inline-flex items-center gap-1.5">
                        <MessageCircle size={13} aria-hidden />
                        WhatsApp
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={tpl(a.toggle, { name })}
                    title={on ? a.on : a.off}
                    onClick={() => toggle(rule)}
                    className={`flex h-6 w-11 items-center rounded-full px-0.5 transition-colors ${on ? "justify-end bg-primary" : "justify-start bg-input"}`}
                  >
                    <span className={`size-5 rounded-full shadow-sm bg-background`} />
                  </button>
                  <button type="button" className="btn btn-ghost btn-icon" onClick={() => remove(rule)} aria-label={`${t.common.delete}: ${name}`} title={t.common.delete}>
                    <Trash2 size={15} aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function ScheduledChecks({ locale, lastTick }: { locale: Locale; lastTick: string | null }) {
  const t = dictFor(locale);
  const a = t.automations;
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState("");

  const run = async () => {
    setRunning(true);
    try {
      const res = await runChecksAction();
      setResult(res.fired > 0 ? tpl(a.fired, { n: res.fired }) : a.firedNone);
    } catch {
      setResult(t.common.failed);
    }
    setRunning(false);
  };

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="sched">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-full bg-sage text-moss">
          <Clock size={16} aria-hidden />
        </span>
        <h2 id="sched" className="h-section">{a.schedTitle}</h2>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-mute">{a.schedBody}</p>
      <p suppressHydrationWarning className="mt-3 text-[13px] text-mute">{lastTick ? tpl(a.lastChecked, { t: timeAgo(lastTick, locale) }) : a.neverChecked}</p>
      <button type="button" className="btn btn-ghost mt-4 w-full" onClick={run} disabled={running}>
        {running ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Play size={15} aria-hidden className="rtl:-scale-x-100" />}
        {running ? a.running : a.runNow}
      </button>
      <p role="status" aria-live="polite" className={result ? "mt-3 rounded-xl bg-lime-soft px-3 py-2 text-sm text-forest" : "sr-only"}>{result}</p>
    </section>
  );
}
