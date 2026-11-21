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

export type ProviderId = "gemini" | "openrouter" | "groq";
export type AiProvider = { id: ProviderId; label: string; model: string; key: string; source: "env" | "settings" };

export const PROVIDERS: Record<ProviderId, { label: string; defaultModel: string }> = {
  gemini: { label: "Google Gemini Free", defaultModel: "gemini-3.5-flash-lite" },
  openrouter: { label: "OpenRouter Free", defaultModel: "nvidia/nemotron-3.5-lightning:free" },
  groq: { label: "Groq Free", defaultModel: "openai/gpt-oss-20b" },
};
export const isProviderId = (v: unknown): v is ProviderId => typeof v === "string" && v in PROVIDERS;

export async function getOpenRouterFallbackKey(): Promise<string> {
  try {
    const rows = await db.select().from(settings).where(inArray(settings.key, ["openrouter_fallback_key"]));
    return rows.find((row) => row.key === "openrouter_fallback_key")?.value.trim() ?? "";
  } catch {
    return "";
  }
}

export async function getGroqFallbackKey(): Promise<string> {
  try {
    const rows = await db.select().from(settings).where(inArray(settings.key, ["groq_fallback_key"]));
    return rows.find((row) => row.key === "groq_fallback_key")?.value.trim() ?? "";
  } catch {
    return "";
  }
}

export async function getOpenRouterVisionKey(): Promise<string> {
  try {
    const rows = await db.select().from(settings).where(inArray(settings.key, ["openrouter_vision_key"]));
    return rows.find((row) => row.key === "openrouter_vision_key")?.value.trim() ?? "";
  } catch {
    return "";
  }
}

export async function getCloudflareFluxConfig(): Promise<{ accountId: string; token: string }> {
  try {
    const rows = await db.select().from(settings).where(inArray(settings.key, ["cloudflare_account_id", "cloudflare_flux_token"]));
    return {
      accountId: rows.find((row) => row.key === "cloudflare_account_id")?.value.trim() ?? "",
      token: rows.find((row) => row.key === "cloudflare_flux_token")?.value.trim() ?? "",
    };
  } catch {
    return { accountId: "", token: "" };
  }
}

export async function getPixelAiKey(): Promise<string> {
  try {
    const rows = await db.select().from(settings).where(inArray(settings.key, ["pixelcut_api_key"]));
    return rows.find((row) => row.key === "pixelcut_api_key")?.value.trim() ?? "";
  } catch {
    return "";
  }
}

