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

export type ProviderId = "anthropic" | "openai" | "gemini" | "groq";
export type AiProvider = { id: ProviderId; label: string; model: string; key: string; source: "env" | "settings" };

export const PROVIDERS: Record<ProviderId, { label: string; defaultModel: string }> = {
  anthropic: { label: "Anthropic Claude", defaultModel: "claude-sonnet-5-5" },
  openai: { label: "OpenAI", defaultModel: "gpt-5-mini" },
  gemini: { label: "Google Gemini", defaultModel: "gemini-3.8-flash" },
  groq: { label: "Groq (Free)", defaultModel: "openai/gpt-oss-120b" },
};
export const isProviderId = (v: unknown): v is ProviderId => typeof v === "string" && v in PROVIDERS;

export async function getAiProvider(): Promise<AiProvider | null> {
  const override = process.env.AI_MODEL?.trim();
  const env: [ProviderId, string | undefined][] = [
    ["anthropic", process.env.ANTHROPIC_API_KEY],
    ["openai", process.env.OPENAI_API_KEY],
    ["gemini", process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY],
    ["groq", process.env.GROQ_API_KEY],
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

const SYSTEM = `You are FLOW Agency's senior marketplace SEO strategist and conversion copywriter. You create high-performing bilingual listings for Amazon, Noon and other e-commerce marketplaces in Egypt and the Gulf, across beauty, personal care, home, kitchen, electronics, fashion, toys, sports and every other product category.

Your goal is to help the right shopper find the exact product, understand its real value quickly, and feel confident buying it. Write specific, useful product copy — never generic filler.

PRODUCT ANALYSIS:
- Read the complete brief, including product names in both languages, brand, category, every feature, every confirmed specification and target keyword.
- Identify the product type, intended use, strongest differentiators, and the most useful customer benefits that logically follow from the supplied facts.
- Adapt vocabulary and selling angles to the actual category. Beauty copy should not sound like electronics copy; home products should not sound like fashion copy.
- Treat every supplied specification as a confirmed fact. Do not omit useful supplied details merely to make the copy shorter.
- Do not claim to have analyzed an image unless image content is actually included in the brief.

TITLE:
- Write a precise, descriptive, search-friendly title, not a short generic label.
- Prioritize exact product identity, brand where marketplace rules allow, primary search phrase, and the most useful confirmed attributes (such as model, size, quantity, color, material or compatibility).
- Use natural keyword placement near the beginning. Avoid repetition and keyword stuffing.
- Use the available character budget intelligently; aim for a complete shopper-readable title rather than stopping after the product name.

BULLETS:
- Return exactly 5 distinct bullets in each language.
- EVERY English and Arabic bullet MUST contain at least 75 characters (including spaces), and must never exceed the selected marketplace's maximum.
- Aim for 100–180 meaningful characters when the available product facts support it; never add filler just to reach 75 characters.
- Each bullet must communicate one meaningful feature AND its practical customer benefit. Use different purchase considerations across the five bullets; do not repeat the same idea.
- Prioritize: core function/use, important confirmed specification, convenience or design, compatibility/fit/use context, and another genuine differentiator — only where supported by the brief.
- Write complete, informative sentences or phrases. Avoid empty claims such as "High Quality", "Perfect Choice", "Great Design", "Easy to Use" unless the brief explains what makes them true.
- Use as much of the allowed bullet length as the available facts justify. Do not pad with repetition.

DESCRIPTION:
- Write a substantial, well-structured description in both languages, not a one-line summary.
- Where facts allow, use 3–5 coherent paragraphs: introduce the exact product and its purpose; explain its key features and benefits; describe relevant use situations; and summarize the practical value.
- Incorporate useful confirmed specifications and relevant search phrases naturally.
- Add helpful context and explain benefits, but do not create new product facts, usage instructions, safety statements or performance promises.
- Do not copy the bullets verbatim. Avoid generic openings and repetitive conclusions.
- Respect marketplace limits. If the brief genuinely contains very little information, stay accurate rather than inventing content.

ARABIC AND ENGLISH:
- English must read like polished native e-commerce copy, not a string of keywords.
- Arabic must be natural, professional Modern Standard Arabic suitable for Egyptian and Gulf shoppers. Write it independently for Arabic readers, not as a literal translation.
- Keep the meaning and order of the five Arabic bullets aligned with the English bullets.
- Preserve brand names and model numbers accurately.

SEARCH TERMS:
- Prioritize relevant buyer-intent phrases, synonyms, alternate names and specific product attributes.
- Do not waste space repeating title words, brand names, irrelevant traffic terms or competitors.
- Follow the marketplace's exact byte, character and formatting limits.

FACTUAL AND POLICY SAFETY:
- Use ONLY information supported by the brief. Never invent materials, dimensions, ingredients, certifications, warranty, compatibility, country of origin, medical effects, safety claims, performance results or included accessories.
- Do not call a product original, waterproof, hypoallergenic, clinically tested, durable, safe or certified unless explicitly confirmed.
- Never use estimated specifications as confirmed listing facts.
- No fake urgency, discounts, free-shipping claims, rankings, superlatives, ALL-CAPS or emojis.
- If information is missing, omit that claim. Do not disguise guesses as benefits.

FINAL VALIDATION:
- Check every marketplace character limit, title restriction and required field.
- Ensure the title is specific and keyword-relevant.
- Ensure all five bullets are distinct, informative and benefit-led.
- Ensure both descriptions are detailed, readable and not repetitive.
- Ensure Arabic is fluent and faithfully aligned with English.
- Ensure every factual statement can be traced to the supplied brief.
- Return exactly one valid JSON object in the requested schema, with no markdown or commentary.`;

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
    `Bullets: exactly ${r.bullets} per language, each at least 75 and at most ${r.bulletMax} characters, starting with a capital letter in English, no ending punctuation. bulletsAr must have the same count as bulletsEn. Never use filler to reach the minimum.`,
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

function retryDelayMs(res: Response, data: unknown, attempt: number): number {
  const errorMessage = (data as { error?: { message?: string } } | null)?.error?.message ?? "";
  const retryAfter = res.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(30_000, Math.max(250, seconds * 1000));
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay) && dateDelay > 0) return Math.min(30_000, dateDelay);
  }

  // Groq exposes reset windows such as "6s" in rate-limit response headers.
  for (const header of ["x-ratelimit-reset-tokens", "x-ratelimit-reset-requests"]) {
    const value = res.headers.get(header);
    const match = value?.match(/([\\d.]+)\\s*(ms|s|m|h)/i);
    if (match) {
      const amount = Number(match[1]);
      const unit = match[2].toLowerCase();
      const multiplier = unit === "ms" ? 1 : unit === "s" ? 1000 : unit === "m" ? 60_000 : 3_600_000;
      return Math.min(30_000, Math.max(250, amount * multiplier));
    }
  }

  // Some providers put the exact wait time only in the error message.
  const wait = errorMessage.match(/(?:try again|retry) in\\s+([\\d.]+)\\s*(ms|seconds?|s)\\b/i);
  if (wait) {
    const multiplier = wait[2].toLowerCase().startsWith("ms") ? 1 : 1000;
    return Math.min(30_000, Math.max(250, Number(wait[1]) * multiplier));
  }
  return Math.min(8_000, 1_000 * 2 ** attempt);
}

