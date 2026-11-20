"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ImagePlus, Loader2, Sparkles } from "lucide-react";
import { cutout } from "@/lib/image-engine";

const WIDTH = 1200;
const HEIGHT = 2133;

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not export the image.")), "image/png"),
  );
}

function makeReferenceStyleImage(product: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not prepare the final image.");

  // Match the supplied reference: a quiet near-white studio background,
  // a single fully visible product, generous breathing room and a soft floor shadow.
  ctx.fillStyle = "#F7F8FA";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const scale = Math.min((WIDTH * 0.78) / product.width, (HEIGHT * 0.72) / product.height);
  const drawWidth = product.width * scale;
  const drawHeight = product.height * scale;
  const x = (WIDTH - drawWidth) / 2;
  const y = (HEIGHT - drawHeight) / 2;

  const shadow = ctx.createRadialGradient(WIDTH / 2, y + drawHeight + 22, 4, WIDTH / 2, y + drawHeight + 22, Math.max(90, drawWidth * 0.48));
  shadow.addColorStop(0, "rgba(20, 24, 28, 0.16)");
  shadow.addColorStop(0.55, "rgba(20, 24, 28, 0.055)");
  shadow.addColorStop(1, "rgba(20, 24, 28, 0)");
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(WIDTH / 2, Math.min(HEIGHT - 100, y + drawHeight + 24), Math.max(90, drawWidth * 0.48), Math.max(16, drawWidth * 0.075), 0, 0, Math.PI * 2);
  ctx.fill();

  // The product pixels come from the user's upload. No image-generation model
  // redraws the packaging, so logos, labels, colours and printed text stay intact.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(product, x, y, drawWidth, drawHeight);
  return canvas;
}

export function AIAdStudio() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [busy, setBusy] = useState(false);
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
    setStatus("");
    originalUrl.current = next ? URL.createObjectURL(next) : "";
  };

  const generate = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    setStatus("Removing the original background on your device…");
    setPreview((current) => { if (current) URL.revokeObjectURL(current); return ""; });
    try {
      const separated = await cutout(file, 28);
      if (separated.flags.includes("nothing_found")) {
        throw new Error("The product could not be detected. Try a clearer photo with the full product visible.");
      }
      if (separated.flags.includes("not_separated")) {
        throw new Error("The background could not be separated cleanly. Try another product photo.");
      }
      setStatus("Creating your clean studio product photo…");
      const output = makeReferenceStyleImage(separated.canvas);
      const blob = await canvasBlob(output);
      setPreview(URL.createObjectURL(blob));
      setStatus("Your reference-style product image is ready.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong while preparing the product image.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!preview) return;
    const a = document.createElement("a");
    a.href = preview;
    a.download = "flow-studio-product-image.png";
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
            <h3 className="h-section">Studio product image</h3>
            <span className="rounded-full bg-lime-soft px-3 py-1 text-xs font-medium text-forest">Original product preserved</span>
          </div>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Reference-style studio product image" className="mx-auto max-h-[760px] w-auto max-w-full rounded-xl object-contain" />
          ) : (
            <div className="grid aspect-[9/16] w-full place-items-center rounded-xl bg-sage-soft text-center text-sm text-mute">
              <div className="max-w-xs px-6">
                <Sparkles className="mx-auto mb-3 text-moss" size={30} />
                Your clean studio product photo will appear here.
              </div>
            </div>
          )}
          {preview && <button type="button" className="btn btn-primary mt-4 w-full" onClick={download}><Download size={16} /> Download PNG · 1200 × 2133</button>}
        </div>
      </div>

      <aside className="card flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <h2 className="h-section">Reference-style product photo</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-mute">Creates the clean studio look from your reference: a centered full product, soft natural contact shadow and a seamless near-white background.</p>
        </div>
        <ul className="space-y-2 text-sm text-mute">
          <li>• Keeps the real product photo — no AI redraw</li>
          <li>• Preserves the original label, logo, colours and printed text</li>
          <li>• Portrait 1200 × 2133 export</li>
          <li>• Runs locally in your browser; no paid image API</li>
        </ul>
        <button type="button" className="btn btn-primary w-full" onClick={generate} disabled={!file || busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {busy ? "Preparing product image…" : "Create reference-style image"}
        </button>
        {busy && <p className="text-xs leading-relaxed text-mute" aria-live="polite">{status}</p>}
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="border-t border-line pt-4 text-xs leading-relaxed text-mute">
          Free local processing · Original product details preserved · No paid API credits.
        </div>
      </aside>
    </section>
  );
}
