import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  adCampaigns,
  automations,
  clients,
  healthChecks,
  keywords,
  leads,
  listings,
  orders,
  products,
  reviews,
  type AutomationCondition,
  type AutomationConfig,
} from "@/db/schema";
import { PLANS, cairoMonth, prevMonth, type Marketplace, type PlanId } from "@/lib/catalog";
import { briefOf, checkStock, emit } from "@/lib/engine";
import { buildTemplateListing, scoreListing, type ListingContent } from "@/lib/rules";

/**
 * Sample workspace. Client and product names are fictional. Phone numbers all
 * point at FLOW's own public customer-service line, so a WhatsApp draft opened
 * from sample data can never reach a stranger. Prices and plan limits are the
 * real ones from flow-agency-eg.com/pricing.
 */

const FLOW_LINE = "01550408340";
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

type SeedClient = { name: string; contact: string; plan: PlanId; markets: Marketplace[]; status?: string };
const CLIENTS: SeedClient[] = [
  { name: "Nile Home", contact: "مريم", plan: "growth", markets: ["amazon", "noon"] },
  { name: "Luna", contact: "سارة", plan: "starter", markets: ["noon", "tiktok"] },
  { name: "Delta", contact: "كريم", plan: "scale", markets: ["amazon", "noon"] },
  { name: "Farha Toys", contact: "هدى", plan: "am_basic", markets: ["amazon"] },
  { name: "Papyrus Office", contact: "عمر", plan: "am_premium", markets: ["amazon", "shopify"] },
  { name: "Sahara Leather", contact: "ياسين", plan: "per_item", markets: ["shopify"], status: "onboarding" },
];

type SeedProduct = {
  client: string;
  name: string;
  nameAr: string;
  sku: string;
  category: string;
  marketplace: Marketplace;
  stage: string;
  age: number;
  features: string[];
  featuresAr: string[];
  keywords: string;
};

