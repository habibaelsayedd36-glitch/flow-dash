"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ImagePlus, Loader2, Sparkles } from "lucide-react";

type Style = "luxury" | "minimal" | "nature" | "studio" | "lifestyle";
type Category = "beauty" | "electronics" | "fashion" | "food" | "home" | "general";

const STYLES: Record<Style, string> = {
  luxury: "premium luxury commercial studio lighting, elegant controlled highlights and refined reflections",
  minimal: "bright clean diffused studio lighting, soft subtle contact shadow, minimal polished presentation",
  nature: "soft natural daylight, gentle realistic highlights, fresh clean product photography",
  studio: "high-end professional three-point softbox lighting, crisp details and realistic contact shadow",
  lifestyle: "premium editorial product lighting, soft window-light quality, polished realistic finish",
};

const CATEGORIES: Record<Category, string> = {
  beauty: "premium cosmetics and skincare product photography",
  electronics: "premium electronics product photography with precise clean details",
  fashion: "premium fashion accessory product photography",
  food: "premium packaged food product photography with realistic materials",
  home: "premium homeware product photography",
  general: "premium ecommerce product photography",
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
    setProgress(4);
    try {
      setStatus("Preparing your product reference…");
      const details = extra.trim() ? ` Additional direction: ${extra.trim()}.` : "";
      const prompt = [
        "Create a photorealistic, premium ecommerce product photograph by carefully redrawing and reconstructing the exact same physical product shown in the reference image.",
        "Recreate the complete container or bottle as a realistic three-dimensional object: its body, cap, pump, edges, proportions, material, finish and original product colors. Improve the shape rendering, reflections, lighting and photographic quality without redesigning the packaging.",
        "CRITICAL LABEL PRESERVATION: treat the original front label, logo and all printed packaging artwork as immutable source artwork. Keep the same brand logo, exact words, letters, numbers, typography, layout, colors, symbols and label placement. Do not invent, paraphrase, translate, correct, replace, omit or add any text. Do not create a new brand or alternate label. Preserve the reference label as faithfully as possible.",
        "Place one complete product upright, centered, fully visible, on a perfectly uniform pure white #FFFFFF background. No colored backdrop, gradient, scene, props, hands, people, borders or watermark. Only a very subtle realistic contact shadow directly beneath the product.",
        CATEGORIES[category] + ".",
        STYLES[style] + ".",
        details,
        "Square front-facing Amazon main product image. Photorealistic, sharp, clean, high-end studio photography. The product itself must remain the same item as the reference."
      ].join(" ");
      setProgress(12);
      setStatus("AI is rebuilding the product and its packaging…");

      // FLUX.2 Klein accepts a compact reference image; convert it to PNG at max 512 px.
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
        if (controller.signal.aborted) throw new Error("AI image generation took too long. Please try again.");
        throw requestError;
      } finally {
        window.clearTimeout(requestTimer);
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || "AI image generation failed.");
      }
      setProgress(82);
      setStatus("Finishing the white-background product image…");
      const generatedBlob = await response.blob();
      if (!generatedBlob.size || !generatedBlob.type.startsWith("image/")) {
        throw new Error("AI returned an invalid image. Please try again.");
      }
      const generated = await createImageBitmap(generatedBlob);
      const canvas = document.createElement("canvas");
      canvas.width = 2000;
      canvas.height = 2000;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        generated.close();
        throw new Error("Your browser could not create the final image.");
      }
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, 2000, 2000);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      const scale = Math.min(2000 / generated.width, 2000 / generated.height);
      const w = generated.width * scale;
      const h = generated.height * scale;
      ctx.drawImage(generated, (2000 - w) / 2, (2000 - h) / 2, w, h);
      generated.close();
      const blob = await canvasBlob(canvas);
      setPreview(URL.createObjectURL(blob));
      setStatus("Your AI-redrawn product image is ready.");
      setProgress(100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong while creating the product image.");
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
            <span className="rounded-full bg-lime-soft px-3 py-1 text-xs font-medium text-forest">AI product redraw</span>
          </div>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="AI-redrawn product on white background" className="mx-auto aspect-square w-full max-w-xl rounded-xl object-contain" />
          ) : (
            <div className="grid aspect-square w-full place-items-center rounded-xl bg-sage-soft text-center text-sm text-mute">
              <div className="max-w-xs px-6">
                <Sparkles className="mx-auto mb-3 text-moss" size={30} />
                Your AI-redrawn Amazon product image will appear here.
              </div>
            </div>
          )}
          {preview && <button type="button" className="btn btn-primary mt-4 w-full" onClick={download}><Download size={16} /> Download PNG</button>}
        </div>
      </div>

      <aside className="card flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <h2 className="h-section">Redraw product for Amazon</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-mute">AI rebuilds the bottle or container and creates a clean studio image on pure white, while being instructed to preserve the original label and printed details.</p>
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
          <label className="label" htmlFor="ad-extra">Extra instructions (optional)</label>
          <textarea id="ad-extra" className="field min-h-24 resize-y" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Example: keep the cap glossy black, make the bottle edges clearer…" maxLength={240} />
        </div>
        <button type="button" className="btn btn-primary w-full" onClick={generate} disabled={!file || busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {busy ? "Redrawing product…" : "Generate AI image"}
        </button>
        {busy && <div className="space-y-2" aria-live="polite"><div className="h-2 overflow-hidden rounded-full bg-sage-soft"><div className="h-full rounded-full bg-forest transition-all" style={{ width: progress + "%" }} /></div><p className="text-xs leading-relaxed text-mute">{status || "Working…"}</p><p className="text-[11px] text-mute">Keep this tab open while AI is generating the image.</p></div>}
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="border-t border-line pt-4 text-xs leading-relaxed text-mute">
          Pure white #FFFFFF background · 2000 × 2000 px export. AI may still slightly alter very small printed text, so review the label before publishing.
        </div>
      </aside>
    </section>
  );
}
