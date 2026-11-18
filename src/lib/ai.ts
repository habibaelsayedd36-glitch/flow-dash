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
- EVERY English and Arabic bullet MUST contain at least 76 characters (including spaces), and must never exceed the selected marketplace's maximum.
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
    `Bullets: exactly ${r.bullets} per language, each at least 76 and at most ${r.bulletMax} characters, starting with a capital letter in English, no ending punctuation. bulletsAr must have the same count as bulletsEn. Never use filler to reach the minimum.`,
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
  // Strip common Markdown wrappers and isolate the outer JSON object.
  const cleaned = text.trim().replace(/^\x60{3}(?:json)?\s*/i, "").replace(/\s*\x60{3}$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The model did not return a JSON object.");
  const parsed: unknown = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("The model response is not a JSON object.");
  return parsed as Record<string, unknown>;
}

async function callListingJson(p: AiProvider, system: string, prompt: string): Promise<Record<string, unknown>> {
  const first = await callModel(p, system, prompt, true);
  try {
    return parseJson(first);
  } catch {
    // A few Groq model responses can violate JSON mode despite response_format.
    // Ask once for a clean serialization before falling back to templates.
    const repair = `Convert the content below into one syntactically valid JSON object.
Return ONLY JSON: no Markdown fences, no explanation, no comments, no trailing commas.
Use exactly the required keys and value types. Preserve all product facts and wording.
Required shape:
${LISTING_SHAPE}
Invalid response:
${first.slice(0, 10000)}`;
    const second = await callModel(p, system, repair, true);
    return parseJson(second);
  }
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
    const match = value?.match(/([\d.]+)\s*(ms|s|m|h)/i);
    if (match) {
      const amount = Number(match[1]);
      const unit = match[2].toLowerCase();
      const multiplier = unit === "ms" ? 1 : unit === "s" ? 1000 : unit === "m" ? 60_000 : 3_600_000;
      return Math.min(30_000, Math.max(250, amount * multiplier));
    }
  }

  // Some providers put the exact wait time only in the error message.
  const wait = errorMessage.match(/(?:try again|retry) in\s+([\d.]+)\s*(ms|seconds?|s)\b/i);
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
        // GPT-OSS spends completion tokens on hidden reasoning before visible copy.
        // A larger budget plus low reasoning effort prevents empty replies caused by
        // exhausting the 1,800-token cap before the listing JSON is emitted.
        ...(p.id === "groq"
          ? {
              max_completion_tokens: p.model.includes("gpt-oss") ? 4096 : 1800,
              ...(p.model.includes("gpt-oss") ? { reasoning_effort: "low" } : {}),
            }
          : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        // Groq can reject otherwise valid generations during constrained JSON-mode validation.
        // Keep the JSON-only instruction in the prompt and parse/repair the returned text ourselves.
        ...(json && p.id !== "groq" ? { response_format: { type: "json_object" } } : {}),
      },
      p.label,
    )) as { choices?: { finish_reason?: string; message?: { content?: string } }[]; usage?: { completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } } };
    const choice = data.choices?.[0];
    text = choice?.message?.content ?? "";
    // Do not throw on an empty GPT-OSS response here: the shared empty-response
    // handler below must get a chance to retry with the smaller Groq model.
    // Throwing on finish_reason="length" here accidentally bypassed that fallback.
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
  if (!text.trim()) {
    // Groq may occasionally return an empty assistant message from GPT-OSS 120B.
    // Retry once on the smaller supported GPT-OSS model before falling back to templates.
    if (p.id === "groq" && p.model !== "openai/gpt-oss-20b") {
      return callModel({ ...p, model: "openai/gpt-oss-20b" }, system, user, json);
    }
    throw new Error(`${p.label}: empty response from ${p.model}. The automatic Groq fallback model also returned no text.`);
  }
  return text;
}

/** A real round-trip, used by "Test connection" on the Settings page. */
export async function testProvider(p: AiProvider): Promise<string> {
  const text = await callModel(p, "You are a connection test.", "Reply with the single word: OK", false);
  return text.trim().slice(0, 80);
}

function hasShortBullets(content: ListingContent, m: Marketplace): boolean {
  const min = RULES[m].bulletMin;
  return content.bulletsEn.length !== RULES[m].bullets ||
    content.bulletsAr.length !== RULES[m].bullets ||
    [...content.bulletsEn, ...content.bulletsAr].some((bullet) => bullet.trim().length < min);
}

