import ExcelJS from "exceljs";
import type { Job, JobItem } from "@/db/schema";
import { flagSummary } from "./job-fields";

/** Server-only: reads receiving sheets and writes the collecting sheet + Amazon flat file. */

export const MAX_ROWS = 300;
const MAX_COLS = 40;

function parseDelimited(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf("\n") >>> 0 || text.length);
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const delim = count("\t") >= count(",") && count("\t") >= count(";") && count("\t") > 0 ? "\t" : count(";") > count(",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      cell = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

/** Returns the sheet as rows of strings. `keepLayout` keeps empty rows/cells in place (needed for templates). */
export async function parseSheet(buf: ArrayBuffer, filename: string, opts: { preferSheet?: string; keepLayout?: boolean; maxRows?: number } = {}): Promise<string[][]> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xlsm")) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const ws =
      (opts.preferSheet && wb.worksheets.find((w) => w.name.toLowerCase() === opts.preferSheet)) ||
      wb.worksheets.find((w) => w.actualRowCount > 0);
    if (!ws) return [];
    const cols = Math.min(ws.actualColumnCount || ws.columnCount, opts.keepLayout ? 400 : MAX_COLS);
    const rows: string[][] = [];
    const last = Math.min(ws.rowCount, opts.keepLayout ? 5 : (opts.maxRows ?? MAX_ROWS) + 50);
    for (let r = 1; r <= last; r++) {
      const row = ws.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= cols; c++) cells.push(String(row.getCell(c).text ?? "").trim());
      if (opts.keepLayout || cells.some(Boolean)) rows.push(cells);
    }
    return rows;
  }
  const text = new TextDecoder("utf-8").decode(buf).replace(/^\uFEFF/, "");
  const rows = parseDelimited(text);
  return opts.keepLayout ? rows.slice(0, 5) : rows.slice(0, (opts.maxRows ?? MAX_ROWS) + 1).map((r) => r.slice(0, MAX_COLS));
}

// ---------------------------------------------------------------------------
// Collecting sheet (.xlsx) — every estimate is highlighted and listed.
// ---------------------------------------------------------------------------

const SPEC_COLS: [string, string][] = [
  ["color", "Colour"],
  ["size", "Size"],
  ["material", "Material"],
  ["weight", "Weight"],
  ["dimensions", "Dimensions"],
  ["origin", "Country of origin"],
];

const fill = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

export async function buildCollectingSheet(job: Job): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FLOW Agency";
  const ws = wb.addWorksheet("Collecting sheet", { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });

  const head = [
    "SKU", "Product (from sheet)", "Brand", "Barcode", "Qty", "Price",
    "Title (EN)", "Title (AR)",
    ...[1, 2, 3, 4, 5].map((n) => `Bullet ${n} (EN)`),
    ...[1, 2, 3, 4, 5].map((n) => `Bullet ${n} (AR)`),
    "Description (EN)", "Description (AR)", "Search terms",
    ...SPEC_COLS.map(([, label]) => label),
    "Compliance score", "Written by", "FLAGS — check before publishing",
  ];
  ws.addRow(head);
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFBFBF7" } };
  headerRow.alignment = { vertical: "middle", wrapText: true };
  headerRow.height = 32;
  headerRow.eachCell((c) => (c.fill = fill("FF143C28")));
  head.forEach((h, i) => (ws.getColumn(i + 1).width = /Description|FLAGS/.test(h) ? 48 : /Title|Bullet|Product/.test(h) ? 34 : 16));

  const specStart = head.indexOf("Colour") + 1;
  for (const item of job.items) {
    const c = item.content;
    const b = (arr: string[] | undefined) => [0, 1, 2, 3, 4].map((i) => arr?.[i] ?? "");
    const row = ws.addRow([
      item.source.sku ?? "", item.source.name || item.source.nameAr || "", item.source.brand ?? "", item.source.barcode ?? "",
      item.source.quantity ?? "", item.source.price ?? "",
      c?.titleEn ?? "", c?.titleAr ?? "", ...b(c?.bulletsEn), ...b(c?.bulletsAr),
      c?.descriptionEn ?? "", c?.descriptionAr ?? "", c?.searchTerms ?? "",
      ...SPEC_COLS.map(([key]) => item.specs?.[key] ?? ""),
      item.score ?? "", item.status === "failed" ? `FAILED: ${item.error ?? ""}` : item.engine === "ai" ? "AI" : "Template engine",
      flagSummary(item).join(" · "),
    ]);
    row.alignment = { vertical: "top", wrapText: true };
    SPEC_COLS.forEach(([key], i) => {
      const cell = row.getCell(specStart + i);
      if (item.estimated?.includes(key)) {
        cell.fill = fill("FFFBE7A8");
        cell.note = "AI estimate — not from the receiving sheet. Verify before publishing.";
      } else if (item.missing?.includes(key)) {
        cell.fill = fill("FFFBE9E6");
      }
    });
    if (flagSummary(item).length) row.getCell(head.length).font = { bold: true, color: { argb: "FF7A5000" } };
  }

  const legend = wb.addWorksheet("Legend");
  legend.getColumn(1).width = 26;
  legend.getColumn(2).width = 90;
  legend.addRow(["Amber cell", "Value estimated by AI. It was NOT in the receiving sheet. Measure or confirm it before publishing."]).getCell(1).fill = fill("FFFBE7A8");
  legend.addRow(["Red cell", "Value is missing. Nothing was in the sheet and nothing could be estimated."]).getCell(1).fill = fill("FFFBE9E6");
  legend.addRow(["FLAGS column", "Lists every estimate, gap and thin brief for the row."]);
  legend.addRow(["Written by", "AI = generated by the connected model. Template engine = arranged from sheet facts only."]);
  legend.addRow(["Job", `${job.title} · ${job.items.length} rows · marketplace: ${job.marketplace}`]);

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Amazon flat file (tab-delimited). Uses the seller's own template header when
// one was uploaded; otherwise the common flat-file attribute names.
// ---------------------------------------------------------------------------

