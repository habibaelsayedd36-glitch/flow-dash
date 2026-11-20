import { requireApiUser } from "@/lib/auth/server";
import { getCloudflareFluxConfig } from "@/lib/ai";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { sql } from "drizzle-orm";
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
      "Edit the supplied reference photo into one photorealistic premium ecommerce MAIN product photograph.",
      "Keep the exact same physical product from the reference image. This is a faithful photo retouch, not a redesign or a new product.",
      "CRITICAL LABEL LOCK: preserve every label exactly as photographed, including all printed words, letters, numbers, logos, brand marks, typography, layout, icons, barcodes, colors and label placement. Do not rewrite, translate, correct, replace, invent, remove or stylize any label content.",
      "Preserve the product's exact silhouette, geometry, proportions, cap, pump, closure, packaging, material, finish and original colors. Do not add accessories or extra objects.",
      "Use a perfectly pure seamless white #FFFFFF background, square composition, front-facing catalog view, centered upright product, fully visible with safe margins, occupying about 85 percent of the frame.",
      "Create polished commercial studio lighting, accurate white balance, crisp realistic edges, natural material reflections and a subtle realistic contact shadow directly underneath.",
      "No props, no scenery, no gradients, no colored backdrop, no extra text, no watermark, no frame.",
      "When a detail is uncertain, preserve the reference rather than guessing."
    ].join(" ");

    // Conservative app-level guard: 80 fixed 1024px generations/day keeps
    // FLOW below the documented 10,000-Neuron daily free allocation for this model.
    const dayKey = new Date().toISOString().slice(0, 10);
    const usageKey = `cloudflare_flux_daily_${dayKey}`;
    const [usage] = await db.insert(settings).values({ key: usageKey, value: "1" })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: sql`(CASE WHEN ${settings.value} ~ '^[0-9]+
    body.append("prompt", prompt);
    body.append("input_image_0", image, "product-reference.png");
    body.append("width", "1024");
    body.append("height", "1024");
    body.append("guidance", "3.5");

    const upstream = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
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
      const detail = payload?.errors?.[0]?.message || payload?.messages?.[0]?.message || `Cloudflare FLUX request failed (HTTP ${upstream.status}).`;
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
 THEN ${settings.value}::integer ELSE 0 END + 1)::text` },
      })
      .returning({ value: settings.value });
    if (Number(usage?.value ?? "1") > 80) {
      return NextResponse.json({ error: "FLOW's free FLUX daily limit (80 images) has been reached. Try again after the daily reset. No paid fallback is enabled." }, { status: 429 });
    }

    const body = new FormData();
    body.append("prompt", prompt);
    body.append("input_image_0", image, "product-reference.png");
    body.append("width", "1024");
    body.append("height", "1024");
    body.append("guidance", "3.5");

    const upstream = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
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
      const detail = payload?.errors?.[0]?.message || payload?.messages?.[0]?.message || `Cloudflare FLUX request failed (HTTP ${upstream.status}).`;
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
