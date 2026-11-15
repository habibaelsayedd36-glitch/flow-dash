import type { Marketplace } from "./catalog";

/**
 * Marketplace listing rules + compliance checker + template engine.
 * Pure and isomorphic: the editor runs the same checks live in the browser.
 *
 * Limits follow each marketplace's published style guide for most categories
 * (Amazon title policy of Jan 2025, noon Seller Help Center, TikTok Shop listing
 * quality guidelines, Shopify admin limits). Some categories are stricter —
 * always confirm inside the seller portal before publishing.
 */

export type ListingContent = {
  titleEn: string;
  titleAr: string;
  bulletsEn: string[];
  bulletsAr: string[];
  descriptionEn: string;
  descriptionAr: string;
  searchTerms: string;
};

export type ProductBrief = {
  name: string;
  nameAr: string;
  brand: string;
  category: string;
  features: string;
  featuresAr: string;
  keywords: string;
};

export type MarketRule = {
  titleMin: number;
  titleMax: number;
  /** Practical ceiling the marketplace itself recommends (equal to titleMax when there is none). */
  titleSoft: number;
  brand: "start" | "forbidden" | "optional";
  bannedChars: string;
  /** Maximum times one word may appear in a title. */
  maxRepeat: number;
  bullets: number;
  bulletMin: number;
  bulletMax: number;
  descMin: number;
  descMax: number | null;
  /** Hidden keyword field: byte budget, free-form tags, or none. */
  terms: { kind: "bytes"; max: number } | { kind: "tags" } | null;
};

export const RULES: Record<Marketplace, MarketRule> = {
  amazon: {
    titleMin: 0,
    titleMax: 200,
    titleSoft: 200,
    brand: "start",
    bannedChars: "!$?_{}^¬¦",
    maxRepeat: 2,
    bullets: 5,
    bulletMin: 10,
    bulletMax: 255,
    descMin: 0,
    descMax: 2000,
    terms: { kind: "bytes", max: 249 },
  },
  noon: {
    titleMin: 5,
    titleMax: 200,
    titleSoft: 160,
    brand: "forbidden",
    bannedChars: "@^*#&",
    maxRepeat: 1,
    bullets: 5,
    bulletMin: 0,
    bulletMax: 250,
    descMin: 250,
    descMax: 4000,
    terms: null,
  },
  tiktok: {
    titleMin: 25,
    titleMax: 255,
    titleSoft: 255,
    brand: "optional",
    bannedChars: "",
    maxRepeat: 3,
    bullets: 5,
    bulletMin: 0,
    bulletMax: 250,
    descMin: 80,
    descMax: null,
    terms: null,
  },
  shopify: {
    titleMin: 0,
    titleMax: 255,
    titleSoft: 70,
    brand: "optional",
    bannedChars: "",
    maxRepeat: 3,
    bullets: 5,
    bulletMin: 0,
    bulletMax: 250,
    descMin: 0,
    descMax: null,
    terms: { kind: "tags" },
  },
};

export type CheckId =
  | "title_len"
  | "title_soft"
  | "title_chars"
  | "title_repeat"
  | "title_caps"
  | "title_promo"
  | "title_brand_start"
  | "title_brand_forbidden"
  | "title_ar"
  | "bullets_count"
  | "bullets_len"
  | "bullets_ar"
  | "desc_len"
  | "desc_ar"
  | "terms_bytes"
  | "terms_clean"
  | "keywords_cov"
  | "keyword_front";

export type CheckField = "title" | "bullets" | "description" | "terms";

export type Check = {
  id: CheckId;
  severity: "error" | "warn";
  field: CheckField;
  pass: boolean;
  /** Language-neutral evidence, e.g. "212/200". */
  detail: string;
};

const STOP = new Set([
  "a", "an", "the", "and", "or", "for", "with", "of", "in", "on", "to", "by", "at", "from", "per",
  "و", "في", "من", "على", "مع", "إلى", "الى", "عن", "أو", "او",
]);

const PROMO = [
  "best seller", "bestseller", "free shipping", "#1", "no.1", "hot deal", "limited offer", "sale",
  "discount", "cheapest", "% off", "guaranteed",
  "الأكثر مبيعا", "الاكثر مبيعا", "شحن مجاني", "خصم", "تخفيض", "عرض خاص", "أرخص", "ارخص",
];

const AR_RE = /[\u0600-\u06FF]/;
const WORD_RE = /[A-Za-z0-9\u0600-\u06FF]+/g;

export const hasArabic = (s: string) => AR_RE.test(s);
export const byteLength = (s: string) => new TextEncoder().encode(s).length;
export const toLines = (s: string) =>
  s.split(/\r?\n/).map((l) => l.replace(/^[\s\-•*·]+/, "").trim()).filter(Boolean);
export const splitKeywords = (s: string) =>
  s.split(/[,،\n]/).map((k) => k.trim()).filter(Boolean);
const words = (s: string) => s.toLowerCase().match(WORD_RE) ?? [];
const filled = (arr: string[]) => arr.map((b) => b.trim()).filter(Boolean);

