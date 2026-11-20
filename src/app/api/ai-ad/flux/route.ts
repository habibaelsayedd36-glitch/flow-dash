import { requireApiUser } from "@/lib/auth/server";
import { getCloudflareFluxConfig } from "@/lib/ai";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 90;

const MODEL = "@cf/black-forest-labs/flux-2-klein-4b";

export async function POST(request: NextRequest) {
  const unauthorized = await requireApiUser();
  if (unauthorized) return unauthorized;

  try {
    const { accountId, token } = await getCloudflareFluxConfig();
    if (!/^[a-f0-9]{32}$/i.test(accountId) || !token) {
      return NextResponse.json({ error: "Connect Cloudflare Workers AI in Settings before using FLUX.2 Klein 4B." }, { status: 400 });
    }

    const incoming = await request.formData();
    const image = incoming.get("image");
    if (!(image instanceof File) || !["image/png", "image/jpeg", "image/webp"].includes(image.type)) {
      return NextResponse.json({ error: "Upload a PNG, JPEG, or WebP product photo." }, { status: 400 });
    }
    if (image.size > 3_000_000) {
      return NextResponse.json({ error: "The FLUX reference image must be smaller than 3 MB." }, { status: 413 });
    }

    const prompt = [
      "Re-generate the entire photograph with AI as a brand-new, photorealistic premium ecommerce MAIN product image. Do not merely erase the background, apply a filter, or make a minor retouch.",
      "Use the uploaded photo as the visual reference for the exact product identity, then render a fresh professional studio photograph with a newly synthesized clean composition, lighting, shadows, and white studio environment.",
      "The physical product must remain recognizably the same item: preserve its silhouette, geometry, proportions, cap, pump, closure, packaging shape, material, finish, and original colors. Do not redesign the product, add accessories, or create extra products.",
      "LABEL FIDELITY IS A PRIORITY: reproduce the visible label layout, brand mark, typography, icons, and printed wording as closely as possible to the reference. Never invent replacement words or translate label text. If tiny text cannot be reproduced reliably, keep the label visually faithful rather than fabricating new writing.",
      "Create a perfectly pure seamless white #FFFFFF ecommerce background, square composition, front-facing catalog view, centered upright product, fully visible with safe margins, occupying about 85 percent of the frame.",
      "Rebuild the scene with premium commercial studio lighting, accurate white balance, crisp realistic edges, natural material reflections, polished high-end product photography, and a subtle realistic contact shadow directly beneath the product.",
      "The result must look like a newly generated professional product photograph, not the original photo with only its background removed. No props, scenery, gradients, colored backdrop, extra text, watermark, or frame."
    ].join(" ");

    // FLOW caps its own use at 80 fixed 1024px generations per UTC day.
    // This leaves a buffer under Cloudflare's 10,000-Neuron daily free allocation.
    const dayKey = new Date().toISOString().slice(0, 10);
    const usageKey = "cloudflare_flux_daily_" + dayKey;
    const [usageRow] = await db.select().from(settings).where(eq(settings.key, usageKey));
    const used = Number(usageRow?.value ?? "0");
    if (used >= 80) {
      return NextResponse.json({ error: "FLOW's free FLUX daily limit (80 images) has been reached. Try again after the daily reset. No paid fallback is enabled." }, { status: 429 });
    }
    await db.insert(settings).values({ key: usageKey, value: String(used + 1) })
      .onConflictDoUpdate({ target: settings.key, set: { value: String(used + 1) } });

    const body = new FormData();
    body.append("prompt", prompt);
    body.append("input_image_0", image, "product-reference.png");
    body.append("width", "1024");
    body.append("height", "1024");
    body.append("guidance", "3.5");

    const endpoint = "https://api.cloudflare.com/client/v4/accounts/" + accountId + "/ai/run/" + MODEL;
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body,
      signal: AbortSignal.timeout(80_000),
      cache: "no-store",
    });

    const payload = await upstream.json().catch(() => null) as {
      success?: boolean;
      result?: { image?: string };
      errors?: Array<{ message?: string; code?: number }>;
      messages?: Array<{ message?: string }>;
    } | null;

    if (!upstream.ok || !payload?.success || !payload.result?.image) {
      const detail = payload?.errors?.[0]?.message || payload?.messages?.[0]?.message || "Cloudflare FLUX request failed (HTTP " + upstream.status + ").";
      const status = upstream.status === 429 ? 429 : upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502;
      return NextResponse.json({ error: detail.slice(0, 500) }, { status });
    }

    const bytes = Buffer.from(payload.result.image, "base64");
    if (!bytes.length || bytes.length > 15_000_000) {
      return NextResponse.json({ error: "Cloudflare returned an invalid or oversized image." }, { status: 502 });
    }

    return new NextResponse(bytes, {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return NextResponse.json({
      error: timedOut ? "FLUX.2 Klein 4B timed out. Please retry with a smaller source photo." : error instanceof Error ? error.message : "Unexpected FLUX image editing error.",
    }, { status: timedOut ? 504 : 500 });
  }
}