const DEFAULT_FIELDS: [string, string][] = [
  ["feed_product_type", "Product Type"], ["item_sku", "Seller SKU"], ["brand_name", "Brand Name"], ["item_name", "Product Name"],
  ["external_product_id", "Product ID"], ["external_product_id_type", "Product ID Type"], ["manufacturer", "Manufacturer"],
  ["product_description", "Product Description"], ["bullet_point1", "Bullet Point 1"], ["bullet_point2", "Bullet Point 2"],
  ["bullet_point3", "Bullet Point 3"], ["bullet_point4", "Bullet Point 4"], ["bullet_point5", "Bullet Point 5"],
  ["generic_keywords", "Search Terms"], ["standard_price", "Standard Price"], ["quantity", "Quantity"], ["color_name", "Colour"],
  ["size_name", "Size"], ["material_type", "Material Type"], ["item_weight", "Item Weight"],
  ["item_weight_unit_of_measure", "Item Weight Unit"], ["country_of_origin", "Country Of Origin"], ["update_delete", "Update Delete"],
];

const tsv = (v: string) => v.replace(/[\t\r\n]+/g, " ").trim();

function weightParts(raw: string): [string, string] {
  const m = raw.toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(kg|kilogram|g|gr|gram|lb|pound|oz|ounce)/);
  if (!m) return ["", ""];
  const unit = m[2].startsWith("k") ? "KG" : m[2].startsWith("g") ? "GR" : m[2].startsWith("l") || m[2].startsWith("p") ? "LB" : "OZ";
  return [m[1].replace(",", "."), unit];
}

function valuesFor(item: JobItem, job: Job, lang: "en" | "ar", includeEstimates: boolean): Record<string, string> {
  const c = item.content;
  const ar = lang === "ar";
  // A flat file cannot carry flags, so unverified estimates are left blank unless explicitly included.
  const spec = (key: string) => (!includeEstimates && item.estimated?.includes(key) ? "" : (item.specs?.[key] ?? ""));
  const bullets = (ar ? c?.bulletsAr : c?.bulletsEn) ?? [];
  const barcode = (item.source.barcode ?? "").replace(/\D/g, "");
  const [weight, unit] = weightParts(spec("weight"));
  const out: Record<string, string> = {
    feed_product_type: job.productType,
    item_sku: item.source.sku ?? "",
    brand_name: item.source.brand ?? "",
    item_name: (ar ? c?.titleAr : c?.titleEn) ?? "",
    external_product_id: barcode,
    external_product_id_type: barcode.length === 12 ? "UPC" : barcode.length === 13 ? "EAN" : barcode.length === 14 ? "GTIN" : "",
    manufacturer: item.source.brand ?? "",
    product_description: (ar ? c?.descriptionAr : c?.descriptionEn) ?? "",
    generic_keywords: c?.searchTerms ?? "",
    standard_price: (item.source.price ?? "").replace(/[^\d.]/g, ""),
    quantity: (item.source.quantity ?? "").replace(/[^\d]/g, ""),
    color_name: spec("color"),
    size_name: spec("size"),
    material_type: spec("material"),
    item_weight: weight,
    item_weight_unit_of_measure: unit,
    country_of_origin: spec("origin"),
    update_delete: "Update",
  };
  [0, 1, 2, 3, 4].forEach((i) => (out[`bullet_point${i + 1}`] = bullets[i] ?? ""));
  return out;
}

export function buildFlatFile(job: Job, lang: "en" | "ar", includeEstimates: boolean): string {
  const done = job.items.filter((i) => i.status === "done");
  let headerRows: string[][];
  let fields: string[];

  const tpl = job.template;
  const fieldRow = tpl?.findIndex((r) => r.some((cell) => cell.trim() === "item_sku")) ?? -1;
  if (tpl && fieldRow >= 0) {
    headerRows = tpl.slice(0, fieldRow + 1);
    fields = tpl[fieldRow].map((f) => f.trim());
  } else {
    const type = (job.productType || "PRODUCT").toUpperCase();
    fields = DEFAULT_FIELDS.map(([f]) => f);
    headerRows = [
      ["TemplateType=fptcustom", "Version=2021.1014", `TemplateSignature=${Buffer.from(type).toString("base64")}`],
      DEFAULT_FIELDS.map(([, label]) => label),
      fields,
    ];
  }

  const lines = headerRows.map((r) => r.map(tsv).join("\t"));
  for (const item of done) {
    const values = valuesFor(item, job, lang, includeEstimates);
    lines.push(fields.map((f) => tsv(values[f] ?? "")).join("\t"));
  }
  return lines.join("\r\n") + "\r\n";
}