function mostRepeated(title: string): { word: string; n: number } {
  const count = new Map<string, number>();
  for (const w of words(title)) {
    if (STOP.has(w) || w.length < 2) continue;
    count.set(w, (count.get(w) ?? 0) + 1);
  }
  let best = { word: "", n: 0 };
  for (const [word, n] of count) if (n > best.n) best = { word, n };
  return best;
}

export function checkListing(c: ListingContent, m: Marketplace, brief: { brand: string; keywords: string }): Check[] {
  const r = RULES[m];
  const out: Check[] = [];
  const add = (id: CheckId, severity: Check["severity"], field: CheckField, pass: boolean, detail = "") =>
    out.push({ id, severity, field, pass, detail });

  const tEn = c.titleEn.trim();
  const tAr = c.titleAr.trim();
  const brand = brief.brand.trim();
  const longest = Math.max(tEn.length, tAr.length);

  // ---- Title
  add("title_len", "error", "title", tEn.length >= Math.max(r.titleMin, 1) && longest <= r.titleMax, `${longest}/${r.titleMax}`);
  if (r.titleSoft < r.titleMax) add("title_soft", "warn", "title", longest <= r.titleSoft, `${longest}/${r.titleSoft}`);

  if (r.bannedChars) {
    const titleSansBrand = brand ? (tEn + " " + tAr).split(brand).join("") : tEn + " " + tAr;
    const found = [...new Set([...titleSansBrand].filter((ch) => r.bannedChars.includes(ch)))];
    add("title_chars", "error", "title", found.length === 0, found.join(" "));
  }

  const repEn = mostRepeated(tEn);
  const repAr = mostRepeated(tAr);
  const rep = repEn.n >= repAr.n ? repEn : repAr;
  add("title_repeat", m === "amazon" || m === "noon" ? "error" : "warn", "title", rep.n <= r.maxRepeat, rep.n > r.maxRepeat ? `"${rep.word}" ×${rep.n}` : "");

  const shout = (tEn.match(/\b[A-Z]{5,}\b/g) ?? []).filter((w) => w !== brand.toUpperCase());
  add("title_caps", "error", "title", shout.length === 0, shout.slice(0, 2).join(" "));

  const lower = (tEn + " " + tAr).toLowerCase();
  const promo = PROMO.filter((p) => lower.includes(p));
  add("title_promo", "error", "title", promo.length === 0, promo.slice(0, 2).join(", "));

  if (brand && r.brand === "start") {
    add("title_brand_start", "warn", "title", tEn.toLowerCase().startsWith(brand.toLowerCase()), brand);
  }
  if (brand && r.brand === "forbidden") {
    add("title_brand_forbidden", "error", "title", !lower.includes(brand.toLowerCase()), brand);
  }

  // FLOW delivers every listing bilingual; noon Egypt hides single-language SKUs from the other storefront.
  add("title_ar", "error", "title", tAr.length > 0 && hasArabic(tAr) && !hasArabic(tEn));

  // ---- Bullets
  const bEn = filled(c.bulletsEn);
  const bAr = filled(c.bulletsAr);
  add("bullets_count", "error", "bullets", bEn.length >= 3 && bEn.length <= r.bullets, `${bEn.length}/${r.bullets}`);
  const bad = [...bEn, ...bAr].filter((b) => b.length > r.bulletMax || b.length < r.bulletMin).length;
  add("bullets_len", "error", "bullets", bad === 0, `${r.bulletMin > 0 ? r.bulletMin + "–" : "≤"}${r.bulletMax}`);
  add("bullets_ar", "error", "bullets", bAr.length > 0 && bAr.length === bEn.length && bAr.every(hasArabic), `${bAr.length}/${bEn.length}`);

  // ---- Description
  const dEn = c.descriptionEn.trim();
  const dAr = c.descriptionAr.trim();
  const dLong = Math.max(dEn.length, dAr.length);
  const descOk = dEn.length >= Math.max(r.descMin, 1) && (r.descMax === null || dLong <= r.descMax);
  const range = r.descMax === null ? `${dEn.length} / ≥${Math.max(r.descMin, 1)}` : `${dEn.length} / ${r.descMin || 1}–${r.descMax}`;
  add("desc_len", "error", "description", descOk, range);
  add("desc_ar", "error", "description", dAr.length > 0 && hasArabic(dAr));

  // ---- Hidden search terms (Amazon)
  if (r.terms?.kind === "bytes") {
    const bytes = byteLength(c.searchTerms.trim());
    add("terms_bytes", "error", "terms", bytes <= r.terms.max, `${bytes}/${r.terms.max}`);
    const st = c.searchTerms.toLowerCase();
    const dirty = st.includes(",") || st.includes("،") || (brand.length > 0 && st.includes(brand.toLowerCase()));
    add("terms_clean", "warn", "terms", !dirty);
  }

  // ---- Target keywords
  const kws = splitKeywords(brief.keywords).map((k) => k.toLowerCase());
  if (kws.length > 0) {
    const hay = [tEn, tAr, ...bEn, ...bAr, dEn, dAr, c.searchTerms].join(" ").toLowerCase();
    const hit = kws.filter((k) => hay.includes(k)).length;
    add("keywords_cov", "warn", "terms", hit / kws.length >= 0.6, `${hit}/${kws.length}`);
    const front = tEn.slice(0, 80).toLowerCase();
    const frontAr = tAr.slice(0, 80).toLowerCase();
    add("keyword_front", "warn", "title", kws.some((k) => front.includes(k) || frontAr.includes(k)));
  }

  return out;
}

