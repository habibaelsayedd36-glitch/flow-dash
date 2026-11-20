"use client";

import { Download, FileSpreadsheet, Loader2, Play, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { startListingJobAction } from "@/app/actions-tools";
import { MARKETPLACES, MARKETPLACE_META } from "@/lib/catalog";
import { FIELDS, type FieldKey, type Mapping } from "@/lib/job-fields";

const IMPORT_FIELDS = FIELDS.filter((field) => ["sku", "name", "brand", "barcode", "quantity", "price", "color", "size", "material", "weight", "dimensions", "origin", "features", "featuresAr", "keywords"].includes(field.key));

type Parsed = {
  jobId: number;
  headers: string[];
  preview: string[][];
  total: number;
  truncated: boolean;
  mapping: Mapping;
  fileName: string;
};

export function ListingJobWizard({ clients }: { clients: { id: number; name: string }[] }) {
  const router = useRouter();
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [busy, setBusy] = useState<"" | "upload" | "start">("");
  const [error, setError] = useState("");
  const [opts, setOpts] = useState({
    clientId: clients[0] ? String(clients[0].id) : "",
    marketplace: "amazon",
  });

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setBusy("upload");
    const body = new FormData();
    body.set("file", file);
    body.set("kind", "sheet");
    try {
      const res = await fetch("/api/jobs/upload", { method: "POST", body });
      const data = await res.json();
      if (!data.ok) setError(data.error ?? "Upload failed.");
      else {
        setParsed({ ...data, fileName: file.name });
        setMapping(data.mapping ?? {});
      }
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setBusy("");
    }
  };

  const start = async () => {
    if (!parsed) return;
    if (mapping.name === undefined) return setError("Choose the English product-name column.");
    if (mapping.brand === undefined) return setError("Choose the brand column.");
    if (!opts.clientId) return setError("Choose the client for this batch.");
    setError("");
    setBusy("start");
    const res = await startListingJobAction(parsed.jobId, {
      clientId: Number(opts.clientId),
      marketplace: opts.marketplace,
      productType: "",
      tone: "clear",
      mapping,
    });
    if (res.ok) router.push(`/tools/jobs/${parsed.jobId}`);
    else {
      setError(res.error ?? "The job could not start.");
      setBusy("");
    }
  };

  if (!parsed) {
    return (
      <section className="card p-6 sm:p-8" aria-labelledby="up">
        <h2 id="up" className="h-section">1. Upload the product sheet</h2>
        <p className="mt-1 text-sm text-mute">
          Excel (.xlsx) or CSV, one product per row, up to 1,000 products per batch. The sheet needs only two columns: Product Name (English) and Brand.
        </p>
        <label className="mt-5 flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-input bg-sage-soft px-6 py-12 text-center transition-colors hover:border-moss focus-within:border-moss">
          <span className="grid size-12 place-items-center rounded-full bg-white text-moss">
            {busy === "upload" ? <Loader2 size={22} className="animate-spin" aria-hidden /> : <Upload size={22} aria-hidden />}
          </span>
          <span className="font-display text-base font-medium text-ink">{busy === "upload" ? "Reading the sheet…" : "Choose a file"}</span>
          <span className="text-[13px] text-mute">.xlsx, .csv or tab-delimited .txt, up to 8 MB</span>
          <input type="file" accept=".xlsx,.xlsm,.csv,.txt,.tsv" className="sr-only" disabled={busy !== ""} onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        <a href="/samples/receiving-sheet-sample.csv" download className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-flow-green hover:underline">
          <Download size={15} aria-hidden />
          Download a sample product sheet
        </a>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="card p-5 sm:p-6" aria-labelledby="map">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="map" className="h-section">2. Map your product fields</h2>
            <p className="mt-1 text-sm text-mute">Map SKU and any available product details. Name and Brand are required; other fields are optional and help FLOW avoid guessing.</p>
          </div>
          <span className="pill pill-mute !h-8 !px-3">
            <FileSpreadsheet size={14} aria-hidden />
            {parsed.fileName} · <span className="num">{parsed.total}</span> products
          </span>
        </div>
        {parsed.truncated && <p className="mt-3 rounded-xl bg-amber-soft px-4 py-2.5 text-sm text-amber-ink">Only the first 1,000 rows were loaded. Split larger sheets into separate batches.</p>}
        <ul className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {IMPORT_FIELDS.map((field) => {
            const col = mapping[field.key as FieldKey];
            const example = col !== undefined ? parsed.preview.map((row) => row[col]).find(Boolean) : undefined;
            return (
              <li key={field.key} className="min-w-0">
                <label className="label" htmlFor={`map-${field.key}`}>{field.label}</label>
                <select
                  id={`map-${field.key}`}
                  className="field"
                  value={col ?? ""}
                  onChange={(e) => setMapping((current) => ({ ...current, [field.key]: e.target.value === "" ? undefined : Number(e.target.value) }))}
                >
                  <option value="">Choose a column</option>
                  {parsed.headers.map((header, index) => <option key={index} value={index}>{header}</option>)}
                </select>
                <p className="mt-1 truncate text-xs text-mute" dir="auto">{example ? `Example: ${example}` : "Required column"}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card p-5 sm:p-6" aria-labelledby="opts">
        <h2 id="opts" className="h-section">3. Batch settings</h2>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="lj-client">Client</label>
            <select id="lj-client" className="field" value={opts.clientId} onChange={(e) => setOpts({ ...opts, clientId: e.target.value })}>
              <option value="">Choose a client</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="lj-market">Marketplace</label>
            <select id="lj-market" className="field" value={opts.marketplace} onChange={(e) => setOpts({ ...opts, marketplace: e.target.value })}>
              {MARKETPLACES.map((market) => <option key={market} value={market}>{MARKETPLACE_META[market].label}</option>)}
            </select>
          </div>
        </div>
        <p className="mt-4 rounded-xl bg-sage-soft p-4 text-sm leading-relaxed text-mute">
          FLOW will preserve your SKU (or create one if missing), research each product, and write the English and Arabic listing. Size, weight and dimensions may be shown as estimates; colour, material and country of origin stay blank unless you provide verified values.
        </p>
        {error && <p role="alert" className="mt-4 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" onClick={start} disabled={busy !== ""}>
            {busy === "start" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Play size={15} aria-hidden />}
            Start batch
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => { setParsed(null); setError(""); }} disabled={busy !== ""}>
            Choose another file
          </button>
        </div>
      </section>
    </div>
  );
}