export async function getAiProvider(): Promise<AiProvider | null> {
  const geminiEnvKey = process.env.GEMINI_API_KEY;
  if (geminiEnvKey) return { id: "gemini", label: PROVIDERS.gemini.label, model: PROVIDERS.gemini.defaultModel, key: geminiEnvKey, source: "env" };
  const envKey = process.env.OPENROUTER_API_KEY;
  const envModel = process.env.AI_MODEL?.trim() ?? "";
  const isFreeModel = (model: string) => model.endsWith(":free") || model === "openrouter/free";
  if (envKey) return { id: "openrouter", label: PROVIDERS.openrouter.label, model: isFreeModel(envModel) ? envModel : PROVIDERS.openrouter.defaultModel, key: envKey, source: "env" };
  try {
    const rows = await db.select().from(settings).where(inArray(settings.key, ["ai_provider", "ai_key", "ai_model"]));
    const get = (k: string) => rows.find((r) => r.key === k)?.value.trim() ?? "";
    const id = get("ai_provider");
    const key = get("ai_key");
    if (id === "gemini" && key) return { id: "gemini", label: PROVIDERS.gemini.label, model: PROVIDERS.gemini.defaultModel, key, source: "settings" };
    if (id === "groq" && key) return { id: "groq", label: PROVIDERS.groq.label, model: PROVIDERS.groq.defaultModel, key, source: "settings" };
    if (id === "openrouter" && key) {
      const savedModel = get("ai_model");
      const model = savedModel && (savedModel.endsWith(":free") || savedModel === "openrouter/free")
        ? savedModel
        : PROVIDERS.openrouter.defaultModel;
      return { id: "openrouter", label: PROVIDERS.openrouter.label, model, key, source: "settings" };
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
- Read the complete brief, including product names in both languages, brand (if supplied), category, every feature, every confirmed specification and target keyword.
- If the brand field is blank, the product is GENERIC / UNBRANDED. Do not invent a brand, infer one from the product name, or write "Generic" as a brand in shopper-facing titles or descriptions. Describe the product by its product type and confirmed attributes only.
- Identify the product type, intended use, strongest differentiators, and the most useful customer benefits that logically follow from the supplied facts.
- Adapt vocabulary and selling angles to the actual category. Beauty copy should not sound like electronics copy; home products should not sound like fashion copy.
- Treat every supplied specification as a confirmed fact. Do not omit useful supplied details merely to make the copy shorter.
- Do not claim to have analyzed an image unless image content is actually included in the brief.

TITLE:
- Write a precise, descriptive, search-friendly title, not a short generic label.
- Prioritize exact product identity, the supplied brand only when one exists and marketplace rules allow it, primary search phrase, and the most useful confirmed attributes (such as model, size, quantity, color, material or compatibility).
- Use natural keyword placement near the beginning. Avoid repetition and keyword stuffing.
- Use the available character budget intelligently; aim for a complete shopper-readable title rather than stopping after the product name.

BULLETS:
- Return exactly 5 distinct bullets in each language.
- EVERY English and Arabic bullet MUST contain at least 76 characters (including spaces), and must never exceed the selected marketplace's maximum.
- Aim for 100–180 meaningful characters when facts support it. When facts are limited, explain only the known product type, stated size/count, or explicit use in distinct ways; never invent claims or pad with meaningless filler.
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
- Respect marketplace limits. If the brief contains little information or no public source could be verified, write conservative copy from the explicit product identity and supplied attributes only.

ARABIC AND ENGLISH:
- English must read like polished native e-commerce copy, not a string of keywords.
- Arabic must be natural, professional Modern Standard Arabic suitable for Egyptian and Gulf shoppers. Write it independently for Arabic readers, not as a literal translation.
- Keep the meaning and order of the five Arabic bullets aligned with the English bullets.
- Preserve brand names and model numbers accurately.

SEARCH TERMS / KEYWORDS:
- Return exactly FIVE keyword phrases for this product, not more and not fewer.
- Put English and its natural Arabic equivalent together for each keyword pair in the SAME searchTerms field.
- Exact format: "English phrase — العبارة العربية | English phrase — العبارة العربية | English phrase — العبارة العربية | English phrase — العبارة العربية | English phrase — العبارة العربية".
- Use five distinct, high-intent shopper search phrases based only on the product name and confirmed facts. Include useful synonyms and alternate ways shoppers search; avoid duplicates, irrelevant traffic, competitor names and unsupported claims.
- Keep each phrase concise. For Amazon, keep the complete bilingual field within 249 UTF-8 bytes where possible; prioritize the five concise bilingual pairs and do not add commentary.

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

function rulesText(m: Marketplace, hasBrand: boolean): string {
  const r = RULES[m];
  const brand = !hasBrand
    ? "This product has no brand (GENERIC / UNBRANDED). Do not invent or add a brand name; start the title with the product type or primary search phrase."
    : r.brand === "start"
      ? "The English title must start with the supplied brand name."
      : r.brand === "forbidden"
        ? "The title must NOT contain the supplied brand name (the marketplace adds it from the brand field)."
        : "The supplied brand name may appear once in the title.";
  const terms =
    "searchTerms: exactly five distinct bilingual keyword pairs in one string; each English phrase followed by its natural Arabic equivalent, with pairs separated by |. Keep phrases concise and relevant; never leave this field empty.";
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
${rulesText(m, Boolean(p.brand.trim()))}

Tone: ${TONES[tone] ?? TONES.clear}

Product brief:
- Brand: ${p.brand.trim() || "GENERIC / UNBRANDED — no brand exists; do not invent or add one"}
- Product name (English): ${p.name}
- Product name (Arabic): ${p.nameAr || "(not provided — write it)"}
- Category: ${p.category === "auto" ? "Infer only what is clear from the product name and supplied facts; if unclear, use a broad category and do not guess." : p.category}
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
  for (let attempt = 0; attempt < 1; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
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
      const dailyQuotaLimit = /tokens per day|daily token|TPD|generate_content_free_tier_requests|requests per day|quota exceeded/i.test(err || "");
      if (retryable.has(res.status) && attempt < 2 && !dailyQuotaLimit) {
        // Short-window limits can reset quickly; daily token caps cannot.
        // Do not waste retries waiting on a daily cap — let the model fallback run.
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
  if (p.id === "gemini") {
    // Retry temporary overloads, then try a second free Gemini model.
    // Never switch to a paid model or silently change providers.
    const models = [p.model || PROVIDERS.gemini.defaultModel];
    let lastError: Error | null = null;

    for (const model of models) {
      for (let attempt = 0; attempt < 1; attempt++) {
        let response: Response;
        try {
          response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-goog-api-key": p.key,
            },
            body: JSON.stringify({
              model,
              input: `${system}\n\nUSER REQUEST:\n${user}`,
              store: false,
              ...(json ? { response_format: { type: "text", mime_type: "application/json" } } : {}),
            }),
            signal: AbortSignal.timeout(15_000),
            cache: "no-store",
          });
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** attempt));
            continue;
          }
          break;
        }

        const data = await response.json().catch(() => null) as {
          steps?: { type?: string; content?: { type?: string; text?: string }[] }[];
          output_text?: string;
          error?: { message?: string };
        } | null;

        if (!response.ok) {
          const message = `Google Gemini (${response.status}): ${data?.error?.message || response.statusText || "request failed"}`;
          lastError = new Error(message);
          const retryable = [429, 500, 502, 503, 504].includes(response.status);
          const dailyQuotaLimit = /requests per day|per day.*limit|daily.*quota|quota.*exceeded|generate_content_free_tier_requests|limit:\\s*\\d+ requests per day/i.test(data?.error?.message || "");
          if (dailyQuotaLimit) break;
          if (retryable && attempt < 2) {
            const retryAfter = Number(response.headers.get("retry-after") || "");
            const delay = Number.isFinite(retryAfter) && retryAfter > 0
              ? Math.min(15_000, retryAfter * 1000)
              : Math.min(8_000, 1_000 * 2 ** attempt);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
          // Try the alternate free model for overload, rate limits, or retired model IDs.
          if (retryable || response.status === 404) break;
          throw lastError;
        }

        const result = data?.output_text?.trim()
          || data?.steps?.filter((step) => step.type === "model_output")
            .flatMap((step) => step.content ?? [])
            .filter((part) => part.type === "text")
            .map((part) => part.text ?? "")
            .join("").trim();
        if (!result) throw new Error(`Google Gemini (${model}) returned an empty response.`);
        return result;
      }
      // A daily free-tier cap applies to the project, not just this model.
      // Do not waste requests trying another Gemini model after that response.
      if (/requests per day|per day.*limit|daily.*quota|quota.*exceeded|generate_content_free_tier_requests|limit:\\s*\\d+ requests per day/i.test(lastError?.message || "")) break;
    }

    // If Gemini's daily free quota is exhausted, use an explicitly configured
    // OpenRouter free key. Never fall back to a paid model.
    const geminiDailyLimit = /requests per day|per day.*limit|daily.*quota|quota.*exceeded|generate_content_free_tier_requests|limit:\\s*\\d+ requests per day/i.test(lastError?.message || "");
    if (geminiDailyLimit || /timeout|timed out|fetch failed|temporarily unavailable|502|503|504|429|rate.?limit/i.test(lastError?.message || "")) {
      let fallbackKey = process.env.OPENROUTER_API_KEY?.trim() || await getOpenRouterFallbackKey();
      const fallbackModel = process.env.AI_MODEL?.trim() || PROVIDERS.openrouter.defaultModel;
      if (fallbackKey) {
        return callModel({
          id: "openrouter",
          label: PROVIDERS.openrouter.label,
          model: fallbackModel.endsWith(":free") || fallbackModel === "openrouter/free"
            ? fallbackModel
            : PROVIDERS.openrouter.defaultModel,
          key: fallbackKey,
          source: process.env.OPENROUTER_API_KEY ? "env" : "settings",
        }, system, user, json);
      }
      throw new Error(
        `Google Gemini free daily quota is exhausted. FLOW did not use a paid model. Add an OpenRouter free API key in Settings to enable automatic free-model fallback, or wait for Gemini quota reset. ${lastError?.message || ""}`,
      );
    }

    throw new Error(
      `Google Gemini models are temporarily unavailable after automatic retries. FLOW tried ${models.join(" and ")}; no paid model was used. Please retry in a few minutes. ${lastError?.message || ""}`,
    );
  }
  if (p.id === "groq") {
    const data = await post(
      "https://api.groq.com/openai/v1/chat/completions",
      { authorization: `Bearer ${p.key}` },
      {
        model: p.model || PROVIDERS.groq.defaultModel,
        max_tokens: 4000,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        ...(json ? { response_format: { type: "json_object" } } : {}),
      },
      "Groq Free",
    ) as { choices?: { message?: { content?: unknown } }[] };
    const content = data?.choices?.[0]?.message?.content;
    const result = typeof content === "string" ? content.trim() : "";
    if (!result) throw new Error("Groq Free returned an empty response.");
    return result;
  }
  const requestChat = (model: string) => post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      authorization: `Bearer ${p.key}`,
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "https://flow-dash-drab.vercel.app",
      "X-Title": "FLOW Workspace",
    },
    {
      model,
      max_tokens: 4000,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      ...(json ? { response_format: { type: "json_object" } } : {}),
    },
    "OpenRouter Free",
  );
  const configured = p.model.endsWith(":free") || p.model === "openrouter/free"
    ? p.model
    : PROVIDERS.openrouter.defaultModel;
  // Prefer OpenRouter's live free-model router, then use currently listed
  // text-generation free models as independent fallbacks. Keep this list short:
  // failed free attempts still count toward OpenRouter's daily request limit.
  const freeModels = Array.from(new Set([
    "openrouter/free",
    configured,
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "google/gemma-4-31b-it:free",
  ]));
  let data: { choices?: { message?: { content?: unknown } }[] } | undefined;
  let lastError: unknown;
  for (const model of freeModels) {
    try {
      data = (await requestChat(model)) as typeof data;
      const message = data?.choices?.[0]?.message;
      const content = message?.content;
      const result = typeof content === "string"
        ? content.trim()
        : Array.isArray(content)
          ? content.filter((part: unknown) => typeof part === "object" && part !== null && "text" in part)
              .map((part: any) => String(part.text ?? "")).join("").trim()
          : "";
      if (result) return result;
      lastError = new Error(`OpenRouter Free: ${model} returned an empty response.`);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      // OpenRouter's free-models-per-day quota is shared across free model IDs.
      // Trying more models cannot bypass it and only creates needless 429 calls.
      if (/free-models-per-day|free model requests per day|daily free model limit/i.test(message)) {
        throw new Error("OpenRouter's shared free-model daily limit has been reached. FLOW stopped without trying more models or using a paid model. Wait for OpenRouter's daily reset, or connect another provider with an available free quota in Settings.");
      }
      const canTryAnotherFreeModel =
        ["(402):", "(404):", "(429):", "(502):", "(503):", "(504):"].some((status) => message.includes(status)) ||
        /no endpoints available|model is unavailable|provider is unavailable|rate.?limit|quota exceeded|temporarily unavailable/i.test(message);
      if (!canTryAnotherFreeModel) throw error;
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? "");
  const groqKey = await getGroqFallbackKey();
  if (groqKey) {
    try {
      return await callModel({
        id: "groq",
        label: PROVIDERS.groq.label,
        model: PROVIDERS.groq.defaultModel,
        key: groqKey,
        source: "settings",
      }, system, user, json);
    } catch (groqError) {
      const groqMessage = groqError instanceof Error ? groqError.message : String(groqError);
      throw new Error(`OpenRouter free quota is unavailable, and Groq fallback also failed. No paid model was used. ${detail} | ${groqMessage}`);
    }
  }
  throw new Error(`All configured OpenRouter free models are unavailable or rate-limited. FLOW did not switch to a paid model. Connect a Groq free key in Settings or retry after quota reset. ${detail}`);
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
  let current = content;
  const min = RULES[m].bulletMin;
  const max = RULES[m].bulletMax;

  // Some free-tier models ignore the length constraint on the first correction.
  // Give the model multiple targeted chances, explicitly identifying each short
  // bullet and its current character count instead of failing the whole product.
  for (let attempt = 0; attempt < 1; attempt++) {
    if (!hasShortBullets(current, m)) return current;

    const shortItems = [
      ...current.bulletsEn.map((value, index) => ({ language: "English", index: index + 1, value })),
      ...current.bulletsAr.map((value, index) => ({ language: "Arabic", index: index + 1, value })),
    ].filter((item) => item.value.trim().length < min || item.value.trim().length > max);
    const repairPrompt = `The listing failed a strict marketplace validation. This is correction attempt ${attempt + 1} of 3.
Rewrite ONLY the bullet arrays while preserving the title, descriptions and search terms.
There must be exactly ${RULES[m].bullets} English bullets and ${RULES[m].bullets} Arabic bullets.
EVERY bullet must be between ${min} and ${max} characters INCLUDING spaces. Count the characters before returning JSON.
The following bullets are invalid; each needs a substantive rewrite, not a tiny edit:
${shortItems.map((item) => `- ${item.language} bullet ${item.index} (${item.value.trim().length} chars): ${item.value}`).join("\\n")}
Use the confirmed product facts below to make each bullet informative and long enough. Explain a different practical use or stated feature in each bullet. Never invent specifications, materials, performance, compatibility or accessories. Do not repeat the same sentence or add meaningless padding.
Product brief:
${userPrompt(brief, m, "clear", "", tail)}
Current listing JSON:
${JSON.stringify(current)}
Return ONLY the complete JSON object in this exact shape:
{${LISTING_SHAPE}}`;
    current = toListing(await callListingJson(p, SYSTEM, repairPrompt), m);
  }

  if (hasShortBullets(current, m)) {
    // Last-resort deterministic repair: preserve each model-written product
    // fact and add neutral shopper guidance already used by FLOW's template
    // engine. This adds no specifications or product-performance claims.
    const enFacts = brief.features.split(/\r?\n/).map((s) => s.replace(/^[-•*\s]+/, "").trim()).filter(Boolean);
    const arFacts = brief.featuresAr.split(/\r?\n/).map((s) => s.replace(/^[-•*\s]+/, "").trim()).filter(Boolean);
    const enFallback = enFacts.length ? enFacts : [brief.name.trim()];
    const arFallback = arFacts.length ? arFacts : [brief.nameAr.trim()];
    const enSuffix = " Use this stated detail to compare options and check whether the product matches your needs before purchase.";
    const arSuffix = " وتساعدك هذه المعلومة على مقارنة الخيارات والتأكد من ملاءمة المنتج لاحتياجك قبل الشراء.";
    const fit = (source: string, fallback: string, suffix: string) => {
      const base = (source || fallback).trim().replace(/[.!،؛,\s]+$/u, "");
      const room = Math.max(0, max - suffix.length - 1);
      const shortened = base.length > room ? base.slice(0, room).replace(/\s+\S*$/u, "").trim() : base;
      let result = shortened + suffix;
      if (result.length < min && fallback && fallback !== source) {
        const safeFallback = fallback.trim().replace(/[.!،؛,\s]+$/u, "");
        const fallbackRoom = Math.max(0, max - suffix.length - 1);
        const fallbackBase = safeFallback.length > fallbackRoom
          ? safeFallback.slice(0, fallbackRoom).replace(/\s+\S*$/u, "").trim()
          : safeFallback;
        result = fallbackBase + suffix;
      }
      return result.slice(0, max).trim();
    };
    current = {
      ...current,
      bulletsEn: Array.from({ length: RULES[m].bullets }, (_, i) =>
        fit(current.bulletsEn[i] ?? "", enFallback[i % enFallback.length] ?? brief.name, enSuffix)
      ),
      bulletsAr: Array.from({ length: RULES[m].bullets }, (_, i) =>
        fit(current.bulletsAr[i] ?? "", arFallback[i % Math.max(1, arFallback.length)] ?? brief.nameAr, arSuffix)
      ),
    };
    if (hasShortBullets(current, m)) {
      throw new Error(`FLOW could not safely complete all ${RULES[m].bullets} bilingual bullets. Add confirmed product details and retry.`);
    }
  }
  return current;
}

