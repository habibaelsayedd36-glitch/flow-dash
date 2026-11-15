"use client";

import { Download, FileSpreadsheet, Loader2, Play, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { startListingJobAction } from "@/app/actions-tools";
import { MARKETPLACES, MARKETPLACE_META, TONES } from "@/lib/catalog";
import { FIELDS, type FieldKey, type Mapping } from "@/lib/job-fields";

type Parsed = { jobId: number; headers: string[]; preview: string[][]; total: number; truncated: boolean; mapping: Mapping; fileName: string };
const TONE_LABEL: Record<string, string> = { clear: "Clear and factual", premium: "Premium", friendly: "Friendly" };

export function ListingJobWizard({ clients }: { clients: { id: number; name: string }[] }) {
  const router = useRouter();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [busy, setBusy] = useState<"" | "upload" | "template" | "start">("");
  const [error, setError] = useState("");
  const [templateInfo, setTemplateInfo] = useState("");
  const [opts, setOpts] = useState({ clientId: clients[0] ? String(clients[0].id) : "", marketplace: "amazon", productType: "", tone: "clear" });

  const upload = async (file: File | undefined, kind: "sheet" | "template") => {
    if (!file) return;
    setError("");
    setBusy(kind === "sheet" ? "upload" : "template");
    const body = new FormData();
    body.set("file", file);
    body.set("kind", kind);
    if (kind === "template" && parsed) body.set("jobId", String(parsed.jobId));
    try {
      const res = await fetch("/api/jobs/upload", { method: "POST", body });
      const data = await res.json();
      if (!data.ok) setError(data.error ?? "Upload failed.");
      else if (kind === "sheet") {
        setParsed({ ...data, fileName: file.name });
        setMapping(data.mapping ?? {});
      } else setTemplateInfo(`${file.name} attached: ${data.fields} template fields will be kept in order.`);
    } catch {
      setError("Upload failed. Check your connection and try again.");
    }
    setBusy("");
  };

  const start = async () => {
    if (!parsed) return;
    if (mapping.name === undefined && mapping.nameAr === undefined) return setError("Map a product name column before starting.");
    setError("");
    setBusy("start");
    const res = await startListingJobAction(parsed.jobId, { clientId: opts.clientId ? Number(opts.clientId) : null, marketplace: opts.marketplace, productType: opts.productType, tone: opts.tone, mapping });
    if (res.ok) router.push(`/tools/jobs/${parsed.jobId}`);
    else {
      setError(res.error ?? "The job could not start.");
      setBusy("");
    }
  };

  if (!parsed) {
    return (
      <section className="card p-6 sm:p-8" aria-labelledby="up">
        <h2 id="up" className="h-section">1. Upload the receiving sheet</h2>
        <p className="mt-1 text-sm text-mute">Excel (.xlsx) or CSV, first row as column headers, one product per row. Up to 300 rows per job.</p>
        <label className="mt-5 flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-input bg-sage-soft px-6 py-12 text-center transition-colors hover:border-moss focus-within:border-moss">
          <span className="grid size-12 place-items-center rounded-full bg-white text-moss">
            {busy === "upload" ? <Loader2 size={22} className="animate-spin" aria-hidden /> : <Upload size={22} aria-hidden />}
          </span>
          <span className="font-display text-base font-medium text-ink">{busy === "upload" ? "Reading the sheet…" : "Choose a file"}</span>
          <span className="text-[13px] text-mute">.xlsx, .csv or tab-delimited .txt, up to 8 MB</span>
          <input type="file" accept=".xlsx,.xlsm,.csv,.txt,.tsv" className="sr-only" disabled={busy !== ""} onChange={(e) => upload(e.target.files?.[0], "sheet")} />
        </label>
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        <a href="/samples/receiving-sheet-sample.csv" download className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-flow-green hover:underline">
          <Download size={15} aria-hidden />
          Download a sample receiving sheet
        </a>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="card p-5 sm:p-6" aria-labelledby="map">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="map" className="h-section">2. Check the column mapping</h2>
            <p className="mt-1 text-sm text-mute">We matched the columns by their headers. Fix anything that looks wrong.</p>
          </div>
          <span className="pill pill-mute !h-8 !px-3">
            <FileSpreadsheet size={14} aria-hidden />
            {parsed.fileName} · <span className="num">{parsed.total}</span> rows
          </span>
        </div>
        {parsed.truncated && <p className="mt-3 rounded-xl bg-amber-soft px-4 py-2.5 text-sm text-amber-ink">Only the first 300 rows were loaded. Split larger sheets into separate jobs.</p>}

        <ul className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
          {FIELDS.map((f) => {
            const col = mapping[f.key as FieldKey];
            const example = col !== undefined ? parsed.preview.map((r) => r[col]).find(Boolean) : undefined;
            return (
              <li key={f.key} className="min-w-0">
                <label className="label" htmlFor={`map-${f.key}`}>{f.label}</label>
                <select
                  id={`map-${f.key}`}
                  className="field"
                  value={col ?? ""}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value === "" ? undefined : Number(e.target.value) }))}
                >
                  <option value="">Not in this sheet</option>
                  {parsed.headers.map((h, i) => (
                    <option key={i} value={i}>{h}</option>
                  ))}
                </select>
                <p className="mt-1 truncate text-xs text-mute" dir="auto">{example ? `e.g. ${example}` : col === undefined ? "Will be flagged as missing or estimated" : "No value in the first rows"}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card p-5 sm:p-6" aria-labelledby="opts">
        <h2 id="opts" className="h-section">3. Job settings</h2>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="label" htmlFor="lj-client">Client</label>
            <select id="lj-client" className="field" value={opts.clientId} onChange={(e) => setOpts({ ...opts, clientId: e.target.value })}>
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="lj-market">Rules to write for</label>
            <select id="lj-market" className="field" value={opts.marketplace} onChange={(e) => setOpts({ ...opts, marketplace: e.target.value })}>
              {MARKETPLACES.map((m) => (
                <option key={m} value={m}>{MARKETPLACE_META[m].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="lj-type">Amazon product type</label>
            <input id="lj-type" className="field" value={opts.productType} maxLength={60} placeholder="e.g. HOME, KITCHEN" autoComplete="off" onChange={(e) => setOpts({ ...opts, productType: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="lj-tone">Tone</label>
            <select id="lj-tone" className="field" value={opts.tone} onChange={(e) => setOpts({ ...opts, tone: e.target.value })}>
              {TONES.map((t) => (
                <option key={t} value={t}>{TONE_LABEL[t]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-line bg-sage-soft p-4">
          <label className="label" htmlFor="lj-template">Your Seller Central template (optional)</label>
          <p className="mb-3 max-w-2xl text-[13px] leading-relaxed text-mute">
            Amazon templates differ by category. Upload the one you downloaded from Seller Central and the flat file will keep its exact header rows and column order. Without it, the
            file uses the common flat-file field names, which you should check against your category template.
          </p>
          <input id="lj-template" type="file" accept=".xlsx,.xlsm,.txt,.tsv,.csv" disabled={busy !== ""} onChange={(e) => upload(e.target.files?.[0], "template")}
            className="block w-full text-sm text-mute file:me-3 file:cursor-pointer file:rounded-full file:border file:border-line file:bg-white file:px-4 file:py-2 file:font-display file:text-sm file:font-medium file:text-ink" />
          {busy === "template" && <p className="mt-2 text-[13px] text-mute">Reading the template…</p>}
          {templateInfo && <p className="mt-2 text-[13px] text-forest">{templateInfo}</p>}
        </div>

        {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" onClick={start} disabled={busy !== ""}>
            {busy === "start" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Play size={15} aria-hidden />}
            Start job
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => { setParsed(null); setTemplateInfo(""); setError(""); }} disabled={busy !== ""}>
            Use a different sheet
          </button>
        </div>
      </section>
    </div>
  );
}