const PRODUCTS: SeedProduct[] = [
  {
    client: "Nile Home", name: "Insulated Water Bottle 750ml", nameAr: "زجاجة مياه حرارية 750 مل", sku: "NH-BTL-750",
    category: "home", marketplace: "amazon", stage: "optimization", age: 1,
    features: [
      "Double-wall vacuum insulation keeps drinks cold for 24 hours and hot for 12 hours",
      "Made from 18/8 food-grade stainless steel, BPA-free",
      "Leak-proof screw cap with carry loop",
      "750 ml capacity fits standard car cup holders",
      "Hand wash recommended",
    ],
    featuresAr: [
      "عزل بجدار مزدوج يحافظ على برودة المشروبات 24 ساعة وسخونتها 12 ساعة",
      "مصنوعة من ستانلس ستيل 18/8 آمن على الطعام وخالٍ من BPA",
      "غطاء محكم ضد التسريب مع حلقة للحمل",
      "سعة 750 مل تناسب حامل الأكواب في السيارة",
      "يُنصح بالغسل اليدوي",
    ],
    keywords: "insulated water bottle, stainless steel bottle, 750ml, زجاجة مياه حرارية",
  },
  {
    client: "Luna", name: "Vitamin C Brightening Face Serum 30ml", nameAr: "سيروم فيتامين سي للوجه 30 مل", sku: "LN-SRM-030",
    category: "cosmetics", marketplace: "noon", stage: "optimization", age: 2,
    features: [
      "10% vitamin C with hyaluronic acid",
      "Lightweight, fast-absorbing formula",
      "Suitable for all skin types",
      "Fragrance-free and paraben-free",
      "30 ml glass bottle with dropper",
    ],
    featuresAr: [
      "فيتامين سي بتركيز 10% مع حمض الهيالورونيك",
      "تركيبة خفيفة سريعة الامتصاص",
      "مناسب لجميع أنواع البشرة",
      "خالٍ من العطور والبارابين",
      "زجاجة 30 مل مع قطارة",
    ],
    keywords: "vitamin c serum, face serum, سيروم فيتامين سي",
  },
  {
    client: "Delta", name: "Power Bank 20000mAh", nameAr: "باور بانك 20000 مللي أمبير", sku: "DL-PB-20K",
    category: "electronics", marketplace: "amazon", stage: "publishing", age: 1,
    features: [
      "20000 mAh capacity",
      "22.5W fast charging output",
      "Two USB-A ports and one USB-C port",
      "LED display shows remaining battery percentage",
      "Weighs 420 g",
    ],
    featuresAr: [
      "سعة 20000 مللي أمبير",
      "شحن سريع بقدرة 22.5 واط",
      "منفذان USB-A ومنفذ USB-C",
      "شاشة LED تعرض نسبة البطارية المتبقية",
      "الوزن 420 جرام",
    ],
    keywords: "power bank 20000mah, fast charging power bank, باور بانك",
  },
  {
    client: "Nile Home", name: "Bamboo Cutting Board Set of 3", nameAr: "طقم ألواح تقطيع من البامبو 3 قطع", sku: "NH-CB-3",
    category: "home", marketplace: "amazon", stage: "content", age: 5,
    features: ["Three sizes: small, medium and large", "Made from natural bamboo", "Juice groove on the large board"],
    featuresAr: ["ثلاثة مقاسات: صغير ومتوسط وكبير", "مصنوع من البامبو الطبيعي", "مجرى للعصارة في اللوح الكبير"],
    keywords: "bamboo cutting board, chopping board set, لوح تقطيع بامبو",
  },
  {
    client: "Nile Home", name: "Cotton Bath Towel 70x140cm", nameAr: "فوطة حمام قطن 70×140 سم", sku: "NH-TWL-70",
    category: "home", marketplace: "noon", stage: "intake", age: 0,
    features: ["100% Egyptian cotton", "Size 70 x 140 cm", "550 GSM weight"],
    featuresAr: ["قطن مصري 100%", "المقاس 70 × 140 سم", "وزن 550 جرام للمتر المربع"],
    keywords: "bath towel, egyptian cotton towel, فوطة حمام",
  },
  {
    client: "Luna", name: "Matte Liquid Lipstick", nameAr: "أحمر شفاه سائل مطفي", sku: "LN-LIP-M01",
    category: "cosmetics", marketplace: "tiktok", stage: "content", age: 1,
    features: ["Matte finish", "5 ml tube with applicator wand", "Available in 6 shades"],
    featuresAr: ["لمسة نهائية مطفية", "أنبوبة 5 مل مع فرشاة", "متوفر بـ 6 درجات"],
    keywords: "matte lipstick, liquid lipstick, أحمر شفاه مطفي",
  },
  {
    client: "Delta", name: "Wireless Earbuds Bluetooth 5.3", nameAr: "سماعات لاسلكية بلوتوث 5.3", sku: "DL-EB-53",
    category: "electronics", marketplace: "noon", stage: "content", age: 2,
    features: [
      "Bluetooth 5.3 connection",
      "Up to 6 hours of playback per charge",
      "Charging case with USB-C port",
      "IPX4 splash resistance",
      "Touch controls on each earbud",
    ],
    featuresAr: [
      "اتصال بلوتوث 5.3",
      "تشغيل حتى 6 ساعات في الشحنة الواحدة",
      "علبة شحن بمنفذ USB-C",
      "مقاومة لرذاذ الماء بمعيار IPX4",
      "تحكم باللمس في كل سماعة",
    ],
    keywords: "wireless earbuds, bluetooth earphones, سماعات بلوتوث",
  },
  {
    client: "Delta", name: "USB-C Wall Charger 30W", nameAr: "شاحن حائط USB-C بقدرة 30 واط", sku: "DL-CH-30",
    category: "electronics", marketplace: "amazon", stage: "growth", age: 12,
    features: ["30W output", "One USB-C port", "Foldable plug"],
    featuresAr: ["قدرة 30 واط", "منفذ USB-C واحد", "قابس قابل للطي"],
    keywords: "usb c charger, 30w charger, شاحن سريع",
  },
  {
    client: "Farha Toys", name: "Wooden Building Blocks 50 Pieces", nameAr: "مكعبات بناء خشبية 50 قطعة", sku: "FT-BLK-50",
    category: "toys", marketplace: "amazon", stage: "management", age: 3,
    features: ["50 wooden pieces in assorted shapes", "For ages 3 and up", "Comes in a cotton storage bag"],
    featuresAr: ["50 قطعة خشبية بأشكال متنوعة", "للأعمار من 3 سنوات فأكثر", "تأتي في حقيبة تخزين قطنية"],
    keywords: "wooden blocks, building blocks, مكعبات خشبية",
  },
  {
    client: "Papyrus Office", name: "A5 Hardcover Notebook", nameAr: "دفتر A5 بغلاف مقوى", sku: "PO-NB-A5",
    category: "office", marketplace: "shopify", stage: "publishing", age: 4,
    features: ["A5 size with 192 lined pages", "100 gsm paper", "Elastic closure and ribbon marker"],
    featuresAr: ["مقاس A5 مع 192 صفحة مسطرة", "ورق 100 جرام", "رباط مطاطي وشريط لتحديد الصفحة"],
    keywords: "a5 notebook, hardcover journal, دفتر ملاحظات",
  },
  {
    client: "Papyrus Office", name: "Gel Pens Set of 12", nameAr: "طقم أقلام جل 12 قلم", sku: "PO-GP-12",
    category: "office", marketplace: "amazon", stage: "intake", age: 0,
    features: ["12 colours", "0.5 mm tip", "Rubber grip"],
    featuresAr: ["12 لوناً", "سن 0.5 مم", "مقبض مطاطي"],
    keywords: "gel pens, coloured pens set, أقلام جل",
  },
  {
    client: "Sahara Leather", name: "Leather Card Holder", nameAr: "حافظة بطاقات جلد", sku: "SL-CH-01",
    category: "accessories", marketplace: "shopify", stage: "intake", age: 1,
    features: ["Genuine cowhide leather", "Holds 6 cards", "Hand-stitched edges"],
    featuresAr: ["جلد بقري طبيعي", "تتسع لـ 6 بطاقات", "حواف مخيطة يدوياً"],
    keywords: "leather card holder, slim wallet, حافظة كروت",
  },
];

