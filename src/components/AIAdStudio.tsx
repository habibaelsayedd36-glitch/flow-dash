"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ImagePlus, Loader2, Sparkles } from "lucide-react";
import { cutout } from "@/lib/image-engine";

type Style = "luxury" | "minimal" | "nature" | "studio" | "lifestyle";
type Category = "beauty" | "electronics" | "fashion" | "food" | "home" | "general";

const STYLES: Record<Style, string> = {
  luxury: "premium luxury advertising set, elegant dark stone and warm champagne accents, dramatic softbox lighting, refined reflections",
  minimal: "clean modern minimal advertising set, soft neutral beige gradient, elegant geometric plinths, bright diffused studio lighting",
  nature: "fresh botanical advertising set, natural leaves and subtle organic textures, sunlight rays, soft green and cream palette",
  studio: "high-end commercial photography studio, seamless sculptural backdrop, professional three-point lighting, realistic soft shadows",
  lifestyle: "beautiful aspirational lifestyle product photography set, tasteful interior styling, cinematic natural window light, premium editorial composition",
};

const CATEGORIES: Record<Category, string> = {
  beauty: "premium cosmetics and skincare campaign set, elegant glass and stone props, clean spa atmosphere",
  electronics: "premium technology product campaign set, sleek architectural surfaces, subtle LED accents",
  fashion: "premium fashion campaign set, editorial studio environment, sophisticated textures",
  food: "appetizing premium food advertising set, natural ingredients and tasteful serving props",
  home: "beautiful premium homeware campaign set, curated contemporary interior, tactile materials",
  general: "premium ecommerce product advertising set with tasteful category-neutral props",
};

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not export the image."))), "image/png"),
  );
}

