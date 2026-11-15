import { db } from "@/db";
import { ensureDb } from "@/db/ensure";
import { leads } from "@/db/schema";
import { emit } from "@/lib/engine";

export const dynamic = "force-dynamic";

/**
 * Public lead intake for the website's contact form.
 *
 *   POST /api/leads   (JSON or form-encoded)
 *   { name, email, phone, platform, products, service, message }
 *
 * - CORS: only the origins in LEADS_ALLOWED_ORIGINS (comma separated) may post
 *   from a browser. Defaults to the two flow-agency-eg.com origins.
 * - A hidden "website" field is a honeypot: bots fill it, people never see it.
 * - At most 5 submissions a minute per IP address.
 */

const DEFAULT_ORIGINS = ["https://www.flow-agency-eg.com", "https://flow-agency-eg.com"];

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = process.env.LEADS_ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? DEFAULT_ORIGINS;
  const headers: Record<string, string> = { Vary: "Origin" };
  if (allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
  }
  return headers;
}

const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 5;
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: cors(req) });
}

export async function POST(req: Request) {
  const headers = cors(req);
  const reply = (body: unknown, status: number) => Response.json(body, { status, headers });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (limited(ip)) return reply({ ok: false, error: "Too many requests. Try again in a minute." }, 429);

  let input: Record<string, unknown> = {};
  try {
    if ((req.headers.get("content-type") ?? "").includes("application/json")) input = (await req.json()) as Record<string, unknown>;
    else input = Object.fromEntries((await req.formData()).entries());
  } catch {
    return reply({ ok: false, error: "Send JSON or form data." }, 400);
  }
  const get = (keys: string[], max: number) => {
    for (const k of keys) {
      const v = input?.[k];
      if (typeof v === "string" && v.trim()) return v.trim().slice(0, max);
      if (typeof v === "number") return String(v).slice(0, max);
    }
    return "";
  };

  // Honeypot: accept silently so bots learn nothing, store nothing.
  if (get(["website", "company_url"], 200)) return reply({ ok: true }, 200);

  const name = get(["name", "fullName", "full_name"], 120);
  const email = get(["email"], 160);
  const phone = get(["phone", "whatsapp"], 30);
  if (name.length < 2) return reply({ ok: false, error: "A name is required." }, 422);
  if (!email && !phone) return reply({ ok: false, error: "A phone number or an email address is required." }, 422);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply({ ok: false, error: "The email address is not valid." }, 422);

  try {
    await ensureDb();
    await db.insert(leads).values({
      name,
      email,
      phone,
      platform: get(["platform"], 40),
      productsCount: get(["products", "productsCount", "numberOfProducts"], 20),
      service: get(["service"], 80),
      message: get(["message"], 2000),
      source: "website",
    });
    await emit("lead_created", { detail: name });
    return reply({ ok: true }, 201);
  } catch {
    return reply({ ok: false, error: "The lead could not be saved." }, 500);
  }
}
