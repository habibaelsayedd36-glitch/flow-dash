"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ImagePlus, Loader2, Sparkles } from "lucide-react";
import { compose, cutout } from "@/lib/image-engine";

type Style = "luxury" | "minimal" | "nature" | "studio" | "lifestyle";
type Category = "beauty" | "electronics" | "fashion" | "food" | "home" | "general";

const STYLES: Record<Style, string> = {
  luxury: "premium luxury advertising lighting, elegant refined reflections, dramatic but balanced softbox lighting",
  minimal: "clean modern minimal composition, bright diffused studio lighting, subtle realistic soft shadows",
  nature: "fresh natural daylight, gentle organic lighting, delicate realistic highlights",
  studio: "high-end commercial photography lighting, professional three-point softbox setup, realistic soft shadows",
  lifestyle: "premium editorial product photography lighting, soft natural window-light effect, polished composition",
};

const CATEGORIES: Record<Category, string> = {
  beauty: "premium cosmetics and skincare product photography, clean polished presentation",
  electronics: "premium technology product photography, crisp precise highlights",
  fashion: "premium fashion product photography, refined editorial presentation",
  food: "appetizing premium food product photography, fresh realistic detail",
  home: "premium homeware product photography, refined contemporary presentation",
  general: "premium ecommerce product photography with a clean professional presentation",
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
      // Edit the uploaded product photo directly, while explicitly protecting every printed label.
      const prompt = [
        "Create a premium, photorealistic commercial advertising image using the uploaded product photo as the exact reference.",
        "CRITICAL: preserve every visible word, letter, number, logo, brand name, ingredient, volume, warning, symbol and tiny printed detail on the product exactly as it appears in the original image.",
        "Do not rewrite, redraw, regenerate, replace, translate, invent, blur or distort any text or label. Keep the original label artwork and typography unchanged and fully legible.",
        "Keep the product identity, packaging shape, cap, proportions and original colors faithful to the reference.",
        "Improve only the photographic presentation: professional lighting, realistic reflections, clean edges, balanced exposure, premium advertising composition.",
        STYLES[style],
        CATEGORIES[category],
        "Style direction: " + STYLES[style] + ".",
        extra.trim() ? "Additional art direction: " + extra.trim() : "",
        "Keep the entire product visible, realistic and proportional. Do not add text, logos, watermarks, hands or unrelated objects.",
        "BACKGROUND REQUIREMENT — ABSOLUTE PRIORITY: use a perfectly pure, uniform, seamless WHITE background (#FFFFFF), exactly white from edge to edge. This is a clean Amazon main product image on white. No beige, gray, cream, colored tint, gradient, texture, scenery, room, backdrop decoration, props, pedestal, platform, patterns or environmental elements. Keep only the product and its natural subtle contact shadow on the pure white background. This white-background instruction overrides every other style, category or scene direction.",
        "Square premium ecommerce main image, crisp professional quality, pure white background (#FFFFFF).",
      ].filter(Boolean).join(" ");
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
      setProgress(84);
      setStatus("Removing the generated background and preparing pure white…");
      const generatedBlob = await response.blob();
      if (!generatedBlob.size || !generatedBlob.type.startsWith("image/")) {
        throw new Error("Cloud AI returned an invalid image. Please try again.");
      }

      // Keep the AI-redrawn product, then isolate it from the model-generated
      // backdrop and place it on a genuinely white Amazon canvas.
      const separated = await cutout(generatedBlob, 0);
      if (separated.flags.includes("nothing_found")) {
        throw new Error("The product could not be separated from the generated background. Please try another photo.");
      }
      if (separated.flags.includes("not_separated")) {
        throw new Error("The generated background could not be separated cleanly. Please try generating the image again.");
      }
      setProgress(94);
      setStatus("Placing the product on pure white (#FFFFFF)…");
      const canvas = compose(separated, 2000, 0.85);

      setStatus("Your AI-edited Amazon image is ready.");
      setProgress(100);
      const outputBlob = await canvasBlob(canvas);
      setPreview(URL.createObjectURL(outputBlob));
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
            <span className="rounded-full bg-lime-soft px-3 py-1 text-xs font-medium text-forest">AI product photo enhancement</span>
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
          <p className="mt-1 text-[13px] leading-relaxed text-mute">AI enhances the original product photo and scene. The prompt explicitly protects all original printed words, labels, logos and numbers.</p>
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
          AI-enhanced product photo · Original label text must remain unchanged · 2000 × 2000 px export.
        </div>
      </aside>
    </section>
  );
}