export function AIAdStudio() {
  const [file, setFile] = useState<File | null>(null);
  const [style, setStyle] = useState<Style>("luxury");
  const [category, setCategory] = useState<Category>("general");
  const [extra, setExtra] = useState("");
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const originalUrl = useRef("");

  useEffect(() => () => {
    if (originalUrl.current) URL.revokeObjectURL(originalUrl.current);
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const chooseFile = (next: File | null) => {
    if (originalUrl.current) URL.revokeObjectURL(originalUrl.current);
    if (preview) URL.revokeObjectURL(preview);
    setPreview((current) => { if (current) URL.revokeObjectURL(current); return ""; });
    setFile(next);
    setError("");
    originalUrl.current = next ? URL.createObjectURL(next) : "";
  };

  const generate = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    setPreview((current) => { if (current) URL.revokeObjectURL(current); return ""; });
    setProgress(0);
    try {
      setStatus(ready ? "Creating a new advertising background with AI…" : "Loading AI model and tokenizer…");
      const prompt = "Photorealistic premium commercial product photography background only, empty central foreground space reserved for a real product to be composited later. " +
        CATEGORIES[category] + ", " + STYLES[style] + ". " +
        (extra.trim() ? extra.trim() + ". " : "") +
        "Square composition, professional art direction, realistic materials, beautiful depth, crisp detail, balanced composition. " +
        "No product, no bottle, no package, no people, no text, no letters, no logo, no watermark.";
      const worker = workerRef.current ?? new Worker(new URL("../workers/ai-ad.worker.ts", import.meta.url), { type: "module" });
      workerRef.current = worker;
      const id = ++requestId.current;
      const generatedBlob = await new Promise<Blob>((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
          clearTimeout(timeout);
          worker.removeEventListener("message", onMessage);
          worker.removeEventListener("error", onWorkerError);
          worker.removeEventListener("messageerror", onMessageError);
        };
        const finish = (fn: (value: any) => void, value: any) => {
          if (settled) return;
          settled = true;
          cleanup();
          fn(value);
        };
        const onMessage = (event: MessageEvent<{ id: number; type: string; pct?: number; message?: string; ok?: boolean; blob?: Blob }>) => {
          const data = event.data;
          if (data.id !== id) return;
          if (data.type === "progress") {
            if (typeof data.pct === "number") setProgress(data.pct);
            if (data.message) setStatus(data.message);
            return;
          }
          if (data.ok && data.blob) finish(resolve, data.blob);
          else finish(reject, new Error(data.message || "AI background generation failed."));
        };
        const onWorkerError = (event: ErrorEvent) => finish(reject, new Error(event.message || "The AI image worker stopped unexpectedly. Refresh the page and try again."));
        const onMessageError = () => finish(reject, new Error("Could not read the AI worker response. Refresh the page and try again."));
        const timeout = window.setTimeout(() => {
          worker.terminate();
          workerRef.current = null;
          finish(reject, new Error("AI model loading is taking too long. Check your connection, keep this tab open, then try again. The first download is about 2.4 GB."));
        }, 12 * 60 * 1000);
        worker.addEventListener("message", onMessage);
        worker.addEventListener("error", onWorkerError);
        worker.addEventListener("messageerror", onMessageError);
        worker.postMessage({ id, prompt });
      });
      setReady(true);

      setStatus("Placing your original product into the scene…");
      const [background, product] = await Promise.all([
        createImageBitmap(generatedBlob),
        cutout(file, 28),
      ]);
      if (!product.productPx) throw new Error("Could not detect the product. Try a clearer photo with the full product visible.");
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Your browser could not create the final image.");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(background, 0, 0, 1024, 1024);
      background.close();

      const maxSide = 660;
      const scale = maxSide / Math.max(product.canvas.width, product.canvas.height);
      const w = product.canvas.width * scale;
      const h = product.canvas.height * scale;
      const x = (1024 - w) / 2;
      const y = 850 - h;
      ctx.save();
      ctx.filter = "blur(24px)";
      ctx.fillStyle = "rgba(18, 16, 13, 0.26)";
      ctx.beginPath();
      ctx.ellipse(512, 866, Math.max(100, w * 0.34), 28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.drawImage(product.canvas, x, y, w, h);

      const blob = await canvasBlob(canvas);
      setPreview(URL.createObjectURL(blob));
      setStatus("Your AI advertising image is ready.");
      setProgress(100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong while creating the ad.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!preview) return;
    const a = document.createElement("a");
    a.href = preview;
    a.download = "flow-ai-product-ad.png";
    a.click();
  };

  return (
    <section className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <label className="flex min-h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-input bg-sage-soft px-6 py-8 text-center transition hover:border-moss">
          {file && originalUrl.current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={originalUrl.current} alt="Original product" className="max-h-72 max-w-full rounded-xl object-contain" />
          ) : (
            <span className="grid size-14 place-items-center rounded-full bg-white text-moss"><ImagePlus size={25} /></span>
          )}
          <span className="font-display text-base font-semibold text-ink">{file ? "Change product photo" : "Upload a product photo"}</span>
          <span className="text-sm text-mute">Use a clear photo with the full product visible. PNG, JPG or WebP.</span>
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => chooseFile(e.target.files?.[0] ?? null)} />
        </label>
        <div className="card overflow-hidden p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="h-section">AI advertising result</h3>
            <span className="rounded-full bg-lime-soft px-3 py-1 text-xs font-medium text-forest">Generated locally</span>
          </div>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="AI-generated product advertising scene" className="mx-auto aspect-square w-full max-w-xl rounded-xl object-contain" />
          ) : (
            <div className="grid aspect-square w-full place-items-center rounded-xl bg-sage-soft text-center text-sm text-mute">
              <div className="max-w-xs px-6">
                <Sparkles className="mx-auto mb-3 text-moss" size={30} />
                Your new advertising scene will appear here.
              </div>
            </div>
          )}
          {preview && <button type="button" className="btn btn-primary mt-4 w-full" onClick={download}><Download size={16} /> Download PNG</button>}
        </div>
      </div>

      <aside className="card flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <h2 className="h-section">Create an ad scene</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-mute">AI creates a fresh background on your device. FLOW then places your real product photo on top to help preserve its shape, packaging and label.</p>
        </div>
        <div>
          <label className="label" htmlFor="ad-category">Product category</label>
          <select id="ad-category" className="field" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            <option value="general">General product</option><option value="beauty">Beauty & skincare</option><option value="electronics">Electronics</option><option value="fashion">Fashion</option><option value="food">Food & beverage</option><option value="home">Home & living</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ad-style">Advertising style</label>
          <select id="ad-style" className="field" value={style} onChange={(e) => setStyle(e.target.value as Style)}>
            <option value="luxury">Luxury campaign</option><option value="minimal">Minimal & clean</option><option value="nature">Natural & botanical</option><option value="studio">Professional studio</option><option value="lifestyle">Lifestyle editorial</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ad-extra">Scene details (optional)</label>
          <textarea id="ad-extra" className="field min-h-24 resize-y" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Example: warm beige marble, soft sunlight, delicate flowers…" maxLength={240} />
        </div>
        <button type="button" className="btn btn-primary w-full" onClick={generate} disabled={!file || busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {busy ? "Creating your ad…" : "Generate AI ad"}
        </button>
        {busy && <div className="space-y-2"><div className="h-2 overflow-hidden rounded-full bg-sage-soft"><div className="h-full rounded-full bg-forest transition-all" style={{ width: progress + "%" }} /></div><p className="text-xs leading-relaxed text-mute">{status || "Working locally on your device…"}</p></div>}
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        {ready && <p className="text-xs text-forest">AI model loaded and cached in this browser. Next generations won't need the full model download again.</p>}
        <div className="border-t border-line pt-4 text-xs leading-relaxed text-mute">
          Free local generation · No API key · First model download is about 2.3 GB · Requires WebGPU and a compatible GPU. Generation quality and speed depend on your device.
        </div>
      </aside>
    </section>
  );
}
