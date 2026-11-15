"use client";

import { Check, Download, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { MARKETPLACES, MARKETPLACE_META } from "@/lib/catalog";

/** Shared building blocks for the list pages: add form, CSV import, inline status, inline numbers, delete. */

export type FormState = { ok?: boolean; error?: string };
export type FieldDef = {
  name: string;
  label: string;
  type?: "text" | "number" | "select" | "date" | "month" | "textarea" | "tel" | "email";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  help?: string;
  wide?: boolean;
  min?: number;
  max?: number;
  step?: number;
  dir?: "ltr" | "rtl" | "auto";
};
export type AddConfig = {
  button: string;
  title: string;
  submit: string;
  fields: FieldDef[];
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
};
export type ImportConfig = {
  type: string;
  clients: { id: number; name: string }[];
  /** Ask which marketplace the report came from. */
  marketplace?: boolean;
  /** Ask which month the report covers; the value is the default month. */
  month?: string;
  template: string;
  columns: string;
};

function AddPanel({ config, onDone }: { config: AddConfig; onDone: () => void }) {
  const [error, setError] = useState("");
  const [saving, start] = useTransition();
  const slug = config.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  // Submitted by hand (not through the form's action) so a validation error does not wipe what was typed.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setError("");
    start(async () => {
      try {
        const res = await config.action({}, data);
        if (res.ok) {
          form.reset();
          onDone();
        } else setError(res.error ?? "That could not be saved.");
      } catch {
        setError("That could not be saved. Try again.");
      }
    });
  };

  return (
    <section className="card rise mt-4 p-5 sm:p-6" aria-labelledby={`${slug}-title`}>
      <h2 id={`${slug}-title`} className="h-section">{config.title}</h2>
      <form onSubmit={onSubmit} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {config.fields.map((f) => {
          const id = `${slug}-${f.name}`;
          const span = f.type === "textarea" ? "sm:col-span-2 lg:col-span-4" : f.wide ? "sm:col-span-2" : "";
          const shared = { id, name: f.name, required: f.required, defaultValue: f.defaultValue, className: "field", "aria-describedby": f.help ? `${id}-help` : undefined };
          return (
            <div key={f.name} className={`min-w-0 ${span}`}>
              <label className="label" htmlFor={id}>{f.label}</label>
              {f.type === "select" ? (
                <select {...shared}>
                  {(f.options ?? []).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea {...shared} rows={3} placeholder={f.placeholder} dir={f.dir ?? "auto"} maxLength={3000} />
              ) : (
                <input {...shared} type={f.type ?? "text"} inputMode={f.type === "number" ? "decimal" : undefined} min={f.min} max={f.max} step={f.step} placeholder={f.placeholder} dir={f.dir} autoComplete="off" />
              )}
              {f.help && <p id={`${id}-help`} className="mt-1.5 text-xs leading-snug text-muted-foreground">{f.help}</p>}
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {config.submit}
          </button>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
      </form>
    </section>
  );
}

function ImportPanel({ config }: { config: ImportConfig }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const body = new FormData(form);
    body.set("type", config.type);
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/import", { method: "POST", body });
      const data = await res.json();
      setResult({ ok: Boolean(data.ok), text: data.ok ? String(data.message ?? "Imported.") : String(data.error ?? "The import failed.") });
      if (data.ok) {
        form.reset();
        router.refresh();
      }
    } catch {
      setResult({ ok: false, text: "The import failed. Check your connection and try again." });
    }
    setBusy(false);
  };

  return (
    <section className="card rise mt-4 p-5 sm:p-6" aria-labelledby={`import-${config.type}`}>
      <h2 id={`import-${config.type}`} className="h-section">Import a CSV or Excel file</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Columns are matched by their header, so a marketplace report works as it is. Expected columns: {config.columns}.
      </p>
      <form onSubmit={onSubmit} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label" htmlFor={`imp-client-${config.type}`}>Client</label>
          <select id={`imp-client-${config.type}`} name="clientId" className="field" required>
            {config.clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        {config.marketplace && (
          <div>
            <label className="label" htmlFor={`imp-market-${config.type}`}>Marketplace</label>
            <select id={`imp-market-${config.type}`} name="marketplace" className="field">
              {MARKETPLACES.map((m) => (
                <option key={m} value={m}>{MARKETPLACE_META[m].label}</option>
              ))}
            </select>
          </div>
        )}
        {config.month && (
          <div>
            <label className="label" htmlFor={`imp-month-${config.type}`}>Month the report covers</label>
            <input id={`imp-month-${config.type}`} name="month" type="month" className="field" defaultValue={config.month} required />
          </div>
        )}
        <div className="sm:col-span-2">
          <label className="label" htmlFor={`imp-file-${config.type}`}>File</label>
          <input
            id={`imp-file-${config.type}`}
            name="file"
            type="file"
            required
            accept=".csv,.xlsx,.xlsm,.txt,.tsv"
            className="block w-full text-sm text-muted-foreground file:me-3 file:cursor-pointer file:rounded-full file:border file:border-border file:bg-card file:px-4 file:py-2 file:text-sm file:text-foreground"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
          <button type="submit" className="btn btn-primary" disabled={busy || config.clients.length === 0}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Upload size={16} aria-hidden />}
            {busy ? "Importing…" : "Import"}
          </button>
          <a href={config.template} download className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-flow-green hover:underline">
            <Download size={15} aria-hidden />
            Download a template
          </a>
        </div>
      </form>
      <div role="status" aria-live="polite">
        {result && (
          <p className={`mt-4 flex gap-2.5 rounded-xl px-4 py-3 text-sm ${result.ok ? "bg-lime-soft text-forest" : "bg-danger-soft text-danger"}`}>
            {result.ok ? <Check size={16} aria-hidden className="mt-0.5 shrink-0" /> : <X size={16} aria-hidden className="mt-0.5 shrink-0" />}
            <span className="min-w-0 break-words">{result.text}</span>
          </p>
        )}
      </div>
    </section>
  );
}

/** Filters on the left, "Import CSV" and "Add" on the right, with their panels opening underneath. */
export function Toolbar({ add, importer, children }: { add?: AddConfig; importer?: ImportConfig; children?: ReactNode }) {
  const [open, setOpen] = useState<"" | "add" | "import">("");
  const close = useCallback(() => setOpen(""), []);
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">{children}</div>
        {importer && (
          <button type="button" className="btn btn-ghost" aria-expanded={open === "import"} onClick={() => setOpen(open === "import" ? "" : "import")}>
            <Upload size={16} aria-hidden />
            Import CSV
          </button>
        )}
        {add && (
          <button type="button" className="btn btn-primary" aria-expanded={open === "add"} onClick={() => setOpen(open === "add" ? "" : "add")}>
            {open === "add" ? <X size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
            {open === "add" ? "Cancel" : add.button}
          </button>
        )}
      </div>
      {open === "add" && add && <AddPanel config={add} onDone={close} />}
      {open === "import" && importer && <ImportPanel config={importer} />}
    </div>
  );
}

export function StatusSelect({ value, options, action, label }: { value: string; options: { value: string; label: string }[]; action: (value: string) => Promise<unknown>; label: string }) {
  const [local, setLocal] = useState(value);
  const [pending, start] = useTransition();
  useEffect(() => setLocal(value), [value]);
  return (
    <select
      aria-label={label}
      className="field !min-h-8 w-auto !py-1 text-[13px]"
      value={local}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        setLocal(next);
        start(async () => {
          await action(next);
        });
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function DeleteButton({ action, label, confirm }: { action: () => Promise<unknown>; label: string; confirm: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-icon"
      aria-label={label}
      title={label}
      disabled={pending}
      onClick={() => {
        if (window.confirm(confirm)) start(async () => void (await action()));
      }}
    >
      {pending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Trash2 size={15} aria-hidden />}
    </button>
  );
}

type NumberField = { name: string; label: string; value?: number | null; min?: number; max?: number };

/** A few number inputs and a save button on one line (stock counts, rank checks). */
export function InlineEdit({
  fields,
  action,
  submit,
  label,
  clearOnSave,
}: {
  fields: NumberField[];
  action: (values: Record<string, number>) => Promise<{ ok: boolean; message?: string }>;
  submit: string;
  label: string;
  clearOnSave?: boolean;
}) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const values: Record<string, number> = {};
    for (const f of fields) {
      const raw = String(data.get(f.name) ?? "").trim();
      if (raw === "" || Number.isNaN(Number(raw))) return setNote("Enter a number.");
      values[f.name] = Number(raw);
    }
    start(async () => {
      try {
        const res = await action(values);
        setNote(res.message ?? (res.ok ? "Saved" : "Could not save."));
        if (res.ok && clearOnSave) form.reset();
      } catch {
        setNote("Could not save.");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} aria-label={label} className="flex flex-wrap items-end gap-2">
      {fields.map((f) => (
        <label key={f.name} className="block">
          <span className="mb-1 block text-xs text-muted-foreground">{f.label}</span>
          <input name={f.name} type="number" inputMode="numeric" defaultValue={f.value ?? ""} min={f.min} max={f.max} className="field !min-h-8 w-[5.25rem] !py-1 text-[13px]" />
        </label>
      ))}
      <button type="submit" className="btn btn-ghost btn-sm" disabled={pending}>
        {pending && <Loader2 size={14} className="animate-spin" aria-hidden />}
        {submit}
      </button>
      <span role="status" aria-live="polite" className="basis-full text-xs leading-snug text-muted-foreground empty:hidden">{note}</span>
    </form>
  );
}