/** Hand-written example listings, stored with engine = "sample". */
const SAMPLE_LISTINGS: Record<string, { status: string; content: ListingContent }> = {
  "NH-BTL-750": {
    status: "review",
    content: {
      titleEn: "Nile Home Insulated Water Bottle 750ml, Stainless Steel Double Wall Vacuum Flask, Leak-Proof Cap with Carry Loop",
      titleAr: "زجاجة مياه حرارية 750 مل من Nile Home، ستانلس ستيل بجدار مزدوج وغطاء محكم ضد التسريب",
      bulletsEn: [
        "Keeps drinks cold for 24 hours and hot for 12 hours with double-wall vacuum insulation",
        "Made from 18/8 food-grade stainless steel that is BPA-free",
        "Leak-proof screw cap with a built-in carry loop",
        "750 ml capacity that fits standard car cup holders",
        "Hand wash recommended",
      ],
      bulletsAr: [
        "تحافظ على برودة المشروبات 24 ساعة وسخونتها 12 ساعة بفضل العزل مزدوج الجدار",
        "مصنوعة من ستانلس ستيل 18/8 آمن على الطعام وخالٍ من BPA",
        "غطاء محكم ضد التسريب مع حلقة للحمل",
        "سعة 750 مل تناسب حامل الأكواب في السيارة",
        "يُنصح بالغسل اليدوي",
      ],
      descriptionEn:
        "The Nile Home insulated water bottle holds 750 ml and is built from 18/8 food-grade stainless steel. Double-wall vacuum insulation keeps drinks cold for 24 hours and hot for 12 hours. The screw cap is leak-proof and has a carry loop, and the bottle fits standard car cup holders. BPA-free. Hand wash recommended.",
      descriptionAr:
        "زجاجة المياه الحرارية من Nile Home بسعة 750 مل، مصنوعة من ستانلس ستيل 18/8 آمن على الطعام. العزل مزدوج الجدار يحافظ على برودة المشروبات 24 ساعة وسخونتها 12 ساعة. الغطاء محكم ضد التسريب ومزوّد بحلقة للحمل، والزجاجة تناسب حامل الأكواب في السيارة. خالية من BPA. يُنصح بالغسل اليدوي.",
      searchTerms: "thermos flask metal travel hot cold drinks ترمس مياه",
    },
  },
  "LN-SRM-030": {
    status: "draft",
    content: {
      titleEn: "Vitamin C Brightening Face Serum 30ml With Hyaluronic Acid, Fragrance-Free",
      titleAr: "سيروم فيتامين سي للوجه 30 مل مع حمض الهيالورونيك، خالٍ من العطور",
      bulletsEn: [
        "10% vitamin C combined with hyaluronic acid",
        "Lightweight formula that absorbs quickly",
        "Suitable for all skin types",
        "Free from fragrance and parabens",
        "30 ml glass bottle with a dropper",
      ],
      bulletsAr: [
        "فيتامين سي بتركيز 10% مع حمض الهيالورونيك",
        "تركيبة خفيفة سريعة الامتصاص",
        "مناسب لجميع أنواع البشرة",
        "خالٍ من العطور والبارابين",
        "زجاجة 30 مل مع قطارة",
      ],
      descriptionEn:
        "This vitamin C serum pairs 10% vitamin C with hyaluronic acid in a lightweight formula that absorbs quickly. It is suitable for all skin types and is free from fragrance and parabens. The serum comes in a 30 ml glass bottle with a dropper.",
      descriptionAr:
        "سيروم فيتامين سي يجمع فيتامين سي بتركيز 10% مع حمض الهيالورونيك في تركيبة خفيفة سريعة الامتصاص. مناسب لجميع أنواع البشرة وخالٍ من العطور والبارابين. يأتي السيروم في زجاجة 30 مل مع قطارة.",
      searchTerms: "",
    },
  },
  "DL-PB-20K": {
    status: "approved",
    content: {
      titleEn: "Delta Power Bank 20000mAh, 22.5W Fast Charging Portable Charger with USB-C and 2 USB-A Ports, LED Battery Display",
      titleAr: "باور بانك Delta بسعة 20000 مللي أمبير، شحن سريع 22.5 واط مع منفذ USB-C ومنفذين USB-A وشاشة LED",
      bulletsEn: [
        "20000 mAh capacity",
        "22.5W fast charging output",
        "Two USB-A ports and one USB-C port",
        "LED display shows the remaining battery percentage",
        "Weighs 420 g",
      ],
      bulletsAr: [
        "سعة 20000 مللي أمبير",
        "شحن سريع بقدرة 22.5 واط",
        "منفذان USB-A ومنفذ USB-C",
        "شاشة LED تعرض نسبة البطارية المتبقية",
        "الوزن 420 جرام",
      ],
      descriptionEn:
        "The Delta power bank stores 20000 mAh and delivers 22.5W fast charging. It has two USB-A ports and one USB-C port, and an LED display that shows the remaining battery percentage. It weighs 420 g.",
      descriptionAr:
        "باور بانك Delta بسعة 20000 مللي أمبير مع شحن سريع بقدرة 22.5 واط. مزوّد بمنفذين USB-A ومنفذ USB-C، وشاشة LED تعرض نسبة البطارية المتبقية. الوزن 420 جرام.",
      searchTerms: "external battery pack phone travel type-c شاحن متنقل بطارية خارجية",
    },
  },
};

