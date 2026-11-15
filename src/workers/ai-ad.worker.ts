import { detectCapabilities, generateImage, loadModel } from "web-txt2img";

type Request = { id: number; prompt: string };
type Progress = { id: number; type: "progress"; pct?: number; message?: string };
type Result = { id: number; type: "result"; ok: boolean; blob?: Blob; message?: string };

let loaded = false;
let loading: Promise<void> | null = null;

async function ensureModel(id: number) {
  if (loaded) return;
  if (!loading) {
    loading = (async () => {
      const caps = await detectCapabilities();
      if (!caps.webgpu) throw new Error("WebGPU مش مدعوم في المتصفح أو كارت الشاشة.");
      const result = await loadModel("sd-turbo", {
        backendPreference: ["webgpu"],
        tokenizerProvider: async () => {
          const { AutoTokenizer, env } = await import("@xenova/transformers");
          env.allowLocalModels = false;
          env.allowRemoteModels = true;
          env.remoteHost = "https://huggingface.co/";
          env.remotePathTemplate = "{model}/resolve/{revision}/";
          env.useBrowserCache = true;
          const tokenizer = await AutoTokenizer.from_pretrained("Xenova/clip-vit-base-patch16");
          tokenizer.pad_token_id = 0;
          return (text: string, options?: Record<string, unknown>) => tokenizer(text, options);
        },
        onProgress: (p) => {
          const message: Progress = { id, type: "progress", pct: p.pct, message: p.message ?? p.phase };
          self.postMessage(message);
        },
      });
      if (!result?.ok) throw new Error(result?.message || "فشل تحميل موديل الصور.");
      loaded = true;
    })().finally(() => { loading = null; });
  }
  await loading;
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, prompt } = event.data;
  try {
    await ensureModel(id);
    self.postMessage({ id, type: "progress", pct: 65, message: "AI is creating the background…" } satisfies Progress);
    const result = await generateImage({
      model: "sd-turbo",
      prompt,
      onProgress: (p) => self.postMessage({ id, type: "progress", pct: p.pct, message: p.phase } satisfies Progress),
    });
    if (!result?.ok) throw new Error(result?.message || "فشل توليد الخلفية.");
    self.postMessage({ id, type: "result", ok: true, blob: result.blob } satisfies Result);
  } catch (error) {
    self.postMessage({ id, type: "result", ok: false, message: error instanceof Error ? error.message : "Unknown image generation error." } satisfies Result);
  }
};

export {};
