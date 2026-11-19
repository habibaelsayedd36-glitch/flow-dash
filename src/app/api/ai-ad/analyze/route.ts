import { requireApiUser } from "@/lib/auth/server";
import { getAiProvider, getOpenRouterVisionKey } from "@/lib/ai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const unauthorized = await requireApiUser();
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json();
    const image_b64 = typeof body?.image_b64 === "string" ? body.image_b64 : "";
    const image_type = typeof body?.image_type === "string" && ["image/png", "image/jpeg", "image/webp"].includes(body.image_type) ? body.image_type : "image/png";
    if (!image_b64 || image_b64.length > 12_000_000) {
      return NextResponse.json({ error: "Upload a product image smaller than 9 MB." }, { status: 400 });
    }

    const provider = await getAiProvider();
    const visionKey = await getOpenRouterVisionKey();
    const apiKey = visionKey || (provider?.id === "openrouter" ? provider.key : "");
    if (!apiKey) {
      return NextResponse.json({ error: "Add an OpenRouter image-analysis key in Settings & AI Key, or connect your main OpenRouter key." }, { status: 400 });
    }

    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(25_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://flow-dash-drab.vercel.app",
        "X-Title": "FLOW Workspace",
      },
      body: JSON.stringify({
        model: "nvidia/nemotron-3.5-super-vl:free",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Inspect this exact product photo for a commercial ecommerce image-editing workflow. Describe only what is visibly certain: product category, package/container shape, proportions, dominant colors, cap/closure/trigger/handle, material appearance, label position, visible brand/logo/text (transcribe only if clearly legible), graphics and distinctive physical details. Do not guess hidden sides, ingredients, capacity, materials, or brand text. Explicitly state that the uploaded photo is the sole identity reference. Return concise plain text, no markdown." },
            { type: "image_url", image_url: { url: `data:${image_type};base64,${image_b64}` } },
          ],
        }],
        stream: false,
        max_tokens: 700,
        temperature: 0.1,
      }),
      cache: "no-store",
    });
    const payload = await upstream.json().catch(() => null) as { error?: { message?: string }; choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }> } | null;
    const raw = payload?.choices?.[0]?.message?.content;
    const description = typeof raw === "string" ? raw.trim() : Array.isArray(raw) ? raw.map((part) => part.text ?? "").join("\\n").trim() : "";
    if (!upstream.ok || !description) {
      return NextResponse.json({ error: payload?.error?.message || `OpenRouter free image analysis failed (HTTP ${upstream.status}).` }, { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 });
    }
    return NextResponse.json({ description }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return NextResponse.json({ error: timedOut ? "Product image analysis timed out. Please try again." : error instanceof Error ? error.message : "Unexpected image analysis error." }, { status: timedOut ? 504 : 500 });
  }
}
