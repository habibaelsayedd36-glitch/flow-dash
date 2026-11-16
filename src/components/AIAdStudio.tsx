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
  const originalUrl = useRef("");

  useEffect(() => () => {
    if (originalUrl.current) URL.revokeObjectURL(originalUrl.current);
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
      setStatus("Connecting to Cloudflare AI…");
      // Use the uploaded photo as an image reference so the model can improve the actual composition, lighting and presentation.
      const prompt = [
        "Create a clean, realistic commercial product photograph based on the supplied reference image.",
        "Show the same ordinary retail product, upright and centered, with its packaging and visible design kept as close to the reference as possible.",
        "Use even professional studio lighting, accurate natural colors, clear focus, a plain pure white background and a soft realistic contact shadow.",
        "Keep the complete item in frame. Do not add people, hands, props, extra objects, decorative text or watermarks.",
        "Square ecommerce product photo.",
      ].join(" ");
      setProgress(12);
      setStatus("Sending your original product photo to Cloudflare image editing…");
      // FLUX.2 Klein accepts reference images up to 512x512.
      const sourceBitmap = await createImageBitmap(file);
      const inputCanvas = document.createElement("canvas");
      const inputScale = Math.min(512 / sourceBitmap.width, 512 / sourceBitmap.height, 1);
      inputCanvas.width = Math.max(1, Math.round(sourceBitmap.width * inputScale));
      inputCanvas.height = Math.max(1, Math.round(sourceBitmap.height * inputScale));
      const inputContext = inputCanvas.getContext("2d");
      if (!inputContext) {
        sourceBitmap.close();
        throw new Error("Your browser could not prepare the product image.");
      }
      inputContext.drawImage(sourceBitmap, 0, 0, inputCanvas.width, inputCanvas.height);
      sourceBitmap.close();
      const modelInputBlob = await canvasBlob(inputCanvas);
      const bytes = new Uint8Array(await modelInputBlob.arrayBuffer());
      let binary = "";
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
      }
      const image_b64 = btoa(binary);
      const controller = new AbortController();
      const requestTimer = window.setTimeout(() => controller.abort(), 52_000);
      let response: Response;
      try {
        response = await fetch("/api/ai-ad/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, image_b64, image_type: "image/png" }),
          signal: controller.signal,
        });
      } catch (requestError) {
        if (controller.signal.aborted) throw new Error("Cloudflare image editing took too long. Please try again.");
        throw requestError;
      } finally {
        window.clearTimeout(requestTimer);
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "Cloud image editing failed.");
      }
      setProgress(82);
      setStatus("Finishing the edited product image…");
      const generatedBlob = await response.blob();
      if (!generatedBlob.size || !generatedBlob.type.startsWith("image/")) {
        throw new Error("Cloud AI returned an invalid image. Please try again.");
      }
      const generated = await createImageBitmap(generatedBlob);
      const canvas = document.createElement("canvas");
      canvas.width = 2000;
      canvas.height = 2000;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Your browser could not create the final image.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 2000, 2000);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      const scale = Math.min(2000 / generated.width, 2000 / generated.height);
      const w = generated.width * scale, h = generated.height * scale;
      ctx.drawImage(generated, (2000 - w) / 2, (2000 - h) / 2, w, h);
      generated.close();
      const blob = await canvasBlob(canvas);
      setStatus("Your AI-edited Amazon image is ready.");
      setProgress(100);
      setPreview(URL.createObjectURL(blob));
      setStatus("Your Amazon-ready main image is ready.");
      setProgress(100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong while creating the ad.");
      setStatus("");
      setProgress(0);
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!preview) return;
    const a = document.createElement("a");
    a.href = preview;
    a.download = "flow-amazon-main-image.png";
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
            <h3 className="h-section">Amazon main image result</h3>
            <span className="rounded-full bg-lime-soft px-3 py-1 text-xs font-medium text-forest">Cloud AI image editing</span>
          </div>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="AI-generated product advertising scene" className="mx-auto aspect-square w-full max-w-xl rounded-xl object-contain" />
          ) : (
            <div className="grid aspect-square w-full place-items-center rounded-xl bg-sage-soft text-center text-sm text-mute">
              <div className="max-w-xs px-6">
                <Sparkles className="mx-auto mb-3 text-moss" size={30} />
                Your Amazon-ready main image will appear here.
              </div>
            </div>
          )}
          {preview && <button type="button" className="btn btn-primary mt-4 w-full" onClick={download}><Download size={16} /> Download PNG</button>}
        </div>
      </div>

      <aside className="card flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <h2 className="h-section">Create an ad scene</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-mute">Cloudflare edits the uploaded product photo directly to improve alignment, lighting, colors and studio presentation.</p>
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
        {busy && <div className="space-y-2" aria-live="polite"><div className="h-2 overflow-hidden rounded-full bg-sage-soft"><div className="h-full rounded-full bg-forest transition-all" style={{ width: progress + "%" }} /></div><p className="text-xs leading-relaxed text-mute">{status || "Working…"}</p><p className="text-[11px] text-mute">Keep this tab open while the image is being prepared.</p></div>}
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="border-t border-line pt-4 text-xs leading-relaxed text-mute">
          Amazon main-image preset · Pure white background · Original product preserved · 2000 × 2000 px export. Cloud AI edits the original product photo directly.
        </div>
      </aside>
    </section>
  );
}
