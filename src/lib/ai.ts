import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { MARKETPLACE_META, type Marketplace } from "./catalog";
import { RULES, type ListingContent, type ProductBrief } from "./rules";

/**
 * Real LLM integration (server only). The key comes from the environment
 * (ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY) or, failing that, from
 * the key saved on the Settings page. With no key, getAiProvider() returns null
 * and callers fall back to the template engine — nothing here fabricates output.
 */

export type ProviderId = "anthropic" | "openai" | "gemini";
export type AiProvider = { id: ProviderId; label: string; model: string; key: string; source: "env" | "settings" };

export const PROVIDERS: Record<ProviderId, { label: string; defaultModel: string }> = {
  anthropic: { label: "Anthropic Claude", defaultModel: "claude-sonnet-5-5" },
  openai: { label: "OpenAI", defaultModel: "gpt-5-mini" },
  gemini: { label: "Google Gemini", defaultModel: "gemini-3.8-flash" },
};
export const isProviderId = (v: unknown): v is ProviderId => typeof v === "string" && v in PROVIDERS;

export async function getAiProvider(): Promise<AiProvider | null> {
  const override = process.env.AI_MODEL?.trim();
  const env: [ProviderId, string | undefined][] = [
    ["anthropic", process.env.ANTHROPIC_API_KEY],
    ["openai", process.env.OPENAI_API_KEY],
    ["gemini", process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY],
  ];
  for (const [id, key] of env) {
    if (key) return { id, label: PROVIDERS[id].label, model: override || PROVIDERS[id].defaultModel, key, source: "env" };
  }
  try {
    const rows = await db.select().from(settings).where(inArray(settings.key, ["ai_provider", "ai_key", "ai_model"]));
    const get = (k: string) => rows.find((r) => r.key === k)?.value.trim() ?? "";
    const id = get("ai_provider");
    const key = get("ai_key");
    if (isProviderId(id) && key) {
      return { id, label: PROVIDERS[id].label, model: get("ai_model") || PROVIDERS[id].defaultModel, key, source: "settings" };
    }
  } catch {
    // settings table not ready yet
  }
  return null;
}

/** "sk-…a1b2" — the full key is never sent to the browser. */
export const maskKey = (key: string) => (key.length <= 8 ? "••••" : `${key.slice(0, 3)}…${key.slice(-4)}`);

const SYSTEM = `You are a senior bilingual e-commerce copywriter at FLOW Agency in Cairo. You write marketplace listings in English and Arabic for sellers in Egypt and the Gulf.

Hard rules:
- Use ONLY facts found in the product brief. Never invent specifications, materials, sizes, certifications, warranties, awards or claims. If the brief is thin, write less.
- Arabic must be natural Modern Standard Arabic as shoppers read it on Egyptian marketplaces: written fresh for the reader, not a literal translation. Keep the brand name in its original script.
- No promotional claims (best seller, free shipping, discount, #1), no ALL-CAPS words, no emojis.
- Respect every length limit given. Count characters before answering.
- Respond with one JSON object and nothing else.`;

const TONES: Record<string, string> = {
  clear: "Clear and factual. Short sentences, concrete benefits.",
  premium: "Premium and confident. Refined vocabulary, still factual.",
  friendly: "Warm and friendly, like a helpful shop assistant. Still factual.",
};

function rulesText(m: Marketplace): string {
  const r = RULES[m];
  const brand =
    r.brand === "start"
      ? "The English title must start with the brand name."
      : r.brand === "forbidden"
        ? "The title must NOT contain the brand name (the marketplace adds it from the brand field)."
        : "The brand name may appear once in the title.";
  const terms =
    r.terms?.kind === "bytes"
      ? `searchTerms: hidden keywords, at most ${r.terms.max} BYTES (Arabic letters cost 2 bytes each). Lowercase, space separated, no commas, no brand name, no word that is already in the title.`
      : r.terms?.kind === "tags"
        ? "searchTerms: 8 to 12 comma-separated product tags."
        : "searchTerms: empty string (this marketplace has no hidden keyword field, so put the target keywords in the visible copy).";
  return [
    `Title: ${Math.max(r.titleMin, 1)} to ${r.titleMax} characters per language${r.titleSoft < r.titleMax ? `, aim for ${r.titleSoft} or fewer` : ""}. Put the main keyword within the first 80 characters. Title case in English.`,
    brand,
    r.bannedChars ? `Never use these characters in a title: ${[...r.bannedChars].join(" ")}` : "",
    `No word may appear more than ${r.maxRepeat} time(s) in a title (articles and prepositions excluded).`,
    `Bullets: exactly ${r.bullets} per language, each ${r.bulletMin > 0 ? `${r.bulletMin} to ` : "at most "}${r.bulletMax} characters, starting with a capital letter in English, no ending punctuation. bulletsAr must have the same count as bulletsEn.`,
    `Description: ${r.descMin > 0 ? `at least ${r.descMin}` : "any length"}${r.descMax ? `, at most ${r.descMax}` : ""} characters per language, plain text.`,
    terms,
  ]
    .filter(Boolean)
    .join("\n");
}

const LISTING_SHAPE =
  '"titleEn":"","titleAr":"","bulletsEn":["","","","",""],"bulletsAr":["","","","",""],"descriptionEn":"","descriptionAr":"","searchTerms":""';

