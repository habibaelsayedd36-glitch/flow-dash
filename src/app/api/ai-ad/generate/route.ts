import { requireApiUser } from "@/lib/auth/server";
import { getAiProvider } from "@/lib/ai";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const unauthorized = await requireApiUser();
  if (unauthorized) return unauthorized;

  try {
    const provider = await getAiProvider();
    if (!provider || !["gemini", "openai"].includes(provider.id)) {
      return NextResponse.json(
        { error: provider?.id === "openrouter"
          ? "OpenRouter Recraft creates a new image from text and cannot use your uploaded product photo as a reference. To preserve the exact product, select Google Gemini or OpenAI in Settings & AI Key."
          : "Choose Google Gemini or OpenAI in FLOW Settings & AI Key and save its API key before generating product angles." },
        { status: 400 },
      );
    }

    const body = await request.json();
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const image_b64 = typeof body?.image_b64 === "string" ? body.image_b64 : "";
    const image_type = typeof body?.image_type === "string" && ["image/png", "image/jpeg", "image/webp"].includes(body.image_type) ? body.image_type : "image/png";

    if (!prompt || prompt.length > 4096) {
      return NextResponse.json({ error: "The image prompt must be between 1 and 4096 characters." }, { status: 400 });
    }
    if (!image_b64 || image_b64.length > 12_000_000) {
      return NextResponse.json({ error: "Upload a product image smaller than 9 MB." }, { status: 400 });
    }

    if (provider.id === "openai") {
      const imageBytes = Buffer.from(image_b64, "base64");
      const form = new FormData();
      form.append("model", provider.model.startsWith("gpt-image-") ? provider.model : "gpt-image-2");
      form.append("prompt", prompt);
      form.append("size", "1024x1024");
      form.append("quality", "high");
      form.append("image", new Blob([imageBytes], { type: image_type }), image_type === "image/jpeg" ? "reference.jpg" : image_type === "image/webp" ? "reference.webp" : "reference.png");
      const upstream = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        signal: AbortSignal.timeout(55_000),
        headers: { Authorization: `Bearer ${provider.key}` },
        body: form,
        cache: "no-store",
      });
      const payload = await upstream.json().catch(() => null) as { error?: { message?: string }; data?: Array<{ b64_json?: string }> } | null;
      const imageData = payload?.data?.[0]?.b64_json;
      if (!upstream.ok || !imageData) {
        return NextResponse.json({ error: payload?.error?.message || `OpenAI image editing failed (HTTP ${upstream.status}).` }, { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 });
      }
      const image = Buffer.from(imageData, "base64");
      return new NextResponse(image, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store", "Content-Length": String(image.byteLength) } });
    }

    const model = provider.model.startsWith("gemini-") ? provider.model : "gemini-3.1-flash-image";
    const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      signal: AbortSignal.timeout(55_000),
      headers: { "Content-Type": "application/json", "x-goog-api-key": provider.key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }, { inline_data: { mime_type: image_type, data: image_b64 } }] }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1", imageSize: "2K" }, temperature: 0.25 },
      }),
      cache: "no-store",
    });
    const payload = await upstream.json().catch(() => null) as {
      error?: { message?: string };
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string }; inline_data?: { mime_type?: string; data?: string } }> }; finishReason?: string }>;
    } | null;
    const parts = payload?.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((part) => part.inlineData?.data || part.inline_data?.data);
    const imageData = imagePart?.inlineData?.data ?? imagePart?.inline_data?.data;
    const mimeType = imagePart?.inlineData?.mimeType ?? imagePart?.inline_data?.mime_type ?? "image/png";
    if (!upstream.ok || !imageData) {
      const message = payload?.error?.message || (payload?.candidates?.[0]?.finishReason
        ? `Gemini did not return an image (finish reason: ${payload.candidates[0].finishReason}).`
        : `Gemini image generation failed (HTTP ${upstream.status}).`);
      return NextResponse.json({ error: message }, { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 });
    }
    const image = Buffer.from(imageData, "base64");
    return new NextResponse(image, { headers: { "Content-Type": mimeType, "Cache-Control": "no-store", "Content-Length": String(image.byteLength) } });
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return NextResponse.json(
      { error: timedOut ? "AI image editing timed out. Please try again." : error instanceof Error ? error.message : "Unexpected AI image editing error." },
      { status: timedOut ? 504 : 500 },
    );
  }
}