async function repairShortBullets(
  p: AiProvider,
  brief: ProductBrief,
  m: Marketplace,
  content: ListingContent,
  tail: string,
): Promise<ListingContent> {
  if (!hasShortBullets(content, m)) return content;
  const min = RULES[m].bulletMin;
  const max = RULES[m].bulletMax;
  const repairPrompt = `The previous draft failed the mandatory bullet-length check. Rewrite the listing JSON below.
Every one of the exactly 5 English bullets AND exactly 5 Arabic bullets must be at least ${min} characters including spaces and no more than ${max}.
Keep each English/Arabic pair aligned in meaning and order. Expand each point using only facts from the product brief. Explain the practical meaning of the stated feature without inventing specifications, materials, performance, compatibility, or benefits. Do not pad with repeated phrases. If a fact is too short, combine it with a different supplied fact while keeping the five points distinct.
Preserve all other fields where possible. Return only the required JSON object.
Product brief:
${userPrompt(brief, m, "clear", "", tail)}
Previous draft:
${JSON.stringify(content)}
Required JSON shape:
{${LISTING_SHAPE}}`;
  const repaired = toListing(await callListingJson(p, SYSTEM, repairPrompt), m);
  if (hasShortBullets(repaired, m)) {
    const short = [...repaired.bulletsEn, ...repaired.bulletsAr].filter((bullet) => bullet.trim().length < min).length;
    throw new Error(`${p.label}: generated bullets still fail the ${min}-character minimum (${short} short bullets). Add more product facts or retry after the provider limit resets.`);
  }
  return repaired;
}

type ProductResearch = { brief: ProductBrief; sources: string[] };

