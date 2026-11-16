import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "@cf/black-forest-labs/flux-1-schnell";

export async function POST(request: NextRequest) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    return NextResponse.json({ error: "Cloudflare AI is not connected. Check CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in Vercel." }, { status: 503 });
  }

  try {
    const body = await request.json();
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt || prompt.length > 1800) {
      return NextResponse.json({ error: "The scene prompt must be between 1 and 1800 characters." }, { status: 400 });
    }

    // Generate an EMPTY scene/background only. The user's real product photo is
    // never sent to the generative model, so printed labels and logos stay intact.
    const upstream = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`,
      {
        method: "POST",
        signal: AbortSignal.timeout(50_000),
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        cache: "no-store",
      },
    );

    const payload = await upstream.json().catch(() => null) as {
      success?: boolean;
      errors?: Array<{ message?: string }>;
      result?: { image?: string };
    } | null;

    if (!upstream.ok || !payload?.success || !payload.result?.image) {
      const message = payload?.errors?.map((item) => item.message).filter(Boolean).join("; ");
      return NextResponse.json({ error: message || `Cloudflare background generation failed (HTTP ${upstream.status}).` }, { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 });
    }

    const image = Buffer.from(payload.result.image, "base64");
    return new NextResponse(image, {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store", "Content-Length": String(image.byteLength) },
    });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return NextResponse.json(
      { error: timedOut ? "Cloudflare background generation timed out. Please try again." : error instanceof Error ? error.message : "Unexpected image generation error." },
      { status: timedOut ? 504 : 500 },
    );
  }
}
