import { requireApiUser } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";
const MAX_UPLOAD = 5_000_000;

const PRODUCT_PROMPT = [
  "Edit the supplied reference image into one premium, photorealistic ecommerce studio product photograph. This is image-to-image editing: the uploaded image is the source of truth, not optional inspiration.",
  "Preserve the exact same physical product and its identity: silhouette, geometry, proportions, packaging, cap, pump, closure, material, texture, finish, colors, logo, brand mark, label layout, typography, icons and all visible printed wording.",
  "Do not replace the product with another object, redesign it, recolor it, invent text, change the brand, add parts, remove parts, duplicate it, or create a house, room, person, scenery or lifestyle scene. Keep the product as close as possible to the reference.",
  "Create a seamless pure white #FFFFFF background edge-to-edge. Show exactly one product, upright, front-facing, centered and fully visible with safe margins. The product should occupy about 85 percent of the square frame.",
  "Improve only the commercial photography: clean premium studio lighting, accurate white balance and true-to-life product colors, crisp realistic edges, fine detail, natural material reflections, controlled highlights, and a subtle realistic contact shadow directly beneath the product.",
  "The final image must be a square marketplace main image with a pure white background. No props, scenery, gradients, colored surfaces, extra text, watermark, border or frame."
].join(" ");

export async function POST(request: NextRequest) {
  const unauthorized = await requireApiUser();
  if (unauthorized) return unauthorized;

  try {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    if (!accountId || !apiToken) {
      return NextResponse.json({ error: "Cloudflare Workers AI is not configured. Check the Cloudflare account settings in Vercel." }, { status: 503 });
    }

    const incoming = await request.formData();
    const image = incoming.get("image");
    if (!(image instanceof File) || !["image/png", "image/jpeg", "image/webp"].includes(image.type)) {
      return NextResponse.json({ error: "Upload a PNG, JPEG, or WebP product photo." }, { status: 400 });
    }
    if (image.size > MAX_UPLOAD) {
      return NextResponse.json({ error: "Please use a product photo smaller than 5 MB." }, { status: 413 });
    }

    const form = new FormData();
    form.append("prompt", PRODUCT_PROMPT);
    form.append("input_image_0", image, "product-reference.png");
    form.append("width", "1024");
    form.append("height", "1024");
    form.append("guidance", "4");

    const upstream = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${MODEL}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, Accept: "application/json, image/png" },
        body: form,
        cache: "no-store",
        signal: AbortSignal.timeout(110_000),
      },
    );

    if (!upstream.ok) {
      const raw = await upstream.text().catch(() => "");
      let detail = "";
      try {
        const payload = JSON.parse(raw) as { errors?: Array<{ message?: string; code?: number }>; messages?: Array<{ message?: string }> };
        detail = payload.errors?.map((item) => item.message).filter(Boolean).join("; ") || payload.messages?.map((item) => item.message).filter(Boolean).join("; ") || "";
      } catch {
        detail = raw;
      }
      if (upstream.status === 401 || upstream.status === 403) {
        return NextResponse.json({
          error: "Cloudflare rejected the API token. It must have Account permissions: Workers AI Read and Workers AI Edit. No paid fallback was used.",
        }, { status: 502 });
      }
      if (upstream.status === 429 || upstream.status === 503) {
        return NextResponse.json({ error: "Cloudflare's free Workers AI capacity or daily quota is temporarily unavailable. No paid fallback was used." }, { status: 503 });
      }
      return NextResponse.json({ error: (detail || `Cloudflare Workers AI failed (HTTP ${upstream.status}).`).slice(0, 600) }, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") || "";
    let imageBytes: Buffer;
    if (contentType.startsWith("image/")) {
      imageBytes = Buffer.from(await upstream.arrayBuffer());
    } else {
      const payload = await upstream.json().catch(() => null) as {
        success?: boolean;
        errors?: Array<{ message?: string }>;
        result?: { image?: string };
      } | null;
      const encoded = payload?.result?.image;
      if (!payload?.success || typeof encoded !== "string" || !encoded) {
        const detail = payload?.errors?.map((item) => item.message).filter(Boolean).join("; ");
        return NextResponse.json({ error: detail || "Cloudflare returned no generated image." }, { status: 502 });
      }
      imageBytes = Buffer.from(encoded.replace(/^data:[^,]+,/, ""), "base64");
    }

    if (!imageBytes.length || imageBytes.length > 15_000_000) {
      return NextResponse.json({ error: "Cloudflare returned an invalid or oversized image." }, { status: 502 });
    }

    return new NextResponse(new Uint8Array(imageBytes), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return NextResponse.json({
      error: timedOut
        ? "Cloudflare FLUX took too long to respond. Please try again; no paid fallback is enabled."
        : error instanceof Error ? error.message : "Unexpected Cloudflare FLUX image editing error.",
    }, { status: timedOut ? 504 : 500 });
  }
}