/** Listings the built-in template engine produces at seed time (engine = "template"). */
const TEMPLATE_LISTINGS: Record<string, string> = { "FT-BLK-50": "published", "PO-NB-A5": "approved", "DL-CH-30": "published" };

type SeedRule = { name: string; nameAr: string; trigger: string; condition?: AutomationCondition; action: string; config?: AutomationConfig };
const RULES: SeedRule[] = [
  { name: "Book a shoot for every new product", nameAr: "احجز تصويراً لكل منتج جديد", trigger: "product_created", action: "create_task", config: { kind: "schedule_shoot", team: "studio", dueDays: 2, whatsapp: true } },
  { name: "Draft the listing when content is ready", nameAr: "جهّز مسودة القائمة عند اكتمال المحتوى", trigger: "stage_entered", condition: { stage: "optimization" }, action: "generate_listing" },
  { name: "Flag weak drafts for fixing", nameAr: "نبّه على المسودات الضعيفة", trigger: "listing_generated", condition: { maxScore: 85 }, action: "create_task", config: { kind: "fix_compliance", team: "content", dueDays: 1 } },
  { name: "Approved listings go to publishing", nameAr: "القوائم المعتمدة تنتقل للنشر", trigger: "listing_approved", action: "move_stage", config: { stage: "publishing" } },
  { name: "Upload once a product reaches publishing", nameAr: "ارفع القائمة عند وصول المنتج للنشر", trigger: "stage_entered", condition: { stage: "publishing" }, action: "create_task", config: { kind: "upload_listing", team: "ops", dueDays: 1 } },
  { name: "Published listings go to account management", nameAr: "القوائم المنشورة تنتقل لإدارة الحساب", trigger: "listing_published", action: "move_stage", config: { stage: "management" } },
  { name: "Check the live listing after publishing", nameAr: "افحص القائمة بعد النشر", trigger: "listing_published", action: "create_task", config: { kind: "verify_live", team: "accounts", dueDays: 2, whatsapp: true } },
  { name: "Offer an upgrade before the plan runs out", nameAr: "اعرض الترقية قبل امتلاء الباقة", trigger: "quota_reached", condition: { pct: 90 }, action: "create_task", config: { kind: "upsell_plan", team: "accounts", dueDays: 2, whatsapp: true } },
  { name: "Chase products stuck for 3 days", nameAr: "تابع المنتجات المتوقفة 3 أيام", trigger: "product_stale", condition: { days: 3 }, action: "create_task", config: { kind: "follow_up", team: "accounts", dueDays: 1 } },
  { name: "Contact every new lead within a day", nameAr: "تواصل مع كل عميل محتمل خلال يوم", trigger: "lead_created", action: "create_task", config: { kind: "contact_lead", team: "sales", dueDays: 1 } },
  { name: "Restock before a product runs out", nameAr: "أعد التزويد قبل نفاد المنتج", trigger: "stock_low", action: "create_task", config: { kind: "restock", team: "accounts", dueDays: 2, whatsapp: true } },
  { name: "Answer negative reviews", nameAr: "ردّ على التقييمات السلبية", trigger: "review_negative", action: "create_task", config: { kind: "reply_review", team: "accounts", dueDays: 1 } },
  { name: "Follow up on returned orders", nameAr: "تابع الطلبات المرتجعة", trigger: "order_returned", action: "create_task", config: { kind: "handle_return", team: "ops", dueDays: 2 } },
];

