import { requireApiUser } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

const SPACE = "https://xurxowsky-flux2-klein-4b-playground.hf.space";
const MAX_UPLOAD = 5_000_000;

const PRODUCT_PROMPT = [
  "Create a completely new, photorealistic premium ecommerce studio photograph by re-rendering the uploaded product reference. This must be a genuine image-to-image regeneration, not simple background removal or a filter.",
  "The uploaded photograph is the single source of truth. Preserve the exact same real product identity and design: silhouette, geometry, proportions, dimensions, packaging shape, cap, pump, closure, material, surface finish, colors, logo, brand mark, label placement, label layout, typography, icons and every visible printed word.",
  "Do not redesign, recolor, simplify, beautify by changing the product, add or remove parts, invent accessories, duplicate the product, translate text, or make up label wording. Keep the printed label faithful to the reference; never replace uncertain small text with invented writing.",
  "Create a perfectly seamless pure white #FFFFFF background edge-to-edge. Show one product only, upright, front-facing, centered, fully visible with safe margins, occupying about 85 percent of a square frame.",
  "Rebuild the photograph with polished premium commercial studio lighting, accurate white balance and product colors, crisp realistic edges, clean fine detail, natural material reflections, controlled highlights, and a subtle realistic contact shadow directly beneath the product.",
  "The result should look like a newly photographed high-end marketplace main image. No props, scenery, gradients, colored backgrounds, extra text, watermark, border, or frame."
].join(" ");

function getImageUrl(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.url === "string" && item.url) return item.url;
  if (typeof item.path === "string" && item.path) {
    return `${SPACE}/gradio_api/file=${encodeURIComponent(item.path)}`;
  }
  for (const child of Object.values(item)) {
    if (Array.isArray(child)) {
      for (const entry of child) {
        const found = getImageUrl(entry);
        if (found) return found;
      }
    } else {
      const found = getImageUrl(child);
      if (found) return found;
    }
  }
  return null;
}

function parseCompletedEvent(stream: string): unknown {
  const events = stream.split(/\n(?=event:)/);
  const completed = events.find((event) => /^event: complete\s*$/m.test(event));
  if (!completed) {
    const errorEvent = events.find((event) => /^event: error\s*$/m.test(event));
    const detail = errorEvent?.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim();
    throw new Error(detail || "The free Hugging Face Space did not complete the image job. It may be busy; please retry.");
  }
  const dataLine = completed.split("\n").find((line) => line.startsWith("data:"));
  if (!dataLine) throw new Error("The image service returned an empty result.");
  return JSON.parse(dataLine.slice(5).trim());
}

export async function POST(request: NextRequest) {
  const unauthorized = await requireApiUser();
  if (unauthorized) return unauthorized;

  try {
    const incoming = await request.formData();
    const image = incoming.get("image");
    if (!(image instanceof File) || !["image/png", "image/jpeg", "image/webp"].includes(image.type)) {
      return NextResponse.json({ error: "Upload a PNG, JPEG, or WebP product photo." }, { status: 400 });
    }
    if (image.size > MAX_UPLOAD) {
      return NextResponse.json({ error: "Please use a product photo smaller than 5 MB." }, { status: 413 });
    }

    const uploadForm = new FormData();
    uploadForm.append("files", image, "product-reference.png");
    const uploadResponse = await fetch(`${SPACE}/gradio_api/upload`, {
      method: "POST",
      body: uploadForm,
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    const uploadText = await uploadResponse.text();
    if (!uploadResponse.ok) {
      return NextResponse.json({
        error: uploadResponse.status === 503
          ? "Hugging Face is waking up the free GPU. Wait a little and try again."
          : `Could not upload the reference photo to Hugging Face (HTTP ${uploadResponse.status}).`,
      }, { status: uploadResponse.status === 429 ? 429 : 502 });
    }

    let uploaded: unknown;
    try { uploaded = JSON.parse(uploadText); } catch { uploaded = uploadText; }
    const uploadedPath = Array.isArray(uploaded) ? uploaded[0] : uploaded;
    if (typeof uploadedPath !== "string" || !uploadedPath) {
      return NextResponse.json({ error: "Hugging Face did not accept the reference image." }, { status: 502 });
    }

    const callResponse = await fetch(`${SPACE}/gradio_api/call/generate_images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [
          "i2i",
          "",
          PRODUCT_PROMPT,
          {
            path: uploadedPath,
            orig_name: "product-reference.png",
            size: image.size,
            mime_type: image.type,
            meta: { _type: "gradio.FileData" },
          },
          0.95,
          4,
          4.0,
          Math.floor(Math.random() * 2_000_000_000),
        ],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    const callPayload = await callResponse.json().catch(() => null) as { event_id?: string; error?: string } | null;
    if (!callResponse.ok || !callPayload?.event_id) {
      const message = callPayload?.error || `Hugging Face could not start the generation (HTTP ${callResponse.status}).`;
      return NextResponse.json({ error: message }, { status: callResponse.status === 429 ? 429 : 502 });
    }

    const resultResponse = await fetch(
      `${SPACE}/gradio_api/call/generate_images/${encodeURIComponent(callPayload.event_id)}`,
      { cache: "no-store", signal: AbortSignal.timeout(85_000) },
    );
    if (!resultResponse.ok) {
      return NextResponse.json({ error: "The free GPU queue is busy or unavailable. Please try again shortly." }, { status: 503 });
    }
    const resultPayload = parseCompletedEvent(await resultResponse.text());
    const imageUrl = getImageUrl(resultPayload);
    if (!imageUrl) {
      return NextResponse.json({ error: "FLUX finished but did not return a usable image. Please retry." }, { status: 502 });
    }

    const generated = await fetch(imageUrl, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!generated.ok) {
      return NextResponse.json({ error: "The generated image could not be downloaded from Hugging Face." }, { status: 502 });
    }
    const bytes = Buffer.from(await generated.arrayBuffer());
    if (!bytes.length || bytes.length > 15_000_000) {
      return NextResponse.json({ error: "Hugging Face returned an invalid or oversized image." }, { status: 502 });
    }

    return new NextResponse(bytes, {
      headers: { "Content-Type": generated.headers.get("content-type")?.startsWith("image/") ? generated.headers.get("content-type")! : "image/png", "Cache-Control": "no-store" },
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return NextResponse.json({
      error: timedOut
        ? "The free Hugging Face GPU took too long or is still starting. Try again in a minute; no paid fallback is enabled."
        : error instanceof Error ? error.message : "Unexpected FLUX image editing error.",
    }, { status: timedOut ? 504 : 500 });
  }
}
