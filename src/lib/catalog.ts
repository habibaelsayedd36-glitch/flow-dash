/**
 * FLOW Agency catalogue — taken from flow-agency-eg.com (pricing page, services, portfolio).
 * Pure constants: safe to import from both server and client code.
 */

export const STAGES = ["intake", "content", "optimization", "publishing", "management", "growth"] as const;
export type Stage = (typeof STAGES)[number];

export const MARKETPLACES = ["amazon", "noon", "tiktok", "shopify"] as const;
export type Marketplace = (typeof MARKETPLACES)[number];

export const MARKETPLACE_META: Record<Marketplace, { label: string }> = {
  amazon: { label: "Amazon" },
  noon: { label: "Noon" },
  tiktok: { label: "TikTok Shop" },
  shopify: { label: "Shopify" },
};

/** The eight categories of FLOW's public portfolio. */
export const CATEGORIES = [
  "accessories",
  "cosmetics",
  "electronics",
  "fashion",
  "home",
  "jewellery",
  "office",
  "toys",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type PlanId = "starter" | "growth" | "scale" | "am_basic" | "am_premium" | "per_item";

export const PLANS: Record<
  PlanId,
  { fee: number; pct: number; pctCap: number | null; quota: number | null; extraItem: number | null }
> = {
  starter: { fee: 3500, pct: 1, pctCap: null, quota: 50, extraItem: 35 },
  growth: { fee: 8000, pct: 2, pctCap: 5, quota: 150, extraItem: 25 },
  scale: { fee: 16000, pct: 2.5, pctCap: 5, quota: 400, extraItem: 20 },
  am_basic: { fee: 2500, pct: 1, pctCap: null, quota: null, extraItem: null },
  am_premium: { fee: 5000, pct: 2, pctCap: null, quota: null, extraItem: null },
  per_item: { fee: 0, pct: 0, pctCap: null, quota: null, extraItem: 35 },
};
export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

export const TEAMS = ["studio", "content", "ops", "accounts", "sales"] as const;
export type Team = (typeof TEAMS)[number];

export const TASK_KINDS = [
  "schedule_shoot",
  "review_listing",
  "fix_compliance",
  "upload_listing",
  "verify_live",
  "follow_up",
  "upsell_plan",
  "contact_lead",
  "restock",
  "reply_review",
  "handle_return",
  "custom",
] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const TRIGGERS = [
  "product_created",
  "stage_entered",
  "listing_generated",
  "listing_approved",
  "listing_published",
  "quota_reached",
  "product_stale",
  "lead_created",
  "stock_low",
  "review_negative",
  "order_returned",
] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const ACTIONS = ["create_task", "move_stage", "generate_listing"] as const;
export type ActionType = (typeof ACTIONS)[number];

export const LISTING_STATUSES = ["draft", "review", "approved", "published"] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const TONES = ["clear", "premium", "friendly"] as const;
export type Tone = (typeof TONES)[number];

export const CLIENT_STATUSES = ["active", "onboarding", "paused"] as const;

export function isStage(v: unknown): v is Stage {
  return typeof v === "string" && (STAGES as readonly string[]).includes(v);
}
export function isMarketplace(v: unknown): v is Marketplace {
  return typeof v === "string" && (MARKETPLACES as readonly string[]).includes(v);
}
export function nextStage(s: string): Stage | null {
  const i = (STAGES as readonly string[]).indexOf(s);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
}
export function prevStage(s: string): Stage | null {
  const i = (STAGES as readonly string[]).indexOf(s);
  return i > 0 ? STAGES[i - 1] : null;
}

/** Cleans a phone number into the digits-only international form wa.me expects. */
export function waNumber(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("20")) return d;
  if (d.startsWith("0")) return "20" + d.slice(1);
  return d;
}
export function waLink(phone: string, text: string): string {
  return `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`;
}

export const ORDER_STATUSES = ["new", "processing", "shipped", "delivered", "returned", "cancelled"] as const;
export const REVIEW_STATUSES = ["new", "replied", "resolved"] as const;
export const LEAD_STATUSES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;
export const LEAD_SOURCES = ["website", "manual", "whatsapp", "referral", "facebook", "instagram"] as const;

/** The options of the contact form on flow-agency-eg.com. */
export const LEAD_PLATFORMS = ["Amazon", "Noon", "TikTok Shop", "Shopify", "Other"] as const;
export const LEAD_SERVICES = [
  "Growth plan — 150 products / month",
  "Starter plan — 50 products / month",
  "Scale plan — 400 products / month",
  "Account management — Basic",
  "Account management — Premium",
  "Full Content (photography + listing)",
  "Photography only",
  "Listing only",
  "Custom package (I picked my own features)",
  "Not Sure Yet",
] as const;

/** "2026-11" for the given moment in Cairo. */
export const cairoMonth = (d: Date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit" }).format(d).slice(0, 7);
export function prevMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
}
export const monthName = (m: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
