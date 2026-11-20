"use client";

import { zipSync } from "fflate";
import { Download, ImagePlus, Loader2, RefreshCw, Trash2, TriangleAlert, WandSparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { logImageJobAction } from "@/app/actions-tools";
import { FLAG_TEXT, IMAGE_PRESETS, ModelLoadError, compose, cutout, toJpeg, type Cutout, type Flag, type PresetId } from "@/lib/image-engine";

type Angle = "front" | "side" | "back" | "detail";
type Shot = { id: string; file: File; original: string; preview: string | null; cut: Cutout | null; pixelcutBlob?: Blob; aiBlob?: Blob; flags: Flag[]; state: "queued" | "working" | "done" | "error"; angle: Angle };

const ANGLES: Angle[] = ["front", "side", "back", "detail"];
const ANGLE_LABEL: Record<Angle, string> = { front: "Front (main)", side: "Side", back: "Back", detail: "Detail" };
const PRESET_IDS = Object.keys(IMAGE_PRESETS) as PresetId[];
const slug = (s: string) => s.trim().replace(/\.[a-z0-9]+$/i, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "image";

async function imageAsBase64(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1024 / bitmap.width, 1024 / bitmap.height, 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Could not prepare the reference product photo.");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not encode the reference photo.")), "image/png"),
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function anglePrompt(angle: Exclude<Angle, "front">): string {
  const view = {
    side: "Show a genuine 90-degree side profile of the SAME physical product. The camera must see its side silhouette and depth, not another front view. Do not invent unseen construction; keep the visible design faithful to the reference.",
    back: "Show the rear of the SAME physical product, as if the real item has been turned around 180 degrees. Preserve its exact shape, materials and colors. Do not invent label wording or hidden details; leave uncertain rear text absent rather than fabricate it.",
    detail: "Create a close commercial detail photograph of the SAME product, focusing on a real visible feature from the reference such as its cap, pump, nozzle, material or label texture. Do not invent a new component.",
  }[angle];
  return [
    "Perform true image-to-image editing using the uploaded photo as the visual reference and source of truth. Generate ONE photorealistic ecommerce studio photograph.",
    view,
    "Keep the same exact product identity, package silhouette, geometry, proportions, cap, pump, closure, material, finish, colors, logo and label design. Never replace it with a house, room, person, unrelated object or a different product.",
    "Do not invent or rewrite any text, logo, label, accessory or product feature. Preserve only details supported by the reference photo.",
    "Use a seamless pure white #FFFFFF background edge-to-edge, professional soft studio lighting, realistic product texture, crisp edges, natural reflections and a subtle contact shadow. No props, scenery, gradients, decorations, frames or watermarks.",
    "Keep the requested camera angle obvious and do not silently return a front-facing image for side or back.",
  ].join(" ");
}

