"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ImagePlus, Loader2, Sparkles } from "lucide-react";

const CLOUD_NAME = "zyxjjqkl";
const UPLOAD_PRESET = "habiba";

type CloudinaryUpload = {
  secure_url?: string;
  error?: { message?: string };
};

function waitForImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const tryLoad = () => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve();
      image.onerror = () => {
        attempt += 1;
        if (attempt < 7) window.setTimeout(tryLoad, Math.min(1500 * attempt, 7000));
        else reject(new Error("Cloudinary could not finish AI background removal. Check that your plan allows this transformation, then try again."));
      };
      image.src = url + (url.includes("?") ? "&" : "?") + "flow_retry=" + attempt;
    };
    tryLoad();
  });
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
    setPreview("");
    setFile(next);
    setError("");
    setStatus("");
    originalUrl.current = next ? URL.createObjectURL(next) : "";
  };

  const generate = async () => {
    if (!file || busy) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose a PNG, JPG or WebP image.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Choose an image smaller than 10 MB.");
      return;
    }

    setBusy(true);
    setError("");
    setPreview("");
    setStatus("Uploading your original product photo securely to Cloudinary…");

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("upload_preset", UPLOAD_PRESET);
      form.append("folder", "flow-product-studio");

      const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: "POST",
        body: form,
      });
      const uploaded = await uploadResponse.json() as CloudinaryUpload;
      if (!uploadResponse.ok || !uploaded.secure_url) {
        throw new Error(uploaded.error?.message || "Cloudinary upload failed. Check the cloud name and that the habiba preset is set to Unsigned.");
      }

      setStatus("AI is separating the original product from its background…");
      const marker = "/image/upload/";
      const markerIndex = uploaded.secure_url.indexOf(marker);
      if (markerIndex < 0) throw new Error("Cloudinary returned an unexpected image URL.");

      // AI segmentation preserves the uploaded product pixels; only the background is replaced.
      // Avoid generative background replacement because it can hallucinate product/package details.
      const transformation = "e_background_removal/b_rgb:ffffff,c_pad,w_1200,h_1200/f_png";
      const resultUrl = uploaded.secure_url.slice(0, markerIndex + marker.length)
        + transformation + "/"
        + uploaded.secure_url.slice(markerIndex + marker.length);

      await waitForImage(resultUrl);
      setPreview(resultUrl);
      setStatus("Your product is isolated on a clean white background. The original product details are preserved as much as the AI cutout allows.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong while generating the image.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!preview) return;
    try {
      const response = await fetch(preview);
      if (!response.ok) throw new Error("Download failed.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "flow-ai-product-studio.png";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(preview, "_blank", "noopener,noreferrer");
    }
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
          <span className="text-sm text-mute">Upload a clear photo with the full product visible. PNG, JPG or WebP · up to 10 MB.</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => chooseFile(e.target.files?.[0] ?? null)} />
        </label>
        <div className="card overflow-hidden p-3 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="h-section">White-background product result</h3>
            <span className="rounded-full bg-lime-soft px-3 py-1 text-xs font-medium text-forest">Cloudinary AI</span>
          </div>
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Product isolated on a white background" className="mx-auto max-h-[760px] w-auto max-w-full rounded-xl object-contain" />
          ) : (
            <div className="grid aspect-[9/16] w-full place-items-center rounded-xl bg-sage-soft text-center text-sm text-mute">
              <div className="max-w-xs px-6">
                <Sparkles className="mx-auto mb-3 text-moss" size={30} />
                Your product with its original details on a clean white background will appear here.
              </div>
            </div>
          )}
          {preview && <button type="button" className="btn btn-primary mt-4 w-full" onClick={download}><Download size={16} /> Download PNG</button>}
        </div>
      </div>

      <aside className="card flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <h2 className="h-section">AI product photo studio</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-mute">Cloudinary AI isolates the product from its original photo and places it on pure white. It does not regenerate the product or invent packaging details.</p>
        </div>
        <ul className="space-y-2 text-sm text-mute">
          <li>• Uses the uploaded product photo as its source</li>
          <li>• AI background removal with a pure white canvas</li>
          <li>• Original product colors, label and shape are not generatively redrawn</li>
          <li>• No paid image API key or API secret is used</li>
        </ul>
        <button type="button" className="btn btn-primary w-full" onClick={generate} disabled={!file || busy}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {busy ? "Generating with AI…" : "Create AI studio image"}
        </button>
        {busy && <p className="text-xs leading-relaxed text-mute" aria-live="polite">{status}</p>}
        {error && <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="border-t border-line pt-4 text-xs leading-relaxed text-mute">
          Cloudinary counts AI background removal toward your account usage. Review fine edges before publishing; no generative background replacement or paid image API is used.
        </div>
      </aside>
    </section>
  );
}