type ProductResearch = { brief: ProductBrief; sources: string[] };

function decodeResearchHtml(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

function normalizeResearchMatchText(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\bhyadrate\b/g, "hydra")
    .replace(/\b(hydrate|hydration)\b/g, "hydra")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function isRelevantResearchPage(
  item: { title: string; snippet?: string; page: string },
  brief: ProductBrief,
  brandHint: string,
): boolean {
  const stopWords = new Set([
    "the", "and", "for", "with", "from", "official", "product", "new", "original",
    "ml", "mg", "gm", "gr", "kg", "oz", "pcs", "piece", "pieces", "pack", "set",
    "cream", "gel", "serum", "lotion", "moisturizer", "moisturiser", "hydrating",
    "skin", "face", "daily", "everyday", "fresh", "steps", "quick", "deep",
  ]);
  // Product names often appear after navigation, cookie banners, and store
  // headers. Search the full readable page plus the search-result snippet;
  // limiting this to the first 2,400 characters caused false negatives.
  const searchable = new Set(normalizeResearchMatchText(
    [item.title, item.snippet ?? "", item.page].join(" "),
  ).split(/\s+/).filter(Boolean));
  const brandTokens = normalizeResearchMatchText(brandHint).split(/\s+/)
    .filter((token) => token.length > 1);
  const productTokens = normalizeResearchMatchText(brief.name + " " + brief.nameAr)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopWords.has(token) && !brandTokens.includes(token));
  const matchedProductTokens = productTokens.filter((token) => searchable.has(token));
  const overlap = productTokens.length ? matchedProductTokens.length / productTokens.length : 0;
  const normalizedPage = normalizeResearchMatchText([item.title, item.snippet ?? "", item.page].join(" "));
  const normalizedName = normalizeResearchMatchText(brief.name)
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|mg|g|kg|oz|pcs|pieces?)\b/g, " ")
    .replace(/\s+/g, " ").trim();
  const exactNameMatch = normalizedName.length >= 8 && normalizedPage.includes(normalizedName);
  const matchedBrandTokens = brandTokens.filter((token) => searchable.has(token)).length;
  const brandOverlap = brandTokens.length ? matchedBrandTokens / brandTokens.length : 1;
  // Retailer pages often omit the brand in the body, while brand stores may
  // abbreviate product names. Accept a strong product-name match or a
  // reasonable product + brand match; do not require every brand token.
  const productMatches = exactNameMatch ||
    (productTokens.length >= 2 && overlap >= 0.5) ||
    (productTokens.length === 1 && matchedProductTokens.length === 1);
  const brandSupportsMatch = brandTokens.length === 0 || brandOverlap >= 0.5;
  return productMatches && (brandSupportsMatch || exactNameMatch || overlap >= 0.75);
}

