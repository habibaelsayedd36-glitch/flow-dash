"use client";

import { zipSync } from "fflate";
import { Download, ImagePlus, Loader2, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { logImageJobAction } from "@/app/actions-tools";
import { FLAG_TEXT, IMAGE_PRESETS, ModelLoadError, compose, cutout, toJpeg, type Cutout, type Flag, type PresetId } from "@/lib/image-engine";

type Angle = "front" | "side" | "back" | "detail";
type Shot = { id: string; file: File; original: string; preview: string | null; cut: Cutout | null; flags: Flag[]; state: "queued" | "working" | "done" | "error"; angle: Angle };

const ANGLES: Angle[] = ["front", "side", "back", "detail"];
const ANGLE_LABEL: Record<Angle, string> = { front: "Front (main)", side: "Side", back: "Back", detail: "Detail" };
const PRESET_IDS = Object.keys(IMAGE_PRESETS) as PresetId[];
const slug = (s: string) => s.trim().replace(/\.[a-z0-9]+$/i, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "image";

export function ImageStudio({ mode }: { mode: "cleanup" | "shots" }) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [tolerance, setTolerance] = useState(65);
  const [fill, setFill] = useState(85);
  const [size, setSize] = useState(2000);
  const [sku, setSku] = useState("");
  const [markets, setMarkets] = useState<PresetId[]>(["amazon", "noon"]);
  const [zipping, setZipping] = useState(false);
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  const [modelError, setModelError] = useState(false);
  const shotsRef = useRef<Shot[]>([]);
  const running = useRef(false);
  const settings = useRef({ tolerance, fill });
  shotsRef.current = shots;
  settings.current = { tolerance, fill };

  const patch = (id: string, p: Partial<Shot>) => setShots((list) => list.map((s) => (s.id === id ? { ...s, ...p } : s)));

  // One photo at a time: full-resolution canvases are large, so the queue never runs in parallel.
  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    for (;;) {
      const next = shotsRef.current.find((s) => s.state === "queued");
      if (!next) break;
      patch(next.id, { state: "working" });
      await new Promise((r) => setTimeout(r, 30));
      try {
        const cut = await cutout(next.file, settings.current.tolerance);
        const blob = await toJpeg(compose(cut, 720, settings.current.fill / 100), 0.88);
        if (next.preview) URL.revokeObjectURL(next.preview);
        patch(next.id, { state: "done", cut, flags: cut.flags, preview: URL.createObjectURL(blob) });
        setModelError(false);
      } catch (e) {
        if (e instanceof ModelLoadError) setModelError(true);
        patch(next.id, { state: "error" });
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    running.current = false;
  }, []);

  useEffect(() => {
    if (shots.some((s) => s.state === "queued")) void pump();
  }, [shots, pump]);

  const add = (files: FileList | File[] | null) => {
    const images = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    setMessage("");
    setShots((list) => [
      ...list,
      ...images.map((file, i): Shot => ({
        id: `${Date.now()}-${i}-${file.name}`,
        file,
        original: URL.createObjectURL(file),
        preview: null,
        cut: null,
        flags: [],
        state: "queued",
        angle: ANGLES[Math.min(list.length + i, 3)],
      })),
    ]);
  };

  const remove = (id: string) =>
    setShots((list) => {
      const s = list.find((x) => x.id === id);
      if (s) {
        URL.revokeObjectURL(s.original);
        if (s.preview) URL.revokeObjectURL(s.preview);
      }
      return list.filter((x) => x.id !== id);
    });

  const reprocess = () => setShots((list) => list.map((s) => ({ ...s, state: "queued" as const })));

  const done = shots.filter((s) => s.state === "done" && s.cut);
  const flagged = done.filter((s) => s.flags.length > 0).length;
  const busy = shots.some((s) => s.state === "queued" || s.state === "working");

  const download = async () => {
    if (done.length === 0) return;
    setZipping(true);
    setMessage("");
    try {
      const files: Record<string, Uint8Array> = {};
      const bytes = async (c: Cutout, px: number, ratio: number) => new Uint8Array(await (await toJpeg(compose(c, px, ratio))).arrayBuffer());
      if (mode === "cleanup") {
        const used = new Set<string>();
        for (const s of done) {
          let name = slug(s.file.name);
          while (used.has(name)) name += "-2";
          used.add(name);
          files[`${name}.jpg`] = await bytes(s.cut as Cutout, size, fill / 100);
        }
      } else {
        const id = slug(sku || "product");
        for (const m of markets) {
          const preset = IMAGE_PRESETS[m];
          let extra = 0;
          const seen: Record<string, number> = {};
          for (const s of done) {
            let name: string;
            if (m === "amazon") {
              // Amazon's bulk image naming: identifier.MAIN / .PT01 … .PT08
              name = s.angle === "front" && !seen.front ? `${id}.MAIN` : `${id}.PT${String(++extra).padStart(2, "0")}`;
            } else {
              const count = (seen[s.angle] ?? 0) + 1;
              name = `${id}_${s.angle}${count > 1 || s.angle === "detail" ? `-${count}` : ""}`;
            }
            seen[s.angle] = (seen[s.angle] ?? 0) + 1;
            files[`${preset.label.replace(/\s+/g, "-")}/${name}.jpg`] = await bytes(s.cut as Cutout, preset.size, preset.fill);
          }
        }
      }
      const zip = zipSync(files, { level: 0 });
      const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: "application/zip" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = mode === "cleanup" ? "flow-clean-images.zip" : `${slug(sku || "product")}-marketplace-images.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      const total = Object.keys(files).length;
      setMessage(`${total} images saved to your downloads.`);
      await logImageJobAction({
        type: mode,
        title: mode === "cleanup" ? `${done.length} photos cleaned` : `${sku || "Product"}: ${done.length} shots`,
        total,
        flagged,
        marketplace: mode === "shots" ? markets.map((m) => IMAGE_PRESETS[m].label).join(", ") : `${size} px`,
      });
    } catch {
      setMessage("The ZIP could not be created. Try fewer photos at a time.");
    }
    setZipping(false);
  };

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); add(e.dataTransfer.files); }}
          className={`flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors focus-within:border-moss ${dragging ? "border-moss bg-lime-soft" : "border-input bg-sage-soft hover:border-moss"}`}
        >
          <span className="grid size-12 place-items-center rounded-full bg-white text-moss">
            <ImagePlus size={22} aria-hidden />
          </span>
          <span className="font-display text-base font-medium text-ink">Drop product photos here, or choose files</span>
          <span className="max-w-md text-[13px] leading-relaxed text-mute">JPEG, PNG or WebP. Photos are processed in your browser and never leave this computer.</span>
          <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
        </label>

        {modelError && (
          <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            The AI cut-out model could not be loaded. Check your internet connection, then press “Re-run with these settings”.
          </p>
        )}

        {shots.length > 0 && (
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {shots.map((s) => (
              <li key={s.id} className="card overflow-hidden">
                <div className="grid grid-cols-2 gap-px bg-line">
                  <figure className="bg-sage-soft">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={s.original} alt={`Original: ${s.file.name}`} className="aspect-square w-full object-contain" />
                    <figcaption className="eyebrow px-3 py-2">Original</figcaption>
                  </figure>
                  <figure className="bg-sage-soft">
                    <div className="grid aspect-square w-full place-items-center">
                      {s.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.preview} alt={`Cleaned: ${s.file.name}`} className="size-full object-contain p-2" />
                      ) : s.state === "error" ? (
                        <span className="px-3 text-center text-[13px] text-danger">This photo could not be processed.</span>
                      ) : (
                        <span className="flex flex-col items-center gap-2 px-3 text-center text-[13px] text-mute" role="status">
                          <Loader2 size={22} className="animate-spin text-moss" aria-hidden />
                          {s.state === "working" ? "Cutting out…" : "Waiting"}
                        </span>
                      )}
                    </div>
                    <figcaption className="eyebrow px-3 py-2">Cleaned</figcaption>
                  </figure>
                </div>
                <div className="flex flex-col gap-2.5 p-3.5">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm text-ink">{s.file.name}</p>
                    {mode === "shots" && (
                      <select aria-label={`Angle for ${s.file.name}`} className="field !min-h-8 w-auto !py-1 text-[13px]" value={s.angle} onChange={(e) => patch(s.id, { angle: e.target.value as Angle })}>
                        {ANGLES.map((a) => (
                          <option key={a} value={a}>{ANGLE_LABEL[a]}</option>
                        ))}
                      </select>
                    )}
                    <button type="button" className="btn btn-ghost btn-icon shrink-0" onClick={() => remove(s.id)} aria-label={`Remove ${s.file.name}`}>
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </div>
                  {s.flags.map((f) => (
                    <p key={f} className="flex gap-2 rounded-lg bg-amber-soft px-3 py-2 text-[13px] leading-snug text-amber-ink">
                      <TriangleAlert size={14} aria-hidden className="mt-0.5 shrink-0" />
                      {FLAG_TEXT[f]}
                    </p>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <aside className="card flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <h2 className="h-section">{mode === "cleanup" ? "Output" : "Product and marketplaces"}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-mute">
            {mode === "shots" ? "Upload the front, side and back photos you shot. Nothing is generated: every shot is your own photo, cleaned. " : ""}
            The cut-out runs in your browser with an open-source AI model. The first photo takes longer while the model downloads, then allow 10 to 20 seconds per photo.
          </p>
        </div>

        {mode === "shots" ? (
          <>
            <div>
              <label className="label" htmlFor="im-sku">SKU or ASIN</label>
              <input id="im-sku" className="field" value={sku} maxLength={40} placeholder="Used in the file names" autoComplete="off" onChange={(e) => setSku(e.target.value)} />
            </div>
            <fieldset className="min-w-0">
              <legend className="label">Export for</legend>
              <div className="flex flex-col gap-2">
                {PRESET_IDS.map((m) => (
                  <label key={m} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line px-3 py-2.5 has-checked:border-forest has-checked:bg-lime-soft">
                    <input type="checkbox" className="mt-1 size-4 shrink-0 accent-flow-green" checked={markets.includes(m)} onChange={(e) => setMarkets((list) => (e.target.checked ? [...list, m] : list.filter((x) => x !== m)))} />
                    <span className="font-body text-sm text-ink">
                      {IMAGE_PRESETS[m].label} · <span className="num">{IMAGE_PRESETS[m].size}</span> px
                      <span className="block text-xs leading-snug text-mute">{IMAGE_PRESETS[m].rule}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        ) : (
          <>
            <div>
              <label className="label" htmlFor="im-size">Size</label>
              <select id="im-size" className="field" value={size} onChange={(e) => setSize(Number(e.target.value))}>
                {[1200, 1500, 2000, 2048, 3000].map((px) => (
                  <option key={px} value={px}>{px} x {px} px</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="im-fill">Product fills <span className="num">{fill}%</span> of the frame</label>
              <input id="im-fill" type="range" min={60} max={95} step={5} value={fill} onChange={(e) => setFill(Number(e.target.value))} className="w-full accent-flow-green" />
            </div>
          </>
        )}

        <div>
          <label className="label" htmlFor="im-tol">Shadow removal <span className="num">{tolerance}</span></label>
          <input id="im-tol" type="range" min={10} max={100} step={5} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="w-full accent-flow-green" />
          <p className="mt-1 text-xs leading-snug text-mute">Raise it if a trace of shadow remains. Lower it if soft edges such as glass or fur are being trimmed.</p>
          <button type="button" className="btn btn-ghost btn-sm mt-2.5" onClick={reprocess} disabled={shots.length === 0 || busy}>
            <RefreshCw size={14} aria-hidden />
            Re-run with these settings
          </button>
        </div>

        <div className="border-t border-line pt-5">
          <p className="num text-sm text-mute">
            {done.length} of {shots.length} ready{flagged > 0 ? ` · ${flagged} flagged` : ""}
          </p>
          <button type="button" className="btn btn-primary mt-3 w-full" onClick={download} disabled={done.length === 0 || busy || zipping || (mode === "shots" && markets.length === 0)}>
            {zipping ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Download size={16} aria-hidden />}
            {zipping ? "Building ZIP…" : "Download ZIP"}
          </button>
          <p role="status" aria-live="polite" className={message ? "mt-3 rounded-xl bg-lime-soft px-3 py-2 text-sm text-forest" : "sr-only"}>{message}</p>
          <p className="mt-4 text-xs leading-relaxed text-mute">Cut-out model: IMG.LY background-removal, open source under AGPL-3.0.</p>
        </div>
      </aside>
    </div>
  );
}
