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

function anglePrompt(angle: Exclude<Angle, "front">, productDescription: string): string {
  const view = {
    side: "Create a true 90-degree side profile view, showing the product's side silhouette, depth and real construction.",
    back: "Rotate the same product to show its rear side directly, as a realistic straight-on back view.",
    detail: "Create a premium macro commercial photograph of a real visible product detail, preserving the exact material, finish, cap, dispenser and texture.",
  }[angle];
  return [
    "Act as a senior commercial product photographer and high-end ecommerce retoucher.",
    "Edit the supplied reference photo into ONE photorealistic, premium advertising-quality studio product photograph.",
    view,
    "BACKGROUND IS MANDATORY: perfectly pure seamless white #FFFFFF, evenly white edge-to-edge. No grey, cream, gradients, scenery, colored surfaces, props, decorations, text overlays, frames or watermarks.",
    `REFERENCE PHOTO ANALYSIS (supplementary only; the uploaded photo remains the source of truth): ${productDescription}`,
    "PRODUCT FIDELITY IS CRITICAL: preserve the exact product identity, silhouette, geometry, proportions, packaging, cap/pump, materials, colors, finish, label layout, logos and every legible word. Do not redesign, beautify by changing the product, invent text, repair labels by guessing, add accessories or create extra products.",
    "Make the product itself look professionally photographed: crisp fine detail, high resolution, clean realistic edges, balanced premium studio key light with soft fill, accurate white balance, controlled highlights, natural material reflections, rich but true-to-life color, subtle realistic contact shadow directly beneath the product.",
    "The product must be upright, fully visible from top to bottom, large and precisely centered, occupying approximately 85–90% of the square frame while keeping safe margins so no part is cropped. Match the clean premium marketplace MAIN-image style: pure white #FFFFFF background, front-facing catalog presentation when the requested angle is front, professional studio lighting, crisp realistic detail and polished commercial retouching. For side, back and detail requests, preserve the requested camera angle while keeping the same white-background studio style and exact product identity.",
    "Do not create a lifestyle scene. Do not add any background objects. The only subject is the exact product on pure white.",
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
    if (fluxBusy.includes(shot.id)) return;
    setFluxBusy((list) => [...list, shot.id]);
    setMessage("");
    const space = "https://xurxowsky-flux2-klein-4b-playground.hf.space";
    const productPrompt = [
      "Create a completely new, photorealistic premium ecommerce studio photograph by re-rendering the uploaded product reference. This must be a genuine image-to-image regeneration, not simple background removal or a filter.",
      "The uploaded photograph is the single source of truth. Preserve the exact same real product identity and design: silhouette, geometry, proportions, dimensions, packaging shape, cap, pump, closure, material, surface finish, colors, logo, brand mark, label placement, label layout, typography, icons and every visible printed word.",
      "Do not redesign, recolor, simplify, beautify by changing the product, add or remove parts, invent accessories, duplicate the product, translate text, or make up label wording. Keep the printed label faithful to the reference; never replace uncertain small text with invented writing.",
      "Create a perfectly seamless pure white #FFFFFF background edge-to-edge. Show one product only, upright, front-facing, centered, fully visible with safe margins, occupying about 85 percent of a square frame.",
      "Rebuild the photograph with polished premium commercial studio lighting, accurate white balance and product colors, crisp realistic edges, clean fine detail, natural material reflections, controlled highlights, and a subtle realistic contact shadow directly beneath the product.",
      "The result should look like a newly photographed high-end marketplace main image. No props, scenery, gradients, colored backgrounds, extra text, watermark, border, or frame."
    ].join(" ");
    const findImageUrl = (value: unknown): string | null => {
      if (!value || typeof value !== "object") return null;
      const item = value as Record<string, unknown>;
      if (typeof item.url === "string" && item.url) {
        return item.url.startsWith("/") ? `${space}${item.url}` : item.url;
      }
      if (typeof item.path === "string" && item.path) {
        return `${space}/gradio_api/file=${encodeURIComponent(item.path)}`;
      }
      for (const child of Object.values(item)) {
        if (Array.isArray(child)) {
          for (const entry of child) {
            const found = findImageUrl(entry);
            if (found) return found;
          }
        } else {
          const found = findImageUrl(child);
          if (found) return found;
        }
      }
      return null;
    };
    try {
      // Submit directly from the browser so Vercel's free-function timeout
      // cannot terminate a valid Hugging Face ZeroGPU generation.
      const bitmap = await createImageBitmap(shot.file);
      const scale = Math.min(1024 / bitmap.width, 1024 / bitmap.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) { bitmap.close(); throw new Error("Could not prepare the Hugging Face FLUX reference image."); }
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const reference = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not encode the FLUX reference image.")), "image/png"),
      );

      setMessage("Uploading the reference photo to the free Hugging Face Space…");
      const uploadForm = new FormData();
      uploadForm.append("files", reference, "product-reference.png");
      const uploadResponse = await fetch(`${space}/gradio_api/upload`, {
        method: "POST",
        body: uploadForm,
        cache: "no-store",
      });
      if (!uploadResponse.ok) {
        throw new Error(uploadResponse.status === 503
          ? "Hugging Face is waking up the free GPU. Wait a little and try again."
          : `Could not upload the reference photo to Hugging Face (HTTP ${uploadResponse.status}).`);
      }
      const uploaded = await uploadResponse.json() as unknown;
      const uploadedPath = Array.isArray(uploaded) ? uploaded[0] : uploaded;
      if (typeof uploadedPath !== "string" || !uploadedPath) {
        throw new Error("Hugging Face did not accept the reference image.");
      }

      setMessage("Waiting for the free ZeroGPU queue and regenerating your product photo. This may take a minute or longer; keep this tab open…");
      // Match the live Hugging Face API documentation: select image-to-image
      // mode in this session, then call generate_images with its 9 documented inputs.
      const sessionHash = crypto.randomUUID();
      const runSpaceEndpoint = async (endpoint: string, data: unknown[]) => {
        const response = await fetch(`${space}/gradio_api/call/${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data, session_hash: sessionHash }),
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null) as { event_id?: string; error?: string } | null;
        if (!response.ok || !payload?.event_id) {
          throw new Error(payload?.error || `Hugging Face could not start ${endpoint} (HTTP ${response.status}).`);
        }
        const result = await fetch(
          `${space}/gradio_api/call/${endpoint}/${encodeURIComponent(payload.event_id)}`,
          { cache: "no-store" },
        );
        if (!result.ok) {
          throw new Error(`Hugging Face could not read the ${endpoint} result (HTTP ${result.status}).`);
        }
        const stream = await result.text();
        const events = stream.split(/\\r?\\n(?=event:)/);
        const completed = events.find((event) => /^event:\\s*complete\\s*$/m.test(event));
        if (!completed) {
          const errorEvent = events.find((event) => /^event:\\s*error\\s*$/m.test(event));
          const dataLine = errorEvent?.split(/\\r?\\n/).find((line) => line.startsWith("data:"));
          const rawDetail = dataLine?.slice(5).trim() ?? "";
          let detail = "";
          if (rawDetail && rawDetail !== "null" && rawDetail !== "undefined") {
            try {
              const parsed: unknown = JSON.parse(rawDetail);
              if (typeof parsed === "string") detail = parsed;
              else if (parsed && typeof parsed === "object") {
                const info = parsed as Record<string, unknown>;
                detail = String(info.message || info.error || info.detail || "");
              }
            } catch {
              detail = rawDetail;
            }
          }
          throw new Error(detail || `Hugging Face returned no details for ${endpoint}. Raw response: ${stream.slice(0, 700)}`);
        }
        const dataLine = completed.split(/\\r?\\n/).find((line) => line.startsWith("data:"));
        if (!dataLine) throw new Error(`Hugging Face returned an empty ${endpoint} result.`);
        return JSON.parse(dataLine.slice(5).trim()) as unknown;
      };

      // The live API docs expose this tab-selection endpoint and list exactly
      // nine inputs for generation (no mode/state input).
      await runSpaceEndpoint("on_select_i2i", []);
      const resultPayload = await runSpaceEndpoint("generate_images", [
        "",
        productPrompt,
        {
          path: uploadedPath,
          orig_name: "product-reference.png",
          size: reference.size,
          mime_type: "image/png",
          is_stream: false,
          meta: { _type: "gradio.FileData" },
        },
        0.95,
        "Photoreal / Fotorrealista",
        "Square 1:1 / Cuadrado 1:1",
        4,
        4.0,
        Math.floor(Math.random() * 2_000_000_000),
      ]);
      const imageUrl = findImageUrl(resultPayload);
      if (!imageUrl) throw new Error("FLUX finished but did not return a usable image. Please retry.");

      const generated = await fetch(imageUrl, { cache: "no-store" });
      if (!generated.ok) throw new Error("The generated image could not be downloaded from Hugging Face.");
      const blob = await generated.blob();
      if (!blob.size || !blob.type.startsWith("image/")) throw new Error("FLUX returned an invalid image.");
      const preview = URL.createObjectURL(blob);
      if (shot.preview) URL.revokeObjectURL(shot.preview);
      patch(shot.id, { preview, aiBlob: blob });
      setMessage("Free Hugging Face FLUX.2 Klein generated a new studio-style image. Check every label against the original before downloading.");
    } catch (error) {
      setMessage(error instanceof Error
        ? error.message.includes("Failed to fetch")
          ? "Could not connect to the free Hugging Face Space. Check that the Space is running, then try again."
          : error.message
        : "FLUX image editing failed.");
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
    try {
      const image_b64 = await imageAsBase64(source.file);
      setAngleStatus("Free mode does not include reference-based image generation.");
      const analysisResponse = await fetch("/api/ai-ad/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_b64, image_type: "image/png" }),
      });
      const analysisPayload = await analysisResponse.json().catch(() => ({})) as { description?: string; error?: string };
      if (!analysisResponse.ok || !analysisPayload.description) throw new Error(analysisPayload.error || "Could not analyze the reference product photo.");
      const productDescription = analysisPayload.description;
      for (const angle of angleTargets) {
        setAngleStatus(`Generating ${ANGLE_LABEL[angle]} view…`);
        const response = await fetch("/api/ai-ad/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: anglePrompt(angle, productDescription), image_b64, image_type: "image/png" }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
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
      }
      setAngleStatus("");
      setMessage(`Generated ${angleTargets.length} new angle view(s). They are being cleaned and will be included in your ZIP.`);
    } catch (error) {
      setAngleStatus("");
      setMessage(error instanceof Error ? error.message : "Could not generate the additional product angles.");
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
            {mode === "cleanup" ? "Remove the background locally, or regenerate the product photo with FLUX.2 Klein 4B on Hugging Face ZeroGPU. " : "Upload your real product photos, then clean and export them for marketplace image requirements. "}
            Local background cleanup is automatic. Free Hugging Face FLUX.2 Klein 4B runs only when you click Generate. GPU queue and cold starts may cause a wait. No Cloudflare account or paid fallback is used.
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
