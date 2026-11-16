/**
 * In-browser product photo clean-up.
 *
 * Cut-out: an open-source AI matting model (IMG.LY background-removal, ISNet)
 * that runs locally through WebAssembly. Photos are never uploaded, and nothing
 * is generated — every product pixel in the output comes from the original
 * photo. The model only decides which pixels are product and which are not.
 *
 * After the cut-out, faint leftovers of soft shadows are removed from the
 * matte, the product is cropped to its bounding box and centred on pure white.
 *
 * Licence note: @imgly/background-removal is AGPL-3.0 (a commercial licence is
 * available from IMG.LY). It is loaded at runtime from a CDN, pinned to the
 * version below, and is not bundled into this app.
 */

const IMGLY_URL = "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm";

export type Flag = "touches_edge" | "low_resolution" | "nothing_found" | "not_separated";

export const FLAG_TEXT: Record<Flag, string> = {
  touches_edge: "Product touches the edge of the photo, so part of it may be cut off. Reshoot with space around it.",
  low_resolution: "Product is under 1000 px in the source. It will look soft when shoppers zoom.",
  nothing_found: "No product was found in this photo.",
  not_separated: "The background could not be separated from the product.",
};

export type Cutout = {
  /** The product only, transparent elsewhere, cropped to its bounding box. */
  canvas: HTMLCanvasElement;
  flags: Flag[];
  /** Longest side of the product in source pixels. */
  productPx: number;
};

export const IMAGE_PRESETS = {
  amazon: { label: "Amazon", size: 2000, fill: 0.85, rule: "Pure white, product fills 85% of the frame, 1000 px+ for zoom" },
  noon: { label: "Noon", size: 1500, fill: 0.85, rule: "White background, JPEG, at least 660 px wide" },
  tiktok: { label: "TikTok Shop", size: 1200, fill: 0.8, rule: "Square, above 600 x 600 px" },
  shopify: { label: "Shopify", size: 2048, fill: 0.8, rule: "Square, 2048 x 2048 px recommended" },
} as const;
export type PresetId = keyof typeof IMAGE_PRESETS;

/** Thrown when the model itself cannot be fetched (offline, CDN blocked). */
export class ModelLoadError extends Error {
  constructor() {
    super("The cut-out model could not be loaded.");
    this.name = "ModelLoadError";
  }
}

type Imgly = { removeBackground: (image: Blob) => Promise<Blob> };
let modelPromise: Promise<Imgly> | null = null;

function loadModel(): Promise<Imgly> {
  if (!modelPromise) {
    // A runtime URL import, kept out of the bundler's sight on purpose.
    const importFromUrl = new Function("u", "return import(u)") as (u: string) => Promise<unknown>;
    modelPromise = importFromUrl(IMGLY_URL).then((m) => {
      const mod = m as Partial<Imgly>;
      if (typeof mod.removeBackground !== "function") throw new ModelLoadError();
      return mod as Imgly;
    });
    modelPromise.catch(() => {
      modelPromise = null; // allow a retry on the next photo
    });
  }
  return modelPromise;
}

const FULL = 3000; // compositing resolution cap (longest side)

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  return [canvas, ctx];
}

/**
 * strength 0–100: balanced removal of faint matte and background residue.
 * Keep the default modest so fine edges, transparent-looking parts and textures survive.
 */
export async function cutout(file: Blob, strength: number): Promise<Cutout> {
  let model: Imgly;
  try {
    model = await loadModel();
  } catch {
    throw new ModelLoadError();
  }
  const matte = await model.removeBackground(file);
  const bitmap = await createImageBitmap(matte);
  const srcMax = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, FULL / srcMax);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const [canvas, ctx] = makeCanvas(w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  // Shadows survive the model as low-alpha haze. Cut everything under the floor
  // and stretch what is left so solid areas stay fully opaque.
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const floor = 24 + (Math.min(100, Math.max(0, strength)) * 0.8);
  const gain = 255 / Math.max(1, 235 - floor);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let area = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const i = row + x * 4 + 3;
      const a = d[i] <= floor ? 0 : Math.min(255, (d[i] - floor) * gain);
      d[i] = a;
      if (a > 24) {
        area++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  ctx.putImageData(img, 0, 0);

  const flags: Flag[] = [];
  const coverage = area / (w * h);
  if (maxX < 0 || coverage < 0.003) {
    const [empty] = makeCanvas(8, 8);
    return { canvas: empty, flags: ["nothing_found"], productPx: 0 };
  }
  if (coverage > 0.93) flags.push("not_separated");
  else if (minX <= 1 || minY <= 1 || maxX >= w - 2 || maxY >= h - 2) flags.push("touches_edge");

  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const [crop, cctx] = makeCanvas(cw, ch);
  cctx.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);

  const productPx = Math.round(Math.max(cw, ch) / scale);
  if (productPx < 1000) flags.push("low_resolution");
  return { canvas: crop, flags, productPx };
}

/** Centres the product on a pure white square. `fill` = share of the frame the product's longest side takes. */
export function compose(c: Cutout, size: number, fill: number): HTMLCanvasElement {
  const [out, ctx] = makeCanvas(size, size);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  if (c.productPx === 0) return out;
  const s = (size * fill) / Math.max(c.canvas.width, c.canvas.height);
  const dw = c.canvas.width * s;
  const dh = c.canvas.height * s;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(c.canvas, (size - dw) / 2, (size - dh) / 2, dw, dh);
  return out;
}

export function toJpeg(canvas: HTMLCanvasElement, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the image."))), "image/jpeg", quality),
  );
}
