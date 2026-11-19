import { requireApiUser } from "@/lib/auth/server";
import { getPixelAiKey } from "@/lib/ai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

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

    const upstream = await fetch("https://api.developer.pixelcut.ai/v1/remove-background", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
        "Accept": "image/png",
      },
      body: JSON.stringify({ image: `data:${image_type};base64,${image_b64}`, format: "png" }),
      signal: AbortSignal.timeout(55_000),
      cache: "no-store",
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      return NextResponse.json({ error: detail.slice(0, 600) || `Pixelcut API request failed (HTTP ${upstream.status}).` }, { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 });
    }
    const contentType = upstream.headers.get("content-type") || "image/png";
    if (!contentType.startsWith("image/")) {
      const detail = await upstream.text().catch(() => "");
      return NextResponse.json({ error: detail.slice(0, 600) || "Pixelcut returned an unexpected response." }, { status: 502 });
    }
    return new NextResponse(await upstream.arrayBuffer(), {
      headers: { "Content-Type": contentType, "Cache-Control": "no-store" },
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return NextResponse.json({ error: timedOut ? "Pixelcut request timed out. Please try again." : error instanceof Error ? error.message : "Unexpected Pixelcut error." }, { status: timedOut ? 504 : 500 });
  }
}
