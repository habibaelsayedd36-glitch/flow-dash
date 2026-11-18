"use client";

import { Check, Download, FileSpreadsheet, Loader2, PackagePlus, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { finishJobAction, importJobAction, processJobItemAction, pauseJobAction, retryFailedJobItemsAction, verifyJobItemAction } from "@/app/actions-tools";
import { ScoreBadge } from "./ui";

type Item = {
  index: number;
  sku: string;
  name: string;
  status: string;
  title: string;
  titleAr: string;
  score: number | null;
  engine: string | null;
  flags: string[];
  hasEstimates: boolean;
  error: string | null;
};

export function JobRunner({ jobId, items, hasClient, clientName, imported, status }: { jobId: number; items: Item[]; hasClient: boolean; clientName: string | null; imported: boolean; status: string }) {
  const router = useRouter();
  const pending = items.filter((i) => i.status === "pending");
  const [processed, setProcessed] = useState(0);
  const pendingKey = pending.map((item) => item.index).join(",");
  const [includeEstimates, setIncludeEstimates] = useState(false);
  const [busy, setBusy] = useState<"" | "import" | number>("");
  const [notice, setNotice] = useState("");
  const started = useRef(false);

  // Rows are written one request at a time (two in parallel), so a reload simply resumes the job.
  useEffect(() => {
    if (status !== "running" || pending.length === 0 || started.current) return;
    started.current = true;
    const queue = pending.map((i) => i.index);
    let cancelled = false;
    const worker = async () => {
      while (!cancelled && queue.length > 0) {
        const index = queue.shift();
        if (index === undefined) return;
        try {
          const result = await processJobItemAction(jobId, index);
          if (result.pause) cancelled = true;
        } catch {
          // left pending: it is retried on the next load
        }
        setProcessed((n) => n + 1);
      }
    };
    Promise.all([worker(), worker()]).then(async () => {
      if (cancelled) {
        started.current = false;
        await pauseJobAction(jobId);
        router.refresh();
        return;
      }
      started.current = false;
      await finishJobAction(jobId);
      router.refresh();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, pendingKey]);

  const running = status === "running" && pending.length > 0;
  const done = items.filter((i) => i.status === "done");
  const failed = items.filter((i) => i.status === "failed");
  const flagged = items.filter((i) => i.flags.length > 0).length;
  const estimates = items.filter((i) => i.hasEstimates).length;
  const scores = done.map((i) => i.score ?? 0);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const aiCount = done.filter((i) => i.engine === "ai").length;
  const flat = (lang: string) => `/api/jobs/${jobId}/download?file=flat&lang=${lang}${includeEstimates ? "&estimates=1" : ""}`;

  const verify = async (index: number) => {
    setBusy(index);
    await verifyJobItemAction(jobId, index);
    setBusy("");
    router.refresh();
  };
  const retryFailed = async () => {
    setBusy("import");
    await retryFailedJobItemsAction(jobId);
    setBusy("");
    router.refresh();
  };
  const addToPipeline = async () => {
    setBusy("import");
    const res = await importJobAction(jobId);
    setBusy("");
    setNotice(res.ok ? `${res.created} products added to ${clientName ?? "the client"}'s pipeline as listing drafts.` : (res.error ?? "Could not add to the pipeline."));
    router.refresh();
  };

  if (running) {
    const total = pending.length;
    const pct = Math.round((Math.min(processed, total) / total) * 100);
    return (
      <section className="card p-6 sm:p-8" aria-live="polite">
        <div className="flex items-center gap-3">
          <Loader2 size={20} className="animate-spin text-moss" aria-hidden />
          <h2 className="h-section">Writing listings: {Math.min(processed, total)} of {total}</h2>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-sage" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Job progress">
          <div className="h-full rounded-full bg-moss transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-mute">Progress is saved after every product. You can pause and resume this batch at any time.</p>
          <button type="button" className="btn btn-ghost" onClick={async () => { await pauseJobAction(jobId); router.refresh(); }}>Pause batch</button>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-label="Job summary">
        {[
          { label: "Listings written", value: done.length, hint: aiCount > 0 ? `${aiCount} by AI` : "AI generated" },
          { label: "Rows to check", value: flagged, hint: flagged === 0 ? "Nothing flagged" : "See the flags below" },
          { label: "Unverified estimates", value: estimates, hint: estimates === 0 ? "None" : "Left out of the flat file" },
          { label: "Average score", value: avg, hint: "Marketplace compliance" },
        ].map((k) => (
          <div key={k.label} className="card flex flex-col p-5">
            <span className="text-[13px] text-mute">{k.label}</span>
            <span className="num mt-3 font-display text-3xl font-bold leading-none text-flow-green">{k.value}</span>
            <span className="mt-auto pt-3 text-[13px] text-mute">{k.hint}</span>
          </div>
        ))}
      </section>

      <section className="card p-5 sm:p-6" aria-labelledby="downloads">
        <h2 id="downloads" className="h-section">Downloads</h2>
        {failed.length > 0 && <p className="mt-2 text-sm text-danger">{failed.length} rows were not generated. Progress is saved. Resume after the provider quota resets or service recovers.</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={`/api/jobs/${jobId}/download?file=collecting`} className="btn btn-primary">
            <FileSpreadsheet size={16} aria-hidden />
            Collecting sheet (.xlsx)
          </a>
          <a href={flat("en")} className="btn btn-ghost">
            <Download size={16} aria-hidden />
            Amazon flat file · English
          </a>
          <a href={flat("ar")} className="btn btn-ghost">
            <Download size={16} aria-hidden />
            Amazon flat file · Arabic
          </a>
          {(failed.length > 0 || status === "paused") && <button type="button" className="btn btn-primary" onClick={retryFailed} disabled={busy !== ""}>{status === "paused" ? "Resume saved batch" : `Retry ${failed.length} failed rows`}</button>}
          {hasClient && (
            <button type="button" className="btn btn-ghost" onClick={addToPipeline} disabled={imported || busy !== "" || failed.length > 0 || pending.length > 0}>
              {busy === "import" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : imported ? <Check size={16} aria-hidden /> : <PackagePlus size={16} aria-hidden />}
              {imported ? "Added to pipeline" : "Add to pipeline"}
            </button>
          )}
        </div>
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-ink">
          <input type="checkbox" className="mt-1 size-4 shrink-0 accent-flow-green" checked={includeEstimates} onChange={(e) => setIncludeEstimates(e.target.checked)} />
          <span className="font-body">
            Include unverified estimates in the flat file
            <span className="mt-0.5 block text-[13px] text-mute">
              Off by default: a flat file cannot carry flags, so estimated specs are left blank until someone marks the row as verified. The collecting sheet always shows them, highlighted in amber.
            </span>
          </span>
        </label>
        <p className="mt-4 border-t border-line pt-4 text-[13px] leading-relaxed text-mute">
          Run the flat file through “Check my file” in Seller Central before a live upload. Required fields change by category and marketplace.
        </p>
        <p role="status" aria-live="polite" className={notice ? "mt-3 rounded-xl bg-lime-soft px-4 py-2.5 text-sm text-forest" : "sr-only"}>{notice}</p>
      </section>

      <section className="card overflow-hidden" aria-labelledby="rows">
        <h2 id="rows" className="h-section px-5 pt-5 sm:px-6">Rows</h2>
        <ul className="mt-3 divide-y divide-line">
          {items.map((item) => (
            <li key={item.index} className="flex flex-col gap-3 px-5 py-4 sm:px-6 lg:flex-row lg:items-start lg:gap-6">
              <div className="min-w-0 lg:w-56 lg:shrink-0">
                <p className="truncate text-sm font-medium text-ink" dir="auto">{item.name}</p>
                <p className="mt-0.5 text-[13px] text-mute">{item.sku || "No SKU"} · {item.engine === "ai" ? "AI" : item.status === "failed" ? "Needs retry" : "Pending"}</p>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-ink">{item.title || "No title"}</p>
                {item.titleAr && <p className="mt-1 text-sm leading-relaxed text-mute" lang="ar" dir="rtl">{item.titleAr}</p>}
                {item.flags.length > 0 && (
                  <ul className="mt-2.5 flex flex-wrap gap-1.5">
                    {item.flags.map((f) => (
                      <li key={f} className="pill pill-warn !h-auto !whitespace-normal py-1 text-start leading-snug">
                        <TriangleAlert size={12} aria-hidden className="shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
                {item.error && <p className="mt-2 text-[13px] text-danger">Not generated — {item.error}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2 lg:flex-col lg:items-end">
                {item.score !== null && <ScoreBadge score={item.score} labelText="Score" />}
                {item.hasEstimates && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => verify(item.index)} disabled={busy !== ""}>
                    {busy === item.index ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Check size={14} aria-hidden />}
                    Mark verified
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