export function ImageStudio({ mode }: { mode: "cleanup" | "shots" }) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [tolerance, setTolerance] = useState(40);
  const [fill, setFill] = useState(85);
  const [size, setSize] = useState(2000);
  const [sku, setSku] = useState("");
  const [markets, setMarkets] = useState<PresetId[]>(["amazon", "noon"]);
  const [zipping, setZipping] = useState(false);
  const [message, setMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  const [modelError, setModelError] = useState(false);
  const [angleTargets, setAngleTargets] = useState<Exclude<Angle, "front">[]>(["side", "back", "detail"]);
  const [generatingAngles, setGeneratingAngles] = useState(false);
  const [angleStatus, setAngleStatus] = useState("");
  const [pixelcutBusy, setPixelcutBusy] = useState<string[]>([]);
  const [fluxBusy, setFluxBusy] = useState<string[]>([]);
  const shotsRef = useRef<Shot[]>([]);
  const running = useRef(false);
  const settings = useRef({ tolerance, fill });
  shotsRef.current = shots;
  settings.current = { tolerance, fill };

  const patch = (id: string, p: Partial<Shot>) => setShots((list) => list.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const removeWithPixelcut = async (shot: Shot) => {
    if (pixelcutBusy.includes(shot.id)) return;
    if (!window.confirm("Pixelcut background removal may consume 5 API credits (about $0.05) for this image. Continue?")) return;
    setPixelcutBusy((list) => [...list, shot.id]);
    setMessage("");
    try {
      const image_b64 = await imageAsBase64(shot.file);
      const response = await fetch("/api/ai-ad/pixelcut", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_b64, image_type: "image/png" }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "Pixelcut background removal failed.");
      }
      const blob = await response.blob();
      if (!blob.size || !blob.type.startsWith("image/")) throw new Error("Pixelcut returned an invalid image.");
      const preview = URL.createObjectURL(blob);
      setShots((list) => list.map((item) => {
        if (item.id !== shot.id) return item;
        if (item.preview) URL.revokeObjectURL(item.preview);
        return { ...item, preview, pixelcutBlob: blob };
      }));
      setMessage(`Pixelcut removed the background from ${shot.file.name}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pixelcut background removal failed.");
    } finally {
      setPixelcutBusy((list) => list.filter((id) => id !== shot.id));
    }
  };

  const generateWithFlux = async (shot: Shot) => {
    if (fluxBusy.includes(shot.id) || !shot.cut) return;
    setFluxBusy((list) => [...list, shot.id]);
    setMessage("");

    try {
      // Ask FLUX for an EMPTY studio background only. Never send the product
      // to the generative model, so it cannot rewrite labels, logos or geometry.
      const blank = document.createElement("canvas");
      blank.width = 480;
      blank.height = 480;
      const blankContext = blank.getContext("2d");
      if (!blankContext) throw new Error("Could not prepare the studio background.");
      blankContext.fillStyle = "#FFFFFF";
      blankContext.fillRect(0, 0, 480, 480);
      const reference = await new Promise<Blob>((resolve, reject) =>
        blank.toBlob((value) => value ? resolve(value) : reject(new Error("Could not encode the studio background reference.")), "image/png"),
      );

      const form = new FormData();
      form.append("image", reference, "empty-studio-reference.png");
      form.append("prompt", [
        "Create a premium, photorealistic EMPTY ecommerce product photography studio background only.",
        "There must be absolutely NO product, NO bottle, NO package, NO object, NO text, NO logo, NO props and NO watermark anywhere in the image.",
        "Square seamless pure white #FFFFFF cyclorama background, extremely subtle realistic studio floor gradient and soft diffused lighting, clean white commercial photography sweep, very faint natural floor shading only.",
        "Keep the center completely empty and unobstructed because the real product will be composited over it later.",
        "No shadows shaped like an object, no pedestal, no scenery, no decorations, no borders."
      ].join(" "));
      setMessage("Generating an empty studio background with free FLUX. The original product and its printed text will be preserved.");

      const generated = await fetch("/api/ai-ad/cloudflare", {
        method: "POST",
        body: form,
        cache: "no-store",
      });
      if (!generated.ok) {
        const payload = await generated.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || `Cloudflare FLUX background generation failed (HTTP ${generated.status}).`);
      }
      const backgroundBlob = await generated.blob();
      if (!backgroundBlob.size || !backgroundBlob.type.startsWith("image/")) {
        throw new Error("Cloudflare returned an invalid studio background.");
      }

      // Composite the untouched original cutout over the AI background.
      // FLUX never receives or redraws the product itself.
      const [backgroundBitmap, productBitmap] = await Promise.all([
        createImageBitmap(backgroundBlob),
        createImageBitmap(shot.cut.canvas),
      ]);
      const output = document.createElement("canvas");
      output.width = 1024;
      output.height = 1024;
      const outputContext = output.getContext("2d");
      if (!outputContext) {
        backgroundBitmap.close();
        productBitmap.close();
        throw new Error("Could not compose the final product image.");
      }
      outputContext.fillStyle = "#FFFFFF";
      outputContext.fillRect(0, 0, output.width, output.height);
      const bgScale = Math.max(output.width / backgroundBitmap.width, output.height / backgroundBitmap.height);
      const bgWidth = backgroundBitmap.width * bgScale;
      const bgHeight = backgroundBitmap.height * bgScale;
      outputContext.drawImage(backgroundBitmap, (output.width - bgWidth) / 2, (output.height - bgHeight) / 2, bgWidth, bgHeight);
      backgroundBitmap.close();

      const productScale = (output.width * 0.85) / Math.max(productBitmap.width, productBitmap.height);
      const productWidth = productBitmap.width * productScale;
      const productHeight = productBitmap.height * productScale;
      outputContext.imageSmoothingEnabled = true;
      outputContext.imageSmoothingQuality = "high";
      outputContext.drawImage(productBitmap, (output.width - productWidth) / 2, (output.height - productHeight) / 2, productWidth, productHeight);
      productBitmap.close();

      const blob = await new Promise<Blob>((resolve, reject) =>
        output.toBlob((value) => value ? resolve(value) : reject(new Error("Could not encode the final studio image.")), "image/png"),
      );
      const preview = URL.createObjectURL(blob);
      if (shot.preview) URL.revokeObjectURL(shot.preview);
      patch(shot.id, { preview, aiBlob: blob });
      setMessage("AI studio background generated. The product, original label text and logo were composited from your source photo without AI redraw.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cloudflare FLUX background generation failed.");
    } finally {
      setFluxBusy((list) => list.filter((id) => id !== shot.id));
    }
  };

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
        patch(next.id, { state: "done", cut, pixelcutBlob: undefined, aiBlob: undefined, flags: cut.flags, preview: URL.createObjectURL(blob) });
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


  const generateAngles = async () => {
    const source = shots.find((shot) => shot.angle === "front") ?? shots[0];
    if (!source || angleTargets.length === 0 || generatingAngles) return;
    setGeneratingAngles(true);
    setMessage("");
    const generatedAngles: Angle[] = [];
    try {
      // Prepare a complete, uncropped reference on white for the image-to-image model.
      const bitmap = await createImageBitmap(source.file);
      const canvas = document.createElement("canvas");
      canvas.width = 480;
      canvas.height = 480;
      const context = canvas.getContext("2d");
      if (!context) {
        bitmap.close();
        throw new Error("Could not prepare the reference product photo.");
      }
      context.fillStyle = "#FFFFFF";
      context.fillRect(0, 0, 480, 480);
      const scale = Math.min(448 / bitmap.width, 448 / bitmap.height, 1);
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      context.drawImage(bitmap, (480 - width) / 2, (480 - height) / 2, width, height);
      bitmap.close();
      const reference = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not encode the reference photo.")), "image/png"),
      );

      for (const angle of angleTargets) {
        setAngleStatus(`Generating ${ANGLE_LABEL[angle]} view with free FLUX…`);
        const form = new FormData();
        form.append("image", reference, "product-reference.png");
        form.append("prompt", anglePrompt(angle));
        const response = await fetch("/api/ai-ad/cloudflare", { method: "POST", body: form, cache: "no-store" });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(payload.error || `Could not generate the ${ANGLE_LABEL[angle]} view.`);
        }
        const blob = await response.blob();
        if (!blob.size || !blob.type.startsWith("image/")) {
          throw new Error(`AI returned an invalid ${ANGLE_LABEL[angle]} image.`);
        }
        const generatedFile = new File([blob], `${slug(sku || source.file.name)}-${angle}.png`, { type: "image/png" });
        const generatedShot: Shot = {
          id: `${Date.now()}-${angle}-${Math.random().toString(36).slice(2, 8)}`,
          file: generatedFile,
          original: URL.createObjectURL(generatedFile),
          preview: null,
          cut: null,
          flags: [],
          state: "queued",
          angle,
        };
        setShots((list) => [...list, generatedShot]);
        generatedAngles.push(angle);
      }
      setAngleStatus("");
      setMessage(`Generated ${generatedAngles.length} angle view(s) with free FLUX. They are being cleaned; check each view against the original before downloading.`);
    } catch (error) {
      setAngleStatus("");
      const detail = error instanceof Error ? error.message : "Could not generate the additional product angles.";
      setMessage(generatedAngles.length ? `Generated ${generatedAngles.length} view(s); stopped after an error: ${detail}` : detail);
    } finally {
      setGeneratingAngles(false);
    }
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

  const reprocess = () => setShots((list) => list.map((s) => ({ ...s, aiBlob: undefined, state: "queued" as const })));

  const done = shots.filter((s) => s.state === "done" && s.cut);
  const flagged = done.filter((s) => s.flags.length > 0).length;
  const busy = shots.some((s) => s.state === "queued" || s.state === "working");

  const download = async () => {
    if (done.length === 0) return;
    setZipping(true);
    setMessage("");
    try {
      const files: Record<string, Uint8Array> = {};
      const bytes = async (s: Shot, px: number, ratio: number) => {
        const generatedBlob = s.aiBlob ?? s.pixelcutBlob;
        if (!generatedBlob) return new Uint8Array(await (await toJpeg(compose(s.cut as Cutout, px, ratio))).arrayBuffer());
        const bitmap = await createImageBitmap(generatedBlob);
        const canvas = document.createElement("canvas");
        canvas.width = px;
        canvas.height = px;
        const context = canvas.getContext("2d");
        if (!context) { bitmap.close(); throw new Error("Could not prepare the Pixelcut export."); }
        context.fillStyle = "#FFFFFF";
        context.fillRect(0, 0, px, px);
        const scale = Math.min((px * ratio) / bitmap.width, (px * ratio) / bitmap.height);
        const width = bitmap.width * scale;
        const height = bitmap.height * scale;
        context.drawImage(bitmap, (px - width) / 2, (px - height) / 2, width, height);
        bitmap.close();
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not export the Pixelcut image.")), "image/jpeg", 0.92));
        return new Uint8Array(await blob.arrayBuffer());
      };
      if (mode === "cleanup") {
        const used = new Set<string>();
        for (const s of done) {
          let name = slug(s.file.name);
          while (used.has(name)) name += "-2";
          used.add(name);
          files[`${name}.jpg`] = await bytes(s, size, fill / 100);
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
            files[`${preset.label.replace(/\s+/g, "-")}/${name}.jpg`] = await bytes(s, preset.size, preset.fill);
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
          <span className="max-w-md text-[13px] leading-relaxed text-mute">{mode === "shots" ? "JPEG, PNG or WebP. Local cleanup is automatic. Pixelcut background removal is optional and runs only when you click its button; it uses API credits." : "JPEG, PNG or WebP. Local cleanup runs automatically. FLUX.2 Klein 4B AI editing is optional and runs only when you click its button."}</span>
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
                    <figcaption className="eyebrow px-3 py-2">{s.aiBlob ? "AI-generated" : s.pixelcutBlob ? "Background removed" : "Cleaned"}</figcaption>
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
                  {mode === "shots" && (
                    <button type="button" className="btn btn-secondary btn-sm w-full" onClick={() => removeWithPixelcut(s)} disabled={pixelcutBusy.includes(s.id)}>
                      {pixelcutBusy.includes(s.id) ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <ImagePlus size={14} aria-hidden />}
                      {pixelcutBusy.includes(s.id) ? "Removing with Pixelcut…" : s.pixelcutBlob ? "Run Pixelcut again" : "Remove background with Pixelcut"}
                    </button>
                  )}
                  {mode === "cleanup" && (
                    <button type="button" className="btn btn-primary btn-sm w-full" onClick={() => generateWithFlux(s)} disabled={s.state !== "done" || fluxBusy.includes(s.id)}>
                      {fluxBusy.includes(s.id) ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <WandSparkles size={14} aria-hidden />}
                      {fluxBusy.includes(s.id) ? "Generating with FLUX.2 Klein 4B…" : s.aiBlob ? "Generate again with FLUX.2 Klein 4B" : "Generate with FLUX.2 Klein 4B"}
                    </button>
                  )}
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
            {mode === "cleanup" ? "Remove the background locally, or regenerate the product photo with FLUX.2 Klein 4B on Cloudflare Workers AI. " : "Upload your real product photos, then clean and export them for marketplace image requirements. "}
            Local background cleanup is automatic. Free Cloudflare Workers AI FLUX.2 Klein 4B runs only when you click Generate. A daily free usage limit applies; no paid fallback is used.
          </p>
        </div>

        {mode === "shots" ? (
          <>
            <div>
              <label className="label" htmlFor="im-sku">SKU or ASIN</label>
              <input id="im-sku" className="field" value={sku} maxLength={40} placeholder="Used in the file names" autoComplete="off" onChange={(e) => setSku(e.target.value)} />
            </div>
            <div className="rounded-xl border border-line bg-sage-soft p-3.5">
              <h3 className="text-sm font-semibold text-ink">Generate other product angles</h3>
              <p className="mt-1 text-xs leading-relaxed text-mute">Free AI models can analyze images, but they cannot reliably generate new angles while preserving the exact uploaded product. Angle generation is disabled in Free mode; use real side and back photos for accurate listings.</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {(["side", "back", "detail"] as const).map((angle) => (
                  <label key={angle} className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" className="size-4 accent-flow-green" checked={angleTargets.includes(angle)} onChange={(event) => setAngleTargets((current) => event.target.checked ? [...current, angle] : current.filter((item) => item !== angle))} />
                    {ANGLE_LABEL[angle]}
                  </label>
                ))}
              </div>
              <button type="button" className="btn btn-primary mt-3 w-full" onClick={generateAngles} disabled={true}>
                {generatingAngles ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <ImagePlus size={16} aria-hidden />}
                {"Image angles unavailable in Free mode"}
              </button>
              {angleStatus && <p role="status" className="mt-2 text-xs text-mute">{angleStatus}</p>}
              <p className="mt-2 text-[11px] leading-relaxed text-mute">Important: views of hidden packaging surfaces are AI reconstructions. Check any unseen label text before publishing.</p>
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
          <label className="label" htmlFor="im-tol">Edge & shadow cleanup <span className="num">{tolerance}</span></label>
          <input id="im-tol" type="range" min={10} max={100} step={5} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="w-full accent-flow-green" />
          <p className="mt-1 text-xs leading-snug text-mute">Balanced automatically to preserve fine product edges while removing background residue. Adjust only if needed.</p>
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
