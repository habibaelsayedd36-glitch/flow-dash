import { Info, Star } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { MARKETPLACE_META, isMarketplace } from "@/lib/catalog";
import { label, timeAgo, type Dict, type Locale } from "@/lib/i18n";

/** Shared presentational pieces. No hooks, so they work in server and client components. */

export const pname = (locale: Locale, name: string | null, nameAr: string | null) =>
  (locale === "ar" && nameAr ? nameAr : name) ?? "";

export function PageHeader({ title, sub, children }: { title: string; sub: string; children?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="h-page">{title}</h1>
        <p className="mt-2 max-w-xl text-base text-muted-foreground">{sub}</p>
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

/** Marketplace names stay in the brand palette: no third-party logo colours in the UI. */
export function MarketBadge({ m }: { m: string; showLabel?: boolean }) {
  const name = isMarketplace(m) ? MARKETPLACE_META[m].label : m;
  return (
    <span className="pill pill-mute" dir="ltr">
      {name}
    </span>
  );
}

const STATUS_CLASS: Record<string, string> = {
  draft: "pill-mute",
  review: "pill-warn",
  approved: "pill-ok",
  published: "pill-lime",
  active: "pill-ok",
  onboarding: "pill-warn",
  paused: "pill-mute",
  success: "pill-ok",
  skipped: "pill-mute",
  failed: "pill-bad",
};

export function StatusPill({ status, text }: { status: string; text: string }) {
  return <span className={`pill ${STATUS_CLASS[status] ?? "pill-mute"}`}>{text}</span>;
}

export function ScoreBadge({ score, labelText }: { score: number; labelText: string }) {
  const cls = score >= 90 ? "pill-ok" : score >= 70 ? "pill-warn" : "pill-bad";
  return (
    <span className={`pill num ${cls}`}>
      <span className="sr-only">{labelText} </span>
      {score}
    </span>
  );
}

export function Empty({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-input bg-card/60 px-6 py-10 text-center text-muted-foreground">
      {icon && <span className="grid size-10 place-items-center rounded-full bg-secondary text-flow-green">{icon}</span>}
      <p className="max-w-sm text-sm leading-relaxed">{children}</p>
    </div>
  );
}

/** A headline number. Same style as the stats on the Overview. */
export function StatCard({ label: text, value, unit, hint, href }: { label: string; value: string; unit?: string; hint?: string; href?: string }) {
  const body = (
    <>
      <span className="text-sm leading-snug text-muted-foreground">{text}</span>
      <span className="num mt-3 font-display text-3xl font-bold leading-none text-flow-green">
        {value}
        {unit && <span className="ms-1.5 font-body text-sm font-normal text-muted-foreground">{unit}</span>}
      </span>
      {hint && <span className="mt-auto pt-3 text-[13px] leading-snug text-muted-foreground">{hint}</span>}
    </>
  );
  return href ? (
    <Link href={href} className="card flex flex-col p-5 transition-shadow hover:shadow-md">
      {body}
    </Link>
  ) : (
    <div className="card flex flex-col p-5">{body}</div>
  );
}

/** Says where a page's figures come from. Shown on every page that tracks marketplace data. */
export function SourceNote({ children }: { children: ReactNode }) {
  return (
    <p className="mb-5 flex max-w-3xl gap-2 text-[13px] leading-relaxed text-muted-foreground">
      <Info size={15} aria-hidden className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function DataTable({ head, children, minWidth = 760 }: { head: string[]; children: ReactNode; minWidth?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth }}>
          <thead>
            <tr className="border-b border-border bg-sage-soft text-[13px] text-muted-foreground">
              {head.map((h, i) => (
                <th key={i} scope="col" className="whitespace-nowrap px-5 py-3 text-start font-medium">
                  {h || <span className="sr-only">Actions</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`px-5 py-3.5 align-middle ${className}`}>{children}</td>;
}

/** A plain GET form, so filtering works without JavaScript and keeps the choice in the URL. */
export function ClientFilter({ clients, value, hidden }: { clients: { id: number; name: string }[]; value?: number; hidden?: Record<string, string> }) {
  return (
    <form method="get" className="flex flex-wrap items-center gap-2">
      {Object.entries(hidden ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label className="sr-only" htmlFor="filter-client">Filter by client</label>
      <select id="filter-client" name="client" defaultValue={value ?? ""} className="field w-auto min-w-40">
        <option value="">All clients</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <button type="submit" className="btn btn-ghost">Filter</button>
    </form>
  );
}

/** Tabs for the pages that live under one sidebar item (Workflow Engine, Clients). */
export function SubNav({ items, current }: { items: { href: string; label: string }[]; current: string }) {
  return (
    <nav aria-label="Section" className="mb-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-border bg-card p-1 shadow-xs">
      {items.map((item) => {
        const active = item.href === current;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Pill links that filter a list by status. */
export function FilterTabs({ label: text, tabs }: { label: string; tabs: { href: string; label: string; active: boolean }[] }) {
  return (
    <nav aria-label={text} className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 py-1">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={`pill !h-8 !px-3.5 transition-colors ${tab.active ? "pill-dark" : "border border-border bg-card text-muted-foreground hover:text-foreground"}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

export function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={15} aria-hidden className={n <= rating ? "fill-flow-green text-flow-green" : "text-input"} />
      ))}
    </span>
  );
}

type RunLike = { status: string; code: string; subject: string; extra: string; createdAt: Date | string; name: string; nameAr: string };

/** Turns a stored run (machine code + raw values) into a sentence. */
export function runSentence(run: RunLike, t: Dict): string {
  const base = label(t.runCode, run.code);
  if (run.code === "stage_moved") return `${base} ${label(t.stage, run.extra)}`;
  if (run.code === "task_created") return `${base}: ${label(t.taskKind, run.extra)}`;
  if (run.code === "listing_generated") return `${base} · ${t.common.score} ${run.extra}`;
  if (run.code === "error") return `${base}: ${run.extra}`;
  return base;
}

export function RunItem({ run, t, locale }: { run: RunLike; t: Dict; locale: Locale }) {
  const dot = run.status === "success" ? "bg-success" : run.status === "failed" ? "bg-destructive" : "bg-muted-foreground/40";
  return (
    <li className="flex gap-3 py-3">
      <span aria-hidden className={`mt-2 size-2 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">
          <span className="sr-only">{label(t.runStatus, run.status)}: </span>
          {runSentence(run, t)}
          {run.subject && (
            <span className="text-muted-foreground">
              {" "}
              · <bdi>{run.subject}</bdi>
            </span>
          )}
        </p>
        <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
          {locale === "ar" && run.nameAr ? run.nameAr : run.name} · {timeAgo(run.createdAt, locale)}
        </p>
      </div>
    </li>
  );
}

type TaskLike = { kind: string; title: string };
/** Custom tasks show their own title; rule-made tasks show the task type plus what it is about. */
export function taskTitle(task: TaskLike, t: Dict): string {
  if (task.kind === "custom") return task.title || label(t.taskKind, "custom");
  const base = label(t.taskKind, task.kind);
  return task.title ? `${base}: ${task.title}` : base;
}