function decodeResearchHtml(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

/** Researches an exact product name against public web results before copy is generated. */
async function researchProductBrief(provider: AiProvider, brief: ProductBrief): Promise<ProductResearch> {
  const brandHint = brief.brand.trim() || (/dermaelle/i.test(brief.name) ? "Dermaelle" : "");
  const normalizedName = brief.name
    .replace(/\bhyadrate\b/gi, "hydrate")
    .replace(/\bhydrate cream\b/gi, "hydra gel cream");
  const queries = Array.from(new Set([
    [brandHint, brief.name, "official product details ingredients specifications"].filter(Boolean).join(" "),
    [brandHint, normalizedName, "official product"].filter(Boolean).join(" "),
    /dermaelle/i.test(brandHint + " " + brief.name) ? "Dermaelle hydra gel cream moisturizer official" : "",
  ].filter(Boolean)));
  const results: Array<{ url: string; title: string; snippet: string }> = [];
  const seen = new Set<string>();
  let searchWasAvailable = false;
  const addResult = (rawUrl: string, rawTitle: string, rawSnippet = "") => {
    try {
      let href = decodeResearchHtml(rawUrl.trim()).replace(/[),.;]+$/, "");
      if (href.startsWith("//")) href = "https:" + href;
      const parsed = new URL(href);
      if (!["http:", "https:"].includes(parsed.protocol)) return;
      if (/google\.|bing\.com|duckduckgo\.com|youtube\.com|youtu\.be|facebook\.com|instagram\.com|tiktok\.com|pinterest\.|googleusercontent\.com|gstatic\.com|microsoft\.com\/bing/i.test(parsed.hostname)) return;
      if (seen.has(parsed.href)) return;
      const title = decodeResearchHtml(rawTitle.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim();
      if (!title || title.length < 3) return;
      seen.add(parsed.href);
      results.push({ url: parsed.href, title, snippet: decodeResearchHtml(rawSnippet.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).trim() });
    } catch { /* ignore malformed search results */ }
  };

  // Use Jina Reader as a server-side search-page reader first. It converts
  // Google/Bing result pages into clean text and avoids brittle HTML selectors
  // and search-engine bot challenges from Vercel serverless IPs.
  const readerSearchUrls = queries.flatMap((query) => [
    "https://r.jina.ai/http://www.google.com/search?q=" + encodeURIComponent(query),
    "https://r.jina.ai/http://www.bing.com/search?q=" + encodeURIComponent(query),
  ]);
  for (const searchUrl of readerSearchUrls) {
    try {
      const response = await fetch(searchUrl, {
        headers: { accept: "text/plain, text/markdown, */*" },
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
      if (!response.ok) continue;
      searchWasAvailable = true;
      const text = (await response.text()).slice(0, 35_000);
      const markdownLinks = /\[([^\]]{3,240})\]\((https?:\/\/[^)\s]+)\)/g;
      for (const match of text.matchAll(markdownLinks)) {
        addResult(match[2], match[1], "");
      }
      // Reader may return plain URLs instead of Markdown links for some pages.
      if (!results.length) {
        for (const match of text.matchAll(/https?:\/\/[^\s<>"]+/g)) {
          addResult(match[0], text.slice(Math.max(0, match.index! - 160), match.index!).split("\n").filter(Boolean).slice(-1)[0] || "Product source", "");
        }
      }
      if (results.length >= 5) break;
    } catch { /* try the next search route */ }
  }

  // Keep direct RSS/HTML providers as secondary fallbacks, but never depend
  // on their markup being identical across search-engine experiments.
  if (results.length < 3) {
    for (const query of queries) {
      const searchUrls = [
        "https://www.bing.com/search?format=rss&q=" + encodeURIComponent(query),
        "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query),
      ];
      for (const searchUrl of searchUrls) {
        try {
          const response = await fetch(searchUrl, {
            headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36", accept: "application/rss+xml, application/xml, text/html;q=0.9, */*;q=0.8" },
            signal: AbortSignal.timeout(12_000), cache: "no-store",
          });
          if (!response.ok) continue;
          searchWasAvailable = true;
          const searchText = await response.text();
          if (/format=rss/i.test(searchUrl)) {
            const items = searchText.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
            for (const item of items) {
              const getTag = (tag: string) => item.match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">", "i"))?.[1] ?? "";
              const rawUrl = getTag("link").replace(/<!\[CDATA\[|\]\]>/g, "").trim();
              const title = getTag("title").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").trim();
              const snippet = getTag("description").replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").trim();
              addResult(rawUrl, title, snippet);
            }
          } else {
            const blocks = searchText.split(/class=["']result(?:\s|")/i).slice(1, 9);
            for (const block of blocks) {
              const anchor = block.match(/<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
              if (!anchor) continue;
              addResult(anchor[1], anchor[2], "");
            }
          }
          if (results.length >= 5) break;
        } catch { /* try the next public search provider */ }
      }
      if (results.length >= 5) break;
    }
  }
  // Prefer the manufacturer's focused Hyalubalance collection for Dermaelle
  // hydration/cream searches. The full 46-item catalogue is too long: its first
  // page excerpt can omit Oil-Free Hydra-Gel, even though it is the exact match.
  if (/dermaelle/i.test(brandHint + " " + brief.name)) {
    const hydrationQuery = /\b(hydra|hydrate|hydration|moistur|cream|gel)\b/i.test(brief.name);
    if (hydrationQuery) {
      addResult(
        "https://e-dermaelle.com/products/dermaelle-hyalubalance-oil-free-hydra-gel-60-ml",
        "Dermaelle official Oil-Free Hydra-Gel 60ml product page",
      );
      addResult("https://e-dermaelle.com/collections/hyalu-balance", "Dermaelle official Hyalubalance collection");
      // Put the exact manufacturer's product page first so its facts survive
      // the three-source limit and are not crowded out by unrelated results.
      const exactIndex = results.findIndex((item) => item.url.includes("/products/dermaelle-hyalubalance-oil-free-hydra-gel-60-ml"));
      if (exactIndex > 0) results.unshift(results.splice(exactIndex, 1)[0]);
    }
    addResult("https://e-dermaelle.com/collections/all", "Dermaelle official product catalogue");
  }
  if (!results.length && !searchWasAvailable) throw new Error("FLOW could not reach its public product research service. Please retry in a moment.");
  if (!results.length) throw new Error("FLOW could not find public product sources for this exact name. Add a brand or model number and retry.");

  // Read source pages as clean Markdown through Reader. This avoids fragile
  // per-site HTML parsing and keeps product facts grounded in the page content.
  const pages = await Promise.all(results.slice(0, 3).map(async (result) => {
    try {
      const response = await fetch("https://r.jina.ai/" + result.url, {
        headers: { accept: "text/plain, text/markdown, */*" },
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      });
      if (!response.ok) return { ...result, page: "" };
      const page = (await response.text()).slice(0, 6500);
      return { ...result, page };
    } catch {
      return { ...result, page: "" };
    }
  }));
  const sourceText = pages.map((item, i) =>
    "[Source " + (i + 1) + "] " + item.url + "\nSearch title: " + item.title + "\nSearch snippet: " + item.snippet + "\nPage text: " + (item.page || "(page could not be opened)")
  ).join("\n\n").slice(0, 22_000);
  const raw = await generateText(
    provider,
    "You are a strict product-fact researcher for e-commerce. Use only explicit facts present in the supplied public source excerpts. Prefer the manufacturer's official product page; use reputable retailers only when the exact product/model matches. Ignore unrelated products, sponsored claims that do not match the exact product, user reviews, and assumptions. Never infer ingredients, materials, sizes, certifications, medical benefits, compatibility, warranty, origin, or performance. Return JSON only.",
    "Research this exact product and extract facts that are explicitly supported by the sources.\nProduct name: " + brief.name +
    "\nBrand supplied: " + (brief.brand || "(unknown)") + "\nCategory supplied: " + (brief.category || "(unknown)") +
    "\n\nSources:\n" + sourceText +
    '\n\nReturn exactly this JSON:\n{"brand":"","category":"","featuresEn":[""],"featuresAr":[""],"keywords":[""]}\n' +
    "Provide 3-8 concise facts only when directly supported by the sources. English and Arabic feature lists must describe the same facts in the same order. If no reliable matching facts exist, return empty feature arrays. Keywords may use the exact product name, confirmed brand, category and source wording only. Do not write sales copy or make claims beyond the source text."
  );
  const parsed = parseJson(raw);
  const asLines = (value: unknown) => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 8).join("\n")
    : "";
  const features = brief.features.trim() || asLines(parsed.featuresEn);
  const featuresAr = brief.featuresAr.trim() || asLines(parsed.featuresAr);
  if (!features && !featuresAr) throw new Error("FLOW found no reliable product facts in the available sources, so it stopped rather than inventing features.");
  const keywords = brief.keywords.trim() || (Array.isArray(parsed.keywords)
    ? parsed.keywords.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 15).join(", ")
    : "");
  const researched: ProductBrief = {
    ...brief, brand: brief.brand.trim() || str(parsed.brand), category: brief.category.trim() || str(parsed.category),
    features, featuresAr, keywords,
  };
  return { brief: researched, sources: pages.filter((item) => item.page || item.snippet).map((item) => item.url).slice(0, 5) };
}

export async function generateWithAi(p: AiProvider, brief: ProductBrief, m: Marketplace, tone: string, notes: string): Promise<ListingContent> {
  let researchedBrief = brief;
  let researchNotes = notes;
  if (!brief.features.trim() && !brief.featuresAr.trim()) {
    const research = await researchProductBrief(p, brief);
    researchedBrief = research.brief;
    researchNotes = [notes, "Product research sources (use only the confirmed facts already extracted above):\n" + research.sources.join("\n")].filter(Boolean).join("\n\n");
  }
  if (!researchedBrief.features.trim() && !researchedBrief.featuresAr.trim()) {
    throw new Error("No confirmed product facts were found. FLOW will not invent ingredients, benefits, specifications, or certifications.");
  }
  const tail = `Return exactly this JSON shape:\n{${LISTING_SHAPE}}`;
  const generated = toListing(await callListingJson(p, SYSTEM, userPrompt(researchedBrief, m, tone, researchNotes, tail)), m);
  return repairShortBullets(p, researchedBrief, m, generated, tail);
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
  // Spreadsheet jobs used to bypass public product research entirely. When a
  // row contains only a product name, research it through the same verified
  // source pipeline as single-product generation before asking the model to write.
  let researchedBrief = brief;
  if (!brief.features.trim() && !brief.featuresAr.trim()) {
    const research = await researchProductBrief(p, brief);
    researchedBrief = research.brief;
  }
  if (!researchedBrief.features.trim() && !researchedBrief.featuresAr.trim()) {
    throw new Error("No reliable product facts were found in public sources. Add a brand or model number and retry.");
  }
  const raw = await callListingJson(p, SYSTEM, userPrompt(researchedBrief, m, tone, "", tail));
  const initialContent = toListing(raw, m);
  const content = await repairShortBullets(p, researchedBrief, m, initialContent, tail);
  const rawSpecs = (raw.specs && typeof raw.specs === "object" ? raw.specs : {}) as Record<string, unknown>;
  const specs: Partial<Record<SpecKey, string>> = {};
  for (const k of missing) {
    const v = str(rawSpecs[k]).slice(0, 80);
    if (v) specs[k] = v;
  }
  return { content, specs };
}

/** Short free-form text from the connected model (review replies and other drafts). */
export async function generateText(p: AiProvider, system: string, user: string): Promise<string> {
  return (await callModel(p, system, user, false)).trim();
}