export async function seed(): Promise<void> {
  const clientIds = new Map<string, number>();
  for (const c of CLIENTS) {
    const plan = PLANS[c.plan];
    const [row] = await db
      .insert(clients)
      .values({
        name: c.name,
        contactName: c.contact,
        phone: FLOW_LINE,
        plan: c.plan,
        marketplaces: c.markets,
        quota: plan.quota,
        monthlyFee: plan.fee,
        commissionPct: plan.pct,
        status: c.status ?? "active",
      })
      .returning({ id: clients.id });
    clientIds.set(c.name, row.id);
  }

  await db.insert(automations).values(
    RULES.map((r) => ({ name: r.name, nameAr: r.nameAr, trigger: r.trigger, condition: r.condition ?? {}, action: r.action, config: r.config ?? {} })),
  );

  const intake: { id: number; clientId: number }[] = [];
  const bySku = new Map<string, number>();
  for (const p of PRODUCTS) {
    const clientId = clientIds.get(p.client);
    if (!clientId) continue;
    const [row] = await db
      .insert(products)
      .values({
        clientId,
        name: p.name,
        nameAr: p.nameAr,
        brand: p.client,
        sku: p.sku,
        category: p.category,
        marketplace: p.marketplace,
        stage: p.stage,
        stageEnteredAt: daysAgo(p.age),
        features: p.features.join("\n"),
        featuresAr: p.featuresAr.join("\n"),
        keywords: p.keywords,
        createdAt: daysAgo(p.age + 2),
      })
      .returning();
    bySku.set(p.sku, row.id);
    if (p.stage === "intake") intake.push({ id: row.id, clientId });

    const brief = briefOf(row);
    const sample = SAMPLE_LISTINGS[p.sku];
    if (sample) {
      await db.insert(listings).values({
        ...sample.content,
        productId: row.id,
        marketplace: p.marketplace,
        status: sample.status,
        engine: "sample",
        score: scoreListing(sample.content, p.marketplace, brief),
      });
    }
    const templateStatus = TEMPLATE_LISTINGS[p.sku];
    if (templateStatus) {
      const content = buildTemplateListing(brief, p.marketplace);
      await db.insert(listings).values({
        ...content,
        productId: row.id,
        marketplace: p.marketplace,
        status: templateStatus,
        engine: "template",
        score: scoreListing(content, p.marketplace, brief),
      });
    }
  }

  // Run the real engine for the products sitting in intake, so the first tasks
  // and run-history rows in a fresh workspace come from genuine executions.
  for (const p of intake) {
    await emit("product_created", { productId: p.id, clientId: p.clientId });
  }

  await seedGrowth(clientIds, bySku);
}