async function post(url: string, headers: Record<string, string>, body: unknown, who: string): Promise<unknown> {
  const retryable = new Set([429, 500, 502, 503, 504]);
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
        cache: "no-store",
      });
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(8_000, 1_000 * 2 ** attempt)));
        continue;
      }
      throw error;
    }

    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const err = (data as { error?: { message?: string } } | null)?.error?.message;
      const message = `${who} (${res.status}): ${err || res.statusText || "request failed"}`;
      if (retryable.has(res.status) && attempt < 2) {
        // Respect provider reset guidance (especially Groq's TPM window) instead
        // of retrying too early and falling straight back to the template engine.
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(res, data, attempt)));
        continue;
      }
      throw new Error(message);
    }
    return data;
  }
  throw lastError instanceof Error ? lastError : new Error(`${who}: request failed after automatic retries.`);
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
  } else if (p.id === "openai" || p.id === "groq") {
    const endpoint = p.id === "groq" ? "https://api.groq.com/openai/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
    const data = (await post(
      endpoint,
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
    const requestGemini = (model: string) => post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { "x-goog-api-key": p.key },
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        ...(json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
      },
      p.label,
    );
    let data: { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    try {
      data = (await requestGemini(p.model)) as typeof data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // If Google's selected model is overloaded, switch once to a stable Flash fallback.
      if (!message.includes("(503):") || p.model === "gemini-2.5-flash") throw error;
      data = (await requestGemini("gemini-2.5-flash")) as typeof data;
    }
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
