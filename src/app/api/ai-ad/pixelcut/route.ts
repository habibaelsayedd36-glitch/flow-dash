import { requireApiUser } from "@/lib/auth/server";
import { getPixelAiKey } from "@/lib/ai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const PIXELCUT_ENDPOINT = "https://api.developer.pixelcut.ai/v1/remove-background";
const PIXELCUT_RESULT_HOST = "assets.pixelcut.app";

export async function POST(request: NextRequest) {
  const unauthorized = await requireApiUser();
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const image_b64 = typeof body?.image_b64 === "string" ? body.image_b64 : "";
    const image_type = typeof body?.image_type === "string" && ["image/png", "image/jpeg", "image/webp"].includes(body.image_type) ? body.image_type : "image/png";
    if (!image_b64 || image_b64.length > 30_000_000) {
      return NextResponse.json({ error: "Upload a product image smaller than 20 MB." }, { status: 400 });
    }

    const apiKey = await getPixelAiKey();
    if (!apiKey) return NextResponse.json({ error: "Add your Pixelcut API key in Settings & AI Key first." }, { status: 400 });

    // Pixelcut's documented request field is image_url (not image).
    // A data URL lets FLOW send a private local upload without making it public.
    const upstream = await fetch(PIXELCUT_ENDPOINT, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
        "Accept": "image/png, application/json",
      },
      body: JSON.stringify({ image_url: `data:${image_type};base64,${image_b64}`, format: "png", crop: false }),
      signal: AbortSignal.timeout(55_000),
      cache: "no-store",
    });

    if (!upstream.ok) {
      const payload = await upstream.json().catch(async () => ({ error: await upstream.text().catch(() => "") })) as { error?: string; message?: string; error_code?: string };
      const detail = payload.error || payload.message || payload.error_code || `Pixelcut API request failed (HTTP ${upstream.status}).`;
      return NextResponse.json({ error: detail.slice(0, 600) }, { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 });
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (contentType.startsWith("image/")) {
      return new NextResponse(await upstream.arrayBuffer(), {
        headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
      });
    }

    // Pixelcut may return JSON with a temporary result_url instead of image bytes.
    const payload = await upstream.json().catch(() => null) as { result_url?: string } | null;
    if (!payload?.result_url) {
      return NextResponse.json({ error: "Pixelcut returned no processed image." }, { status: 502 });
    }

    const resultUrl = new URL(payload.result_url);
    if (resultUrl.protocol !== "https:" || resultUrl.hostname !== PIXELCUT_RESULT_HOST) {
      return NextResponse.json({ error: "Pixelcut returned an unexpected image URL." }, { status: 502 });
    }
    const result = await fetch(resultUrl, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
    const resultType = result.headers.get("content-type") || "";
    if (!result.ok || !resultType.startsWith("image/")) {
      return NextResponse.json({ error: "Could not download the processed image from Pixelcut." }, { status: 502 });
    }
    return new NextResponse(await result.arrayBuffer(), {
      headers: { "Content-Type": resultType, "Cache-Control": "no-store" },
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return NextResponse.json({ error: timedOut ? "Pixelcut request timed out. Please try again." : error instanceof Error ? error.message : "Unexpected Pixelcut error." }, { status: timedOut ? 504 : 500 });
  }
}