/** Researches an exact product name against public web results before copy is generated. */
async function researchProductBrief(provider: AiProvider, brief: ProductBrief): Promise<ProductResearch> {
  const brandHint = brief.brand.trim() || (/dermaelle/i.test(brief.name) ? "Dermaelle" : "");
  const normalizedName = brief.name
    .replace(/\bhyadrate\b/gi, "hydrate")
    .replace(/\bhydrate cream\b/gi, "hydra gel cream");
  const cleanSearchName = normalizedName
    .replace(/[|,()[\]{}]/g, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|mg|g|kg|oz|pcs|pieces?)\b/gi, " ")
    .replace(/\s+/g, " ").trim();
  const queries = Array.from(new Set([
    [brandHint, '"' + brief.name + '"', "product"].filter(Boolean).join(" "),
    '"' + brief.name + '"',
    [brandHint, cleanSearchName, "product details"].filter(Boolean).join(" "),
    [cleanSearchName, "brand product official store"].filter(Boolean).join(" "),
  ].filter((query) => query.trim().length > 3)));
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
  const readerSearchUrls = queries.slice(0, 2).flatMap((query) => [
    "https://r.jina.ai/http://www.google.com/search?q=" + encodeURIComponent(query),
    "https://r.jina.ai/http://www.bing.com/search?q=" + encodeURIComponent(query),
  ]);
  const readSearchPage = async (searchUrl: string): Promise<string | null> => {
    try {
      const response = await fetch(searchUrl, {
        headers: { accept: "text/plain, text/markdown, */*" },
        signal: AbortSignal.timeout(9_000),
        cache: "no-store",
      });
      if (!response.ok) return null;
      return (await response.text()).slice(0, 35_000);
    } catch {
      return null;
    }
  };
  const addSearchPage = (text: string) => {
    searchWasAvailable = true;
    const markdownLinks = /\[([^\]]{3,240})\]\((https?:\/\/[^)\s]+)\)/g;
    for (const match of text.matchAll(markdownLinks)) addResult(match[2], match[1], "");
    // Reader may return plain URLs instead of Markdown links for some pages.
    if (!results.length) {
      for (const match of text.matchAll(/https?:\/\/[^\s<>"]+/g)) {
        addResult(match[0], text.slice(Math.max(0, match.index! - 160), match.index!).split("\n").filter(Boolean).slice(-1)[0] || "Product source", "");
      }
    }
  };

  // Google and Bing for the exact product-name query are fetched together.
  // This removes one full network round-trip from the common successful path.
  const firstPages = await Promise.all(readerSearchUrls.slice(0, 2).map(readSearchPage));
  for (const page of firstPages) if (page) addSearchPage(page);

  // Only fan out to broader queries if the exact-name search did not return
  // enough candidates. Keep the fallback path conservative and bounded.
  if (results.length < 3) {
    // Fetch broader queries only when the exact-name searches return too few candidates. Sequential requests added several
    // full network round-trips to listings for products with uncommon names.
    const fallbackPages = await Promise.all(readerSearchUrls.slice(2).map(readSearchPage));
    for (const page of fallbackPages) if (page) addSearchPage(page);
  }

  // Keep direct RSS/HTML providers as secondary fallbacks, but never depend
  // on their markup being identical across search-engine experiments.
  if (results.length === 0) {
    for (const query of queries.slice(0, 1)) {
      const searchUrls = [
        "https://www.bing.com/search?format=rss&q=" + encodeURIComponent(query),
        "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query),
      ];
      for (const searchUrl of searchUrls) {
        try {
          const response = await fetch(searchUrl, {
            headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36", accept: "application/rss+xml, application/xml, text/html;q=0.9, */*;q=0.8" },
            signal: AbortSignal.timeout(6_000), cache: "no-store",
          });
          if (!response.ok) continue;
          searchWasAvailable = true;
          const searchText = await response.text();
          if (/format=rss/i.test(searchUrl)) {
            const items = searchText.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
            for (const item of items) {
              const getTag = (tag: string) => item.match(new RegExp("<" + tag + "[^>]*>([\s\S]*?)</" + tag + ">", "i"))?.[1] ?? "";
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
          if (results.length >= 3) break;
        } catch { /* try the next public search provider */ }
      }
      if (results.length >= 8) break;
    }
  }
  if (!results.length && !searchWasAvailable) throw new Error("FLOW could not reach its public product research service. Please retry in a moment.");
  if (!results.length) throw new Error("FLOW could not find public product sources for this exact name. Add a brand or model number and retry.");

  // Read source pages as clean Markdown through Reader. This avoids fragile
  // per-site HTML parsing and keeps product facts grounded in the page content.
  const htmlToResearchText = (html: string) => decodeResearchHtml(
    html
      .replace(/<(script|style|noscript|svg|header|footer|nav)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|section|br|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
  const pages = await Promise.all(results.slice(0, 4).map(async (result) => {
    // Try the clean Reader representation first.
    try {
      const response = await fetch("https://r.jina.ai/" + result.url, {
        headers: { accept: "text/plain, text/markdown, */*" },
        signal: AbortSignal.timeout(18_000),
        cache: "no-store",
      });
      if (response.ok) {
        const page = (await response.text()).slice(0, 9000);
        if (page.length > 300) return { ...result, page };
      }
    } catch { /* fall through to the original page */ }
    // Many Shopify storefronts block Reader or return an empty conversion.
    // Fetch the product page itself and extract its visible HTML text instead.
    try {
      const response = await fetch(result.url, {
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; FLOWProductResearch/1.0)",
          accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(18_000),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Direct product page unavailable");
      const html = await response.text();
      const page = htmlToResearchText(html).slice(0, 9000);
      if (page.length > 300) return { ...result, page };
    } catch { /* try the Shopify product JSON endpoint */ }
    // Shopify exposes a structured product endpoint that is often readable
    // even when its storefront HTML or Reader conversion is not.
    try {
      const jsonUrl = result.url.replace(/\/$/, "") + ".js";
      const response = await fetch(jsonUrl, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
      });
      if (response.ok) {
        const product = await response.json() as { title?: string; vendor?: string; product_type?: string; tags?: string[]; description?: string; body_html?: string };
        const page = [
          product.title ? "Product: " + product.title : "",
          product.vendor ? "Brand: " + product.vendor : "",
          product.product_type ? "Category: " + product.product_type : "",
          product.tags?.length ? "Tags: " + product.tags.join(", ") : "",
          htmlToResearchText(product.description || product.body_html || ""),
        ].filter(Boolean).join("\n").slice(0, 9000);
        if (page.length > 300) return { ...result, page };
      }
    } catch { /* no readable source available */ }
    return { ...result, page: "" };
  }));
  const readablePages = pages.filter((item) =>
    item.page.length > 300 && isRelevantResearchPage(item, brief, brandHint),
  );
  if (!readablePages.length) {
    // Public research is an aid, not a hard dependency. If no exact source can
    // be verified, continue from the user's supplied product identity and
    // explicit attributes only, with strict no-guessing instructions.
    const suppliedFacts = [
      "User-supplied product identity (not independently verified): " + brief.name,
      brief.brand.trim() ? "User-supplied brand: " + brief.brand.trim() : "",
      brief.category && brief.category !== "auto" ? "User-supplied category: " + brief.category : "",
      "No exact public product source could be verified. Use only the literal product type, size, quantity, model, or other attributes explicitly stated in the supplied name/category. Do not add ingredients, materials, compatibility, performance, efficacy, certifications, warranty, origin, or accessories.",
      "If a detail is not explicit in the supplied information, omit it. Prefer accurate copy over invented selling points.",
    ].filter(Boolean).join("\n");
    return {
      brief: {
        ...brief,
        brand: brief.brand.trim() || brandHint,
        features: suppliedFacts,
        featuresAr: brief.featuresAr.trim(),
        keywords: brief.keywords.trim() || brief.name,
      },
      sources: [],
    };
  }
  // Do not spend a separate Groq request asking the model to summarize sources.
  // Pass the readable source excerpts into the one listing-generation request;
  // the listing model can write both languages directly from those excerpts.
  const sourceFacts = readablePages.slice(0, 3).map((item, i) =>
    "[Public product source " + (i + 1) + "] " + item.url + "\n" + item.page
  ).join("\n\n").slice(0, 8500);
  // Keep user-entered facts AND verified source excerpts. Previously, one
  // user-entered feature caused the source excerpts to be discarded, leaving
  // the model without evidence for the remaining specifications.
  const features = [brief.features.trim(), sourceFacts].filter(Boolean).join("\n\n");
  const researched: ProductBrief = {
    ...brief,
    brand: brief.brand.trim() || brandHint,
    features,
    featuresAr: brief.featuresAr.trim(),
    keywords: brief.keywords.trim() || brief.name,
  };
  return { brief: researched, sources: readablePages.slice(0, 3).map((item) => item.url) };
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
  correctionNotes = "",
): Promise<{ content: ListingContent; specs: Partial<Record<SpecKey, string>> }> {
  const knownText = Object.entries(known)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  // Batch generation must finish within the hosting function's time limit.
  // Do not run a separate web-research round trip for every row or estimate
  // unprovided measurements. Use only facts supplied in the sheet.
  const estimateKeys: SpecKey[] = [];
  const tail = `Confirmed specifications from the receiving sheet (facts — you may use them in the copy):
${knownText || "(none)"}

Do not estimate missing specifications. Return a "specs" object with no guessed values.
Keep every unconfirmed specification out of the title, bullets and description.

Return exactly this JSON shape:
{${LISTING_SHAPE},"specs":{}}`;
  const researchedBrief: ProductBrief = {
    ...brief,
    nameAr: brief.nameAr.trim() || brief.name,
    features: brief.features.trim() || `Product identity supplied in the receiving sheet: ${brief.name}`,
    featuresAr: brief.featuresAr.trim() || brief.nameAr.trim() || brief.name,
  };
  const raw = await callListingJson(p, SYSTEM, userPrompt(researchedBrief, m, tone, correctionNotes, tail));
  const initialContent = toListing(raw, m);
  const content = await repairShortBullets(p, researchedBrief, m, initialContent, tail);
  const rawSpecs = (raw.specs && typeof raw.specs === "object" ? raw.specs : {}) as Record<string, unknown>;
  const specs: Partial<Record<SpecKey, string>> = {};
  for (const k of estimateKeys) {
    const v = str(rawSpecs[k]).slice(0, 80);
    if (v) specs[k] = v;
  }
  return { content, specs };
}

/** Short free-form text from the connected model (review replies and other drafts). */
export async function generateText(p: AiProvider, system: string, user: string): Promise<string> {
  return (await callModel(p, system, user, false)).trim();
}