export function scoreOf(checks: Check[]): number {
  let total = 0;
  let got = 0;
  for (const c of checks) {
    const w = c.severity === "error" ? 3 : 1;
    total += w;
    if (c.pass) got += w;
  }
  return total === 0 ? 0 : Math.round((got / total) * 100);
}

export function scoreListing(c: ListingContent, m: Marketplace, brief: { brand: string; keywords: string }): number {
  return scoreOf(checkListing(c, m, brief));
}

// ---------------------------------------------------------------------------
// Template engine — deterministic fallback when no AI provider is connected.
// It only rearranges facts that are already in the brief: it never writes new
// claims and never translates. Arabic fields are filled only from Arabic input.
// ---------------------------------------------------------------------------

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const stripEnd = (s: string) => s.replace(/[.،,;!؛\s]+$/u, "");
const stripChars = (s: string, banned: string) => (banned ? [...s].filter((ch) => !banned.includes(ch)).join("") : s);

function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return stripEnd(sp > max * 0.6 ? cut.slice(0, sp) : cut);
}

function removeBrand(s: string, brand: string): string {
  if (!brand) return s;
  const i = s.toLowerCase().indexOf(brand.toLowerCase());
  return i < 0 ? s : (s.slice(0, i) + s.slice(i + brand.length)).replace(/\s{2,}/g, " ").trim();
}

function composeTitle(base: string, extras: string[], limit: number, sep: string, maxRepeat: number, maxExtras: number): string {
  let t = base;
  let added = 0;
  for (const e of extras) {
    if (added >= maxExtras) break;
    const piece = stripEnd(e);
    if (!piece || piece.length > 60) continue;
    const next = `${t}${sep}${piece}`;
    if (next.length > limit) continue;
    // Skip a feature that would repeat a word beyond what the marketplace allows.
    if (mostRepeated(next).n > Math.max(maxRepeat, mostRepeated(t).n)) continue;
    t = next;
    added += 1;
  }
  return clip(t, limit);
}

export function buildTemplateListing(p: ProductBrief, m: Marketplace): ListingContent {
  const r = RULES[m];
  const feats = toLines(p.features);
  const featsAr = toLines(p.featuresAr);
  const brand = p.brand.trim();
  const limit = Math.min(r.titleSoft, m === "amazon" ? 150 : r.titleSoft);

  const nameNoBrand = removeBrand(p.name.trim(), brand);
  const nameArNoBrand = removeBrand(p.nameAr.trim(), brand);
  const withBrand = r.brand !== "forbidden" && brand ? `${brand} ${nameNoBrand}` : nameNoBrand;
  const withBrandAr = r.brand !== "forbidden" && brand && nameArNoBrand ? `${nameArNoBrand} من ${brand}` : nameArNoBrand;

  const extraCount = m === "shopify" ? 0 : 2;
  const titleEn = stripChars(composeTitle(withBrand, feats, limit, ", ", r.maxRepeat, extraCount), r.bannedChars);
  const titleAr = withBrandAr
    ? stripChars(composeTitle(withBrandAr, featsAr, limit, "، ", r.maxRepeat, extraCount), r.bannedChars)
    : "";

  const bulletsEn = feats.slice(0, r.bullets).map((f) => clip(cap(stripEnd(f)), r.bulletMax));
  const bulletsAr = featsAr.slice(0, r.bullets).map((f) => clip(stripEnd(f), r.bulletMax));

  const descriptionEn = feats.length
    ? clip(`${withBrand || p.name}. ${feats.map((f) => cap(stripEnd(f))).join(". ")}.`, r.descMax ?? 5000)
    : "";
  const descriptionAr =
    nameArNoBrand && featsAr.length
      ? clip(`${withBrandAr}. ${featsAr.map(stripEnd).join(". ")}.`, r.descMax ?? 5000)
      : "";

  let searchTerms = "";
  const kws = splitKeywords(p.keywords);
  if (r.terms?.kind === "tags") {
    searchTerms = kws.join(", ");
  } else if (r.terms?.kind === "bytes") {
    const used = new Set(words(titleEn));
    const seen = new Set<string>();
    const picked: string[] = [];
    for (const w of kws.flatMap((k) => words(k))) {
      if (used.has(w) || seen.has(w) || STOP.has(w) || w === brand.toLowerCase()) continue;
      const next = [...picked, w].join(" ");
      if (byteLength(next) > r.terms.max) break;
      seen.add(w);
      picked.push(w);
    }
    searchTerms = picked.join(" ");
  }

  return { titleEn, titleAr, bulletsEn, bulletsAr, descriptionEn, descriptionAr, searchTerms };
}