function userPrompt(p: ProductBrief, m: Marketplace, tone: string, notes: string, tail: string): string {
  return `Marketplace: ${MARKETPLACE_META[m].label}

Rules for this marketplace:
${rulesText(m)}

Tone: ${TONES[tone] ?? TONES.clear}

Product brief:
- Brand: ${p.brand || "(none)"}
- Product name (English): ${p.name}
- Product name (Arabic): ${p.nameAr || "(not provided — write it)"}
- Category: ${p.category}
- Key features (English):
${p.features || "(none provided)"}
- Key features (Arabic):
${p.featuresAr || "(not provided — write them from the English facts)"}
- Target keywords: ${p.keywords || "(none provided)"}
${notes ? `\nExtra instructions from the account manager: ${notes}\n` : ""}
${tail}`;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const list = (v: unknown, max: number) => (Array.isArray(v) ? v.map(str).filter(Boolean).slice(0, max) : []);

function parseJson(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not return JSON.");
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}

function toListing(raw: Record<string, unknown>, m: Marketplace): ListingContent {
  const out: ListingContent = {
    titleEn: str(raw.titleEn),
    titleAr: str(raw.titleAr),
    bulletsEn: list(raw.bulletsEn, RULES[m].bullets),
    bulletsAr: list(raw.bulletsAr, RULES[m].bullets),
    descriptionEn: str(raw.descriptionEn),
    descriptionAr: str(raw.descriptionAr),
    searchTerms: str(raw.searchTerms),
  };
  if (!out.titleEn) throw new Error("The model returned an empty title.");
  return out;
}

async function post(url: string, headers: Record<string, string>, body: unknown, who: string): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
    cache: "no-store",
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (data as { error?: { message?: string } } | null)?.error?.message;
    throw new Error(`${who} (${res.status}): ${err || res.statusText || "request failed"}`);
  }
  return data;
}

/** One request to whichever provider is connected. Returns the raw text of the reply. */
async function callModel(p: AiProvider, system: string, user: string, json: boolean): Promise<string> {
  let text = "";
  if (p.id === "anthropic") {
    const data = (await post(
      "https://api.anthropic.com/v1/messages",
      { "x-api-key": p.key, "anthropic-version": "2023-06-01" },
      { model: p.model, max_tokens: 4096, system, messages: [{ role: "user", content: user }] },
      p.label,
    )) as { content?: { type: string; text?: string }[] };
    text = (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  } else if (p.id === "openai") {
    const data = (await post(
      "https://api.openai.com/v1/chat/completions",
      { authorization: `Bearer ${p.key}` },
      {
        model: p.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(json ? { response_format: { type: "json_object" } } : {}),
      },
      p.label,
    )) as { choices?: { message?: { content?: string } }[] };
    text = data.choices?.[0]?.message?.content ?? "";
  } else {
    const data = (await post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.model)}:generateContent`,
      { "x-goog-api-key": p.key },
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        ...(json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
      },
      p.label,
    )) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    text = (data.candidates?.[0]?.content?.parts ?? []).map((x) => x.text ?? "").join("");
  }
  if (!text.trim()) throw new Error(`${p.label}: empty response.`);
  return text;
}

/** A real round-trip, used by "Test connection" on the Settings page. */
export async function testProvider(p: AiProvider): Promise<string> {
  const text = await callModel(p, "You are a connection test.", "Reply with the single word: OK", false);
  return text.trim().slice(0, 80);
}

export async function generateWithAi(p: AiProvider, brief: ProductBrief, m: Marketplace, tone: string, notes: string): Promise<ListingContent> {
  const text = await callModel(p, SYSTEM, userPrompt(brief, m, tone, notes, `Return exactly this JSON shape:\n{${LISTING_SHAPE}}`), true);
  return toListing(parseJson(text), m);
}

/** Spec fields a listing job tries to fill. Values that are not in the sheet are estimates. */
export const SPEC_KEYS = ["color", "size", "material", "weight", "dimensions", "origin"] as const;
export type SpecKey = (typeof SPEC_KEYS)[number];

/**
 * Listing + spec estimates for one row of a receiving sheet. Only the specs
 * listed in `missing` are requested; whatever comes back for them is treated
 * as an estimate by the caller and flagged for a person to verify.
 */
export async function generateJobItem(
  p: AiProvider,
  brief: ProductBrief,
  m: Marketplace,
  tone: string,
  known: Partial<Record<SpecKey, string>>,
  missing: SpecKey[],
): Promise<{ content: ListingContent; specs: Partial<Record<SpecKey, string>> }> {
  const knownText = Object.entries(known)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  const tail = `Confirmed specifications from the receiving sheet (facts — you may use them in the copy):
${knownText || "(none)"}

Also return a "specs" object with your best estimate for: ${missing.join(", ") || "(nothing)"}.
- Estimate only when the product name or features make the value reasonably clear; otherwise return an empty string.
- Give weight with a unit (e.g. "350 g") and dimensions as L x W x H with a unit.
- These estimates are flagged for a person to verify. NEVER use an estimated value in a title, bullet or description.

Return exactly this JSON shape:
{${LISTING_SHAPE},"specs":{${missing.map((k) => `"${k}":""`).join(",")}}}`;
  const raw = parseJson(await callModel(p, SYSTEM, userPrompt(brief, m, tone, "", tail), true));
  const rawSpecs = (raw.specs && typeof raw.specs === "object" ? raw.specs : {}) as Record<string, unknown>;
  const specs: Partial<Record<SpecKey, string>> = {};
  for (const k of missing) {
    const v = str(rawSpecs[k]).slice(0, 80);
    if (v) specs[k] = v;
  }
  return { content: toListing(raw, m), specs };
}

/** Short free-form text from the connected model (review replies and other drafts). */
export async function generateText(p: AiProvider, system: string, user: string): Promise<string> {
  return (await callModel(p, system, user, false)).trim();
}
