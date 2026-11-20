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

/**
 * Restore small mask gaps enclosed by the product silhouette.
 * These gaps are commonly caused when a matting model mistakes printed
 * lettering, fine label marks or tiny dark details for background.
 * RGB always remains the user's original pixels; only alpha is repaired.
 */
function restoreEnclosedDetails(image: ImageData, width: number, height: number): void {
  const pixels = width * height;
  const alphaThreshold = 20;
  const visited = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  const alphaAt = (index: number) => image.data[index * 4 + 3];
  let head = 0;
  let tail = 0;

  const seed = (index: number) => {
    if (!visited[index] && alphaAt(index) <= alphaThreshold) {
      visited[index] = 1;
      queue[tail++] = index;
    }
  };

  // Mark transparent pixels connected to the image border as true background.
  for (let x = 0; x < width; x++) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    if (x > 0) seed(index - 1);
    if (x + 1 < width) seed(index + 1);
    if (index >= width) seed(index - width);
    if (index + width < pixels) seed(index + width);
  }

  // Fill only small enclosed gaps; large transparent openings (e.g. handles)
  // remain transparent. A cap avoids turning large internal openings solid.
  const maxGapPixels = Math.max(64, Math.floor(pixels * 0.005));
  for (let start = 0; start < pixels; start++) {
    if (visited[start] || alphaAt(start) > alphaThreshold) continue;
    head = 0;
    tail = 0;
    visited[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        index >= width ? index - width : -1,
        index + width < pixels ? index + width : -1,
      ];
      for (const next of neighbors) {
        if (next >= 0 && !visited[next] && alphaAt(next) <= alphaThreshold) {
          visited[next] = 1;
          if (tail < queue.length) queue[tail++] = next;
        }
      }
    }
    if (tail <= maxGapPixels) {
      for (let i = 0; i < tail; i++) image.data[queue[i] * 4 + 3] = 255;
    }
  }
}

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
  // Use the AI result ONLY as an alpha matte. Keep every visible product
  // pixel (including printed text, logos and fine label details) from the
  // user's original photograph; never use model-generated RGB pixels.
  const matte = await model.removeBackground(file);
  const [sourceBitmap, matteBitmap] = await Promise.all([
    createImageBitmap(file),
    createImageBitmap(matte),
  ]);
  const srcMax = Math.max(sourceBitmap.width, sourceBitmap.height);
  const scale = Math.min(1, FULL / srcMax);
  const w = Math.max(1, Math.round(sourceBitmap.width * scale));
  const h = Math.max(1, Math.round(sourceBitmap.height * scale));
  const [canvas, ctx] = makeCanvas(w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(sourceBitmap, 0, 0, w, h);
  // The segmentation model normally returns the same dimensions. If it does
  // not, scale its mask to the original photo's dimensions without replacing
  // the original product colors or lettering.
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(matteBitmap, 0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
  sourceBitmap.close();
  matteBitmap.close();

  // Refine the AI matte gently: suppress faint background haze while keeping
  // a smooth transition at the product edge. RGB remains the untouched source.
  // The slider controls how firmly faint edge residue is removed.
  const img = ctx.getImageData(0, 0, w, h);
  restoreEnclosedDetails(img, w, h);
  const d = img.data;
  const low = 5 + Math.max(0, Math.min(100, strength)) * 0.20;
  const high = 252 - Math.max(0, Math.min(100, strength)) * 0.22;
  for (let i = 0; i < d.length; i += 4) {
    const alpha = d[i + 3];
    if (alpha <= low) {
      d[i + 3] = 0;
    } else if (alpha >= high) {
      d[i + 3] = 255;
    } else {
      const t = (alpha - low) / (high - low);
      // Smoothstep keeps antialiased edges soft instead of making them jagged.
      d[i + 3] = Math.round((t * t * (3 - 2 * t)) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let area = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const alpha = d[row + x * 4 + 3];
      if (alpha > 8) {
        area++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const flags: Flag[] = [];
  const coverage = area / (w * h);
  if (maxX < 0 || coverage < 0.003) {
    const [empty] = makeCanvas(8, 8);
    return { canvas: empty, flags: ["nothing_found"], productPx: 0 };
  }
  if (coverage > 0.93) flags.push("not_separated");
  else if (minX <= 1 || minY <= 1 || maxX >= w - 2 || maxY >= h - 2) flags.push("touches_edge");

  // Keep the full soft-alpha edge; only crop fully transparent outer pixels.
  const pad = Math.max(2, Math.round(Math.min(w, h) * 0.002));
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
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
