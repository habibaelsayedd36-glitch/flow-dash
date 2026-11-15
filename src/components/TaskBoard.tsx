"use client";

import { CheckCheck, FileText, Loader2, MessageCircle, Plus, Zap } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { createTaskAction, toggleTaskAction, type FormState } from "@/app/actions";
import { TEAMS } from "@/lib/catalog";
import { dictFor, label, tpl, type Locale } from "@/lib/i18n";
import { Empty } from "./ui";

export type TaskView = {
  id: number;
  title: string;
  context: string;
  team: string;
  done: boolean;
  auto: boolean;
  due: { state: "overdue" | "today" | "later"; text: string } | null;
  wa: string | null;
  listingId: number | null;
};

export function TaskBoard({ locale, tasks }: { locale: Locale; tasks: TaskView[] }) {
  const t = dictFor(locale);
  const k = t.tasks;
  const [team, setTeam] = useState("all");
  const [override, setOverride] = useState<Record<number, boolean>>({});
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, saving] = useActionState<FormState, FormData>(createTaskAction, {});

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  const toggle = (task: TaskView, done: boolean) => {
    setOverride((o) => ({ ...o, [task.id]: done }));
    startTransition(() => toggleTaskAction(task.id, done));
  };

  const isDone = (task: TaskView) => override[task.id] ?? task.done;
  const scoped = team === "all" ? tasks : tasks.filter((x) => x.team === team);
  const open = scoped.filter((x) => !isDone(x));
  const done = scoped.filter(isDone);

  const row = (task: TaskView) => {
    const checked = isDone(task);
    return (
      <li key={task.id} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => toggle(task, e.target.checked)}
          aria-label={tpl(checked ? k.markOpen : k.markDone, { t: task.title })}
          className="mt-0.5 size-5 shrink-0 cursor-pointer rounded accent-flow-green"
        />
        <div className="min-w-0 flex-1">
          <p className={`text-sm leading-snug ${checked ? "text-mute line-through" : "text-ink"}`}>{task.title}</p>
          <p className="mt-0.5 text-[13px] text-mute">{[task.context, label(t.team, task.team)].filter(Boolean).join(" · ")}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {task.due && <span className={`pill ${task.due.state === "overdue" ? "pill-bad" : task.due.state === "today" ? "pill-warn" : "pill-mute"}`}>{task.due.text}</span>}
            <span className="pill border border-line bg-white text-mute">
              {task.auto && <Zap size={12} aria-hidden />}
              {task.auto ? k.byAutomation : k.manual}
            </span>
            {task.listingId && (
              <Link href={`/listings/${task.listingId}`} className="pill border border-line bg-white text-moss hover:border-moss">
                <FileText size={12} aria-hidden />
                {t.pipeline.openListing}
              </Link>
            )}
            {task.wa && !checked && (
              <a href={task.wa} target="_blank" rel="noopener noreferrer" className="pill bg-forest text-lime hover:bg-forest-hover">
                <MessageCircle size={12} aria-hidden />
                {k.wa}
              </a>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor="team-filter">{k.filter}</label>
          <select id="team-filter" className="field w-auto min-w-44" value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="all">{k.allTeams}</option>
            {TEAMS.map((tm) => (
              <option key={tm} value={tm}>{t.team[tm]}</option>
            ))}
          </select>
          <span className="num text-sm text-mute">{tpl(t.overview.openTasks, { n: open.length })}</span>
        </div>

        <section aria-labelledby="open-tasks">
          <h2 id="open-tasks" className="sr-only">{k.open}</h2>
          {open.length === 0 ? (
            <Empty icon={<CheckCheck size={18} aria-hidden />}>{k.emptyOpen}</Empty>
          ) : (
            <ul className="card divide-y divide-line overflow-hidden">{open.map(row)}</ul>
          )}
        </section>

        {done.length > 0 && (
          <details className="mt-6">
            <summary className="cursor-pointer rounded-md py-1 text-sm font-medium text-mute hover:text-ink">
              {k.done} <span className="num">({done.length})</span>
            </summary>
            <ul className="card mt-3 divide-y divide-line overflow-hidden">{done.map(row)}</ul>
          </details>
        )}
      </div>

      <section className="card p-5 sm:p-6" aria-labelledby="new-task">
        <h2 id="new-task" className="h-section">{k.newTask}</h2>
        <form ref={formRef} action={action} className="mt-4 flex flex-col gap-4">
          <div>
            <label className="sr-only" htmlFor="tk-title">{k.titlePh}</label>
            <input id="tk-title" name="title" className="field" required maxLength={160} placeholder={k.titlePh} autoComplete="off" aria-invalid={state.error === "required"} />
            {state.error === "required" && <p className="mt-1.5 text-[13px] text-danger">{t.common.required}</p>}
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="label" htmlFor="tk-team">{t.automations.team}</label>
              <select id="tk-team" name="team" className="field" defaultValue="accounts">
                {TEAMS.map((tm) => (
                  <option key={tm} value={tm}>{t.team[tm]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="tk-due">{t.automations.dueIn}</label>
              <input id="tk-due" name="dueDays" type="number" inputMode="numeric" min={0} max={60} defaultValue={1} className="field" />
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Plus size={16} aria-hidden />}
            {k.add}
          </button>
          {state.error === "failed" && <p role="alert" className="text-sm text-danger">{t.common.failed}</p>}
        </form>
      </section>
    </div>
  );
}
