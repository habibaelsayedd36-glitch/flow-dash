/**
 * Field definitions for listing-automation jobs. Pure: shared by the upload
 * wizard (browser) and the sheet builders (server).
 */

export const FIELDS = [
  { key: "sku", label: "SKU", hints: ["sku", "item code", "product code", "code", "كود", "رمز"] },
  { key: "nameAr", label: "Product name (Arabic)", hints: ["arabic", "name ar", "ar name", "اسم", "المنتج", "الصنف"] },
  { key: "name", label: "Product name (English)", hints: ["product name", "item name", "name", "title", "product", "item"] },
  { key: "brand", label: "Brand", hints: ["brand", "ماركة", "العلامة", "براند"] },
  { key: "barcode", label: "Barcode (EAN / UPC)", hints: ["barcode", "ean", "upc", "gtin", "باركود"] },
  { key: "quantity", label: "Quantity received", hints: ["qty", "quantity", "units", "pcs", "الكمية", "عدد"] },
  { key: "price", label: "Price", hints: ["price", "السعر", "سعر"] },
  { key: "color", label: "Colour", hints: ["color", "colour", "اللون", "لون"] },
  { key: "size", label: "Size", hints: ["size", "المقاس", "مقاس", "الحجم"] },
  { key: "material", label: "Material", hints: ["material", "fabric", "الخامة", "خامة"] },
  { key: "weight", label: "Weight", hints: ["weight", "الوزن", "وزن"] },
  { key: "dimensions", label: "Dimensions", hints: ["dimension", "dims", "l x w", "الأبعاد", "ابعاد"] },
  { key: "origin", label: "Country of origin", hints: ["origin", "made in", "country", "بلد", "المنشأ"] },
  { key: "featuresAr", label: "Features / description (Arabic)", hints: ["features ar", "arabic features", "description ar", "مميزات عربي", "وصف عربي", "تفاصيل عربي"] },
  { key: "features", label: "Features / description (English)", hints: ["features en", "feature en", "description en", "details en", "features", "feature", "description", "details", "specs", "notes", "الوصف", "مميزات", "ملاحظات", "تفاصيل"] },
  { key: "keywords", label: "Target keywords", hints: ["keywords", "search terms", "target terms", "كلمات مفتاحية", "كلمات البحث"] },
] as const;

export type FieldKey = (typeof FIELDS)[number]["key"];
export type Mapping = Partial<Record<FieldKey, number>>;

export const SPEC_LABELS: Record<string, string> = {
  color: "colour",
  size: "size",
  material: "material",
  weight: "weight",
  dimensions: "dimensions",
  origin: "country of origin",
};

/** Guess which column holds which field from the header text. The user confirms it. */
export function suggestMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  const taken = new Set<number>();
  for (const field of FIELDS) {
    for (const hint of field.hints) {
      const i = headers.findIndex((h, idx) => !taken.has(idx) && h.toLowerCase().includes(hint));
      if (i >= 0) {
        mapping[field.key] = i;
        taken.add(i);
        break;
      }
    }
  }
  return mapping;
}

export function flagSummary(item: { estimated?: string[]; missing?: string[]; notes?: string[] }): string[] {
  const out: string[] = [];
  if (item.estimated?.length) out.push(`Estimated: ${item.estimated.map((k) => SPEC_LABELS[k] ?? k).join(", ")}`);
  if (item.missing?.length) out.push(`Missing: ${item.missing.map((k) => SPEC_LABELS[k] ?? k).join(", ")}`);
  if (item.notes?.includes("thin_brief")) out.push("Copy written from the product name only");
  if (item.notes?.includes("no_arabic")) out.push("Arabic copy missing");
  return out;
}

export const isFlagged = (item: { estimated?: string[]; missing?: string[]; notes?: string[] }) =>
  Boolean(item.estimated?.length || item.missing?.length || item.notes?.length);