// ---------------------------------------------------------------------------
// Sample rows for Orders, Inventory, Keywords, Advertising, Reviews & Health
// and Leads. Everything here is fictional. Order dates are kept inside the
// current month so the month's ad figures and order totals cover one period.
// ---------------------------------------------------------------------------

async function seedGrowth(clientIds: Map<string, number>, bySku: Map<string, number>): Promise<void> {
  const id = (name: string) => clientIds.get(name) ?? 0;
  const month = cairoMonth();
  const monthStart = new Date(`${month}-01T00:00:00+02:00`).getTime() + 3_600_000;
  const orderDate = (n: number) => new Date(Math.min(Date.now() - 60_000, Math.max(daysAgo(n).getTime(), monthStart)));

  // ---- orders
  const order = (client: string, marketplace: Marketplace, orderRef: string, sku: string, item: string, qty: number, amount: number, status: string, days: number) => ({
    clientId: id(client),
    marketplace,
    orderRef,
    sku,
    item,
    qty,
    amount,
    status,
    orderedAt: orderDate(days),
  });
  const charger = "USB-C Wall Charger 30W";
  const blocks = "Wooden Building Blocks 50 Pieces";
  await db.insert(orders).values([
    order("Delta", "amazon", "ORD-1001", "DL-CBL-1M", "USB-C Cable 1m", 2, 198, "delivered", 14),
    order("Delta", "amazon", "ORD-1002", "DL-CH-30", charger, 2, 598, "delivered", 9),
    order("Delta", "amazon", "ORD-1003", "DL-CH-30", charger, 1, 299, "delivered", 8),
    order("Delta", "amazon", "ORD-1004", "DL-CH-30", charger, 1, 299, "returned", 7),
    order("Delta", "amazon", "ORD-1005", "DL-CH-30", charger, 3, 897, "delivered", 6),
    order("Delta", "amazon", "ORD-1006", "DL-CH-30", charger, 1, 299, "cancelled", 5),
    order("Delta", "amazon", "ORD-1007", "DL-CH-30", charger, 4, 1196, "shipped", 4),
    order("Delta", "amazon", "ORD-1008", "DL-CH-30", charger, 5, 1495, "shipped", 2),
    order("Delta", "amazon", "ORD-1009", "DL-CH-30", charger, 2, 598, "processing", 1),
    order("Delta", "amazon", "ORD-1010", "DL-CH-30", charger, 1, 299, "new", 0),
    order("Farha Toys", "amazon", "ORD-1011", "FT-BLK-50", blocks, 1, 449, "delivered", 11),
    order("Farha Toys", "amazon", "ORD-1012", "FT-BLK-50", blocks, 2, 898, "delivered", 5),
    order("Farha Toys", "amazon", "ORD-1013", "FT-BLK-50", blocks, 1, 449, "shipped", 1),
    order("Luna", "noon", "ORD-1014", "LN-CLN-150", "Gentle Face Cleanser 150ml", 1, 245, "delivered", 13),
    order("Luna", "noon", "ORD-1015", "LN-CLN-150", "Gentle Face Cleanser 150ml", 2, 490, "shipped", 3),
    order("Papyrus Office", "shopify", "ORD-1016", "PO-STK-100", "Sticky Notes 100 Sheets", 6, 270, "delivered", 16),
    order("Papyrus Office", "shopify", "ORD-1017", "PO-STK-100", "Sticky Notes 100 Sheets", 4, 180, "new", 0),
  ]);

  // ---- stock counts for the two live products
  const chargerId = bySku.get("DL-CH-30");
  const blocksId = bySku.get("FT-BLK-50");
  if (chargerId) await db.update(products).set({ stock: 40, reorderPoint: 25, stockAt: daysAgo(10) }).where(eq(products.id, chargerId));
  if (blocksId) await db.update(products).set({ stock: 60, reorderPoint: 15, stockAt: daysAgo(12) }).where(eq(products.id, blocksId));

  // ---- keywords with rank history
  const keyword = (client: string, sku: string, text: string, checks: [days: number, rank: number][]) => ({
    clientId: id(client),
    productId: bySku.get(sku) ?? null,
    marketplace: "amazon",
    keyword: text,
    checks: checks.map(([days, rank]) => ({ at: daysAgo(days).toISOString(), rank })),
  });
  await db.insert(keywords).values([
    keyword("Delta", "DL-CH-30", "usb c charger", [[21, 34], [14, 28], [7, 19], [1, 14]]),
    keyword("Delta", "DL-CH-30", "30w charger", [[21, 22], [14, 20], [7, 21], [1, 18]]),
    keyword("Delta", "DL-CH-30", "شاحن سريع", [[14, 40], [7, 31], [1, 18]]),
    keyword("Delta", "DL-CH-30", "gan charger", []),
    keyword("Farha Toys", "FT-BLK-50", "wooden blocks", [[21, 12], [14, 9], [7, 8], [1, 7]]),
    keyword("Farha Toys", "FT-BLK-50", "building blocks", [[21, 55], [14, 48], [1, 51]]),
    keyword("Farha Toys", "FT-BLK-50", "montessori toys", [[7, 96]]),
  ]);

  // ---- advertising: this month and last month
  const campaign = (client: string, marketplace: Marketplace, name: string, when: string, budget: number, spend: number, sales: number, clicks: number, impressions: number, sold: number) => ({
    clientId: id(client),
    marketplace,
    name,
    month: when,
    budget,
    spend,
    sales,
    clicks,
    impressions,
    orders: sold,
  });
  const last = prevMonth(month);
  await db.insert(adCampaigns).values([
    campaign("Delta", "amazon", "SP · Chargers · Exact", month, 600, 420, 2390, 138, 6100, 8),
    campaign("Delta", "amazon", "SP · Chargers · Auto", month, 400, 310, 598, 122, 8900, 2),
    campaign("Farha Toys", "amazon", "SP · Wooden Blocks", month, 300, 190, 898, 64, 2900, 2),
    campaign("Luna", "noon", "Noon Ads · Cleanser", month, 200, 120, 245, 41, 2300, 1),
    campaign("Delta", "amazon", "SP · Chargers · Exact", last, 600, 560, 2690, 171, 7400, 9),
    campaign("Farha Toys", "amazon", "SP · Wooden Blocks", last, 300, 210, 1347, 70, 3100, 3),
  ]);

  // ---- account health
  await db.insert(healthChecks).values([
    { clientId: id("Delta"), marketplace: "amazon", odr: 0.4, lateShipment: 2.1, cancelRate: 0.8, validTracking: 98.2, violations: 0, checkedAt: daysAgo(2) },
    { clientId: id("Farha Toys"), marketplace: "amazon", odr: 0.7, lateShipment: 5.2, cancelRate: 1.1, validTracking: 96.4, violations: 1, checkedAt: daysAgo(3) },
  ]);

  // ---- reviews
  const review = async (client: string, sku: string | null, marketplace: Marketplace, rating: number, body: string, author: string, days: number, status = "new", reply = "") => {
    const [row] = await db
      .insert(reviews)
      .values({ clientId: id(client), productId: sku ? (bySku.get(sku) ?? null) : null, marketplace, rating, body, author, status, reply, reviewedAt: daysAgo(days) })
      .returning({ id: reviews.id });
    return row.id;
  };
  await review("Delta", "DL-CH-30", "amazon", 5, "شحن سريع فعلاً وحجمه صغير مناسب للسفر.", "Ahmed", 9);
  await review("Farha Toys", "FT-BLK-50", "amazon", 5, "My son plays with them every day. The edges are smooth.", "Heba", 8);
  await review("Delta", "DL-CH-30", "amazon", 4, "Charges my phone fast. It gets a little warm after an hour.", "Sara M.", 6);
  await review(
    "Farha Toys",
    "FT-BLK-50",
    "amazon",
    3,
    "Good quality, but the pieces are smaller than I expected.",
    "Omar K.",
    4,
    "replied",
    "Thank you for taking the time to review. The piece sizes are listed in the product details, and we are adding a size photo to make them easier to judge.",
  );
  const openBox = await review("Delta", "DL-CH-30", "amazon", 2, "الشاحن وصل والعلبة مفتوحة.", "Mostafa", 2);
  const lateDelivery = await review("Luna", null, "noon", 1, "المنتج وصل متأخر أسبوع عن الموعد.", "Nour", 1);

  // ---- leads (the phone is FLOW's own public line, so a WhatsApp link can never reach a stranger)
  const lead = (name: string, platform: string, productsCount: string, service: string, message: string, source: string, status: string, hours: number) => ({
    name,
    email: `${name.split(" ")[0].toLowerCase()}@example.com`,
    phone: FLOW_LINE,
    platform,
    productsCount,
    service,
    message,
    source,
    status,
    createdAt: new Date(Date.now() - hours * 3_600_000),
  });
  await db.insert(leads).values([
    lead("Dina Nabil", "TikTok Shop", "25", "Full Content (photography + listing)", "We sell handmade soap and want product photos and listings for TikTok Shop.", "whatsapp", "won", 216),
    lead("Tarek Samir", "Amazon", "300", "Scale plan — 400 products / month", "عندنا كتالوج أدوات منزلية كبير ومحتاجين إدارة كاملة للحساب.", "referral", "proposal", 144),
    lead("Rana Fouad", "Shopify", "15", "Photography only", "Need white-background photos for a jewellery store.", "instagram", "contacted", 72),
    lead("Youssef Hamdy", "Noon", "120", "Growth plan — 150 products / month", "We have 120 phone accessories to list on Noon. What is the timeline?", "website", "new", 26),
    lead("Mona Adel", "Amazon", "40", "Starter plan — 50 products / month", "عندنا شموع معطرة ومحتاجين تصوير ورفع على أمازون.", "website", "new", 2),
  ]);

  // ---- let the real workflow engine react to the sample events
  if (chargerId) await checkStock(chargerId);
  await emit("order_returned", { clientId: id("Delta"), detail: `ORD-1004 · ${charger}` });
  await emit("review_negative", { clientId: id("Delta"), productId: chargerId, detail: `review #${openBox}, 2 of 5 on Amazon` });
  await emit("review_negative", { clientId: id("Luna"), detail: `review #${lateDelivery}, 1 of 5 on Noon` });
  await emit("lead_created", { detail: "Youssef Hamdy" });
  await emit("lead_created", { detail: "Mona Adel" });
}
