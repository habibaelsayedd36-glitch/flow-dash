"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Loader2, Search, Sparkles, WandSparkles } from "lucide-react";
import { bulkGenerateListingsAction, saveBrandVoiceAction } from "@/app/actions";
import { askCommerceAssistantAction, saveResearchKeywordsAction } from "@/app/actions-growth";
import { MARKETPLACES, MARKETPLACE_META } from "@/lib/catalog";

type Listing = { id: number; productName: string; clientName: string; marketplace: string; status: string; score: number; engine: string };
type Product = { id: number; name: string; sku: string; marketplace: string; stage: string; clientName: string; listingId: number | null };

const modules = [
  { title: "Product Master Catalog", desc: "ملف موحد لكل منتج وبياناته ومراحله.", href: "/pipeline", tag: "Catalog" },
  { title: "Smart Excel Import", desc: "استيراد الشيتات ومعالجة الصفوف الناقصة والمحتوى بالجملة.", href: "/tools/listing", tag: "Import" },
  { title: "Bulk AI Actions", desc: "ابدئي من قوائم المنتجات والـ Listing Studio لتنفيذ التعديلات على دفعات.", href: "/listings", tag: "Bulk" },
  { title: "Publishing Pipeline", desc: "متابعة كل منتج من الاستيراد والمراجعة حتى حالة النشر.", href: "/pipeline", tag: "Workflow" },
  { title: "Team Tasks & Approvals", desc: "توزيع المهام ومراجعة واعتماد المحتوى.", href: "/tasks", tag: "Team" },
  { title: "Performance Dashboard", desc: "مبيعات وطلبات ومخزون ومراجعات من البيانات المسجلة أو المستوردة.", href: "/orders", tag: "Analytics" },
  { title: "AI Product Photographer", desc: "إنشاء مشاهد إعلانية وتنظيف الصور وزوايا إضافية.", href: "/tools/cleanup", tag: "Creative" },
  { title: "Smart Localization", desc: "إنشاء نسخ عربية وإنجليزية منفصلة من خلال Listing Studio.", href: "/studio", tag: "Localization" },
  { title: "Keyword Research Studio", desc: "إدارة الكلمات المفتاحية ومراجعة تغطيتها وترتيبها المسجل.", href: "/keywords", tag: "SEO" },
];

export function IntelligenceStudio({ listings, products, initialBrandVoice }: { listings: Listing[]; products: Product[]; initialBrandVoice: string }) {
  const [competitor, setCompetitor] = useState("");
  const [ownCopy, setOwnCopy] = useState("");
  const [brandVoice, setBrandVoice] = useState(initialBrandVoice);
  const [saved, setSaved] = useState(false);
  const [savingVoice, setSavingVoice] = useState(false);
  const [assistantQuestion, setAssistantQuestion] = useState("");
  const [assistantAnswer, setAssistantAnswer] = useState("");
  const [assistantError, setAssistantError] = useState("");
  const [assistantPending, setAssistantPending] = useState(false);
  const [researchProductId, setResearchProductId] = useState<number>(products[0]?.id ?? 0);
  const [savingKeywords, setSavingKeywords] = useState(false);
  const [keywordSaveMessage, setKeywordSaveMessage] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [bulkMarketplace, setBulkMarketplace] = useState("amazon");
  const [bulkResults, setBulkResults] = useState<Array<{ productId: number; productName: string; listingId?: number; engine?: string; aiError?: string; error?: string }> | null>(null);
  const [pending, startTransition] = useTransition();

  function runBulkGeneration() {
    if (!selectedProducts.length || pending) return;
    startTransition(async () => {
      const result = await bulkGenerateListingsAction(selectedProducts, bulkMarketplace);
      setBulkResults(result.results);
      setSelectedProducts([]);
    });
  }

  const comparison = useMemo(() => {
    const stop = new Set(["the","and","for","with","from","this","that","your","you","are","was","has","have","can","will","our","its","into","all","new","best","more","than","per","use","used","the","من","في","على","الى","إلى","عن","مع","هذا","هذه","ذلك","تلك","هو","هي","و","او","أو","منها","عند","بعد","قبل","كما","كل","تم","يتم","ذات","لدى"]);
    const normalize = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\u064B-\u065F\u0670ـ]/g, "");
    const tokenize = (s: string) => (normalize(s).match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 2 && !stop.has(w));
    const theirTokens = tokenize(competitor);
    const ownTokens = new Set(tokenize(ownCopy));
    const counts = new Map<string, number>();
    for (const word of theirTokens) counts.set(word, (counts.get(word) ?? 0) + 1);
    const shared = [...counts.keys()].filter((w) => ownTokens.has(w));
    const missing = [...counts.entries()].filter(([w]) => !ownTokens.has(w)).sort((a,b) => b[1]-a[1]).map(([word,count]) => ({word,count}));
    const phraseCounts = new Map<string, number>();
    for (let i=0;i<theirTokens.length-1;i++) {
      const phrase = theirTokens[i] + " " + theirTokens[i+1];
      if (!ownCopy || !normalize(ownCopy).includes(phrase)) phraseCounts.set(phrase,(phraseCounts.get(phrase) ?? 0)+1);
    }
    const phrases = [...phraseCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([phrase,count])=>({phrase,count}));
    const total = counts.size;
    return { total, shared, missing, phrases, coverage: total ? Math.round((shared.length/total)*100) : 0 };
  }, [competitor, ownCopy]);

  async function saveResearchKeywords() {
    if (!researchProductId || savingKeywords) return;
    const candidates = comparison.phrases.slice(0,15).map((x) => x.phrase);
    const fallback = comparison.missing.slice(0,15).map((x) => x.word);
    const selected = candidates.length ? candidates : fallback;
    if (!selected.length) { setKeywordSaveMessage("Paste competitor text to discover keyword candidates first."); return; }
    setSavingKeywords(true);
    setKeywordSaveMessage("");
    try {
      const product = products.find((p) => p.id === researchProductId);
      const result = await saveResearchKeywordsAction(researchProductId, product?.marketplace ?? "amazon", selected);
      setKeywordSaveMessage(result.ok ? `Added ${result.added} keywords to the tracker.` : (result.error ?? "Could not save keywords."));
    } catch {
      setKeywordSaveMessage("Could not save keywords. Please try again.");
    } finally {
      setSavingKeywords(false);
    }
  }

  async function askAssistant() {
    if (!assistantQuestion.trim() || assistantPending) return;
    setAssistantPending(true);
    setAssistantError("");
    setAssistantAnswer("");
    try {
      const result = await askCommerceAssistantAction(assistantQuestion);
      if (result.ok) setAssistantAnswer(result.answer ?? "");
      else setAssistantError(result.error ?? "تعذر تنفيذ الطلب.");
    } catch {
      setAssistantError("حصل خطأ أثناء الاتصال. حاولي مرة تانية.");
    } finally {
      setAssistantPending(false);
    }
  }

  async function saveVoice() {
    if (!brandVoice.trim() || savingVoice) return;
    setSavingVoice(true);
    try {
      const result = await saveBrandVoiceAction(brandVoice);
      setSaved(result.ok);
    } catch {
      setSaved(false);
    } finally {
      setSavingVoice(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((m) => (
          <Link key={m.title} href={m.href} className="card group flex min-h-36 flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-md">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-flow-green-light">{m.tag}</span>
            <span className="mt-2 font-display text-base font-bold text-foreground">{m.title}</span>
            <span className="mt-1 flex-1 text-sm leading-relaxed text-muted-foreground">{m.desc}</span>
            <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-flow-green">Open module <ArrowRight size={15} /></span>
          </Link>
        ))}
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
          <div><h2 className="h-section">Bulk AI Listing Generation</h2><p className="mt-1 text-sm text-muted-foreground">اختاري حتى 25 منتجًا في كل دفعة لإنشاء Listing لكل منتج باستخدام مزود الذكاء الاصطناعي المتصل. أي fallback إلى template سيظهر بوضوح.</p></div>
          <span className="pill pill-mute">{selectedProducts.length}/25 selected</span>
        </div>
        <div className="flex flex-wrap items-end gap-3 p-5">
          <div className="min-w-48 flex-1">
            <label className="label" htmlFor="bulk-marketplace">Target marketplace</label>
            <select id="bulk-marketplace" className="field" value={bulkMarketplace} onChange={(e) => setBulkMarketplace(e.target.value)}>
              {MARKETPLACES.map((m) => <option key={m} value={m}>{MARKETPLACE_META[m].label}</option>)}
            </select>
          </div>
          <button type="button" className="btn btn-primary" disabled={!selectedProducts.length || pending} onClick={runBulkGeneration}>
            {pending ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {pending ? "Generating…" : "Generate selected listings"}
          </button>
          <button type="button" className="btn btn-ghost" disabled={!selectedProducts.length || pending} onClick={() => setSelectedProducts([])}>Clear selection</button>
        </div>
        <div className="max-h-80 divide-y divide-border overflow-y-auto">
          {products.length ? products.slice(0, 100).map((p) => {
            const checked = selectedProducts.includes(p.id);
            const disabled = !checked && selectedProducts.length >= 25;
            return <label key={p.id} className="flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-muted">
              <input type="checkbox" checked={checked} disabled={disabled || pending} onChange={(e) => setSelectedProducts((old) => e.target.checked ? [...old, p.id] : old.filter((id) => id !== p.id))} />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="block text-xs text-muted-foreground">{p.clientName} · {p.sku || "No SKU"}</span></span>
              <span className="pill pill-mute">{p.stage}</span>
            </label>;
          }) : <p className="p-5 text-sm text-muted-foreground">Add products to the catalog first.</p>}
        </div>
        {bulkResults && <div className="border-t border-border p-5">
          <p className="mb-3 text-sm font-semibold">Latest batch results</p>
          <div className="space-y-2">{bulkResults.map((r) => <div key={r.productId} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{r.productName}</span>
            {r.error ? <span className="pill pill-bad">Failed</span> : r.engine === "ai" ? <span className="pill pill-ok">AI generated</span> : <span className="pill pill-warn">Template fallback</span>}
            {r.listingId && <Link href={`/listings/${r.listingId}`} className="font-medium text-flow-green hover:underline">Review</Link>}
            {r.aiError && <span className="w-full text-xs text-amber-700">{r.aiError}</span>}
          </div>)}</div>
        </div>}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="card p-5 sm:p-6">
          <div className="flex items-center gap-2"><Search size={18} /><h2 className="h-section">Competitor Intelligence & Keyword Gap</h2></div>
          <p className="mt-2 text-sm text-muted-foreground">الصقي محتوى المنافس كما يظهر في صفحة المنتج، ثم قارنيه بصفحتك. FLOW يستخرج تكرار الكلمات والعبارات والفجوات من النص فقط؛ لا يعرض Search Volume أو مبيعات غير متاحة.</p>
          <label className="label mt-5" htmlFor="competitor-copy">Competitor listing (title, bullets, description)</label>
          <textarea id="competitor-copy" className="field min-h-36" value={competitor} onChange={(e) => setCompetitor(e.target.value)} placeholder="Paste competitor title, bullet points and description…" />
          <label className="label mt-4" htmlFor="own-copy">Your listing</label>
          <textarea id="own-copy" className="field min-h-28" value={ownCopy} onChange={(e) => setOwnCopy(e.target.value)} placeholder="Paste your title, bullets and description…" />
          {competitor.trim() && (
            <>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-secondary/60 p-3"><span className="block text-xs text-muted-foreground">Unique terms</span><strong className="num text-xl">{comparison.total}</strong></div>
                <div className="rounded-xl bg-secondary/60 p-3"><span className="block text-xs text-muted-foreground">Shared terms</span><strong className="num text-xl">{comparison.shared.length}</strong></div>
                <div className="rounded-xl bg-secondary/60 p-3"><span className="block text-xs text-muted-foreground">Coverage</span><strong className="num text-xl">{ownCopy.trim() ? `${comparison.coverage}%` : "—"}</strong></div>
              </div>
              <div className="mt-4">
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold">Keyword gaps to review</p><span className="pill pill-warn">{comparison.missing.length} terms</span></div>
                <div className="mt-2 flex flex-wrap gap-2">{comparison.missing.slice(0,20).map((x) => <span key={x.word} className="pill pill-warn">{x.word}{x.count > 1 ? ` · ${x.count}×` : ""}</span>)}</div>
              </div>
              <div className="mt-4">
                <p className="text-sm font-semibold">Candidate phrases</p>
                <div className="mt-2 flex flex-wrap gap-2">{comparison.phrases.slice(0,15).map((x) => <span key={x.phrase} className="pill pill-mute">{x.phrase}{x.count > 1 ? ` · ${x.count}×` : ""}</span>)}</div>
              </div>
              <div className="mt-5 border-t border-border pt-4">
                <label className="label" htmlFor="research-product">Save candidates to product keyword tracker</label>
                <select id="research-product" className="field" value={researchProductId || ""} onChange={(e) => setResearchProductId(Number(e.target.value))}>
                  <option value="">Choose a product</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.clientName} — {p.name}</option>)}
                </select>
                <button type="button" className="btn btn-primary mt-3" disabled={!researchProductId || savingKeywords || (!comparison.phrases.length && !comparison.missing.length)} onClick={() => void saveResearchKeywords()}>
                  {savingKeywords ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                  {savingKeywords ? "Saving…" : "Save keyword candidates"}
                </button>
                {keywordSaveMessage && <p role="status" className="mt-2 text-sm text-muted-foreground">{keywordSaveMessage}</p>}
              </div>
            </>
          )}
        </div>

        <div className="card p-5 sm:p-6">
          <div className="flex items-center gap-2"><WandSparkles size={18} /><h2 className="h-section">Brand Voice Profile</h2></div>
          <p className="mt-2 text-sm text-muted-foreground">اكتبي قواعد نبرة البراند: رسمي أو ودود، كلمات ممنوعة، الجمهور المستهدف، وطريقة كتابة أسماء المنتجات. تُحفظ في قاعدة بيانات FLOW.</p>
          <label className="label mt-5" htmlFor="brand-voice">Brand voice instructions</label>
          <textarea id="brand-voice" className="field min-h-40" value={brandVoice} onChange={(e) => { setBrandVoice(e.target.value); setSaved(false); }} placeholder="Example: Clear, confident and helpful. Avoid exaggerated claims. Keep technical specifications exact…" />
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={saveVoice} disabled={!brandVoice.trim() || savingVoice}>{savingVoice ? "Saving…" : "Save profile"}</button>
            {saved && <span className="inline-flex items-center gap-1 text-sm text-flow-green"><CheckCircle2 size={16} /> Saved in this browser</span>}
          </div>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <div className="flex items-center gap-2"><Sparkles size={18} /><h2 className="h-section">FLOW AI Assistant</h2></div>
        <p className="mt-2 text-sm text-muted-foreground">اسألي عن حالة الشغل والأرقام المسجلة في الداش. المساعد بيستخدم Snapshot من بيانات FLOW، ومش بيدّعي إنه متصل Live بحسابات الـ Marketplaces.</p>
        <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); void askAssistant(); }}>
          <textarea className="field min-h-24" value={assistantQuestion} onChange={(e) => setAssistantQuestion(e.target.value)} placeholder="مثال: إيه أولويات الشغل عندنا بناءً على الداتا الموجودة؟" />
          <button type="submit" className="btn btn-primary" disabled={!assistantQuestion.trim() || assistantPending}>
            {assistantPending ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {assistantPending ? "Thinking…" : "Ask FLOW"}
          </button>
        </form>
        {assistantError && <p role="alert" className="mt-3 text-sm text-danger">{assistantError}</p>}
        {assistantAnswer && <div className="mt-4 whitespace-pre-wrap rounded-2xl bg-secondary/60 p-4 text-sm leading-relaxed">{assistantAnswer}</div>}
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
          <div><h2 className="h-section">Listing Quality Audit</h2><p className="mt-1 text-sm text-muted-foreground">الدرجات المسجلة من فحص قواعد الـ Marketplace داخل FLOW، وليست تقييمًا للمبيعات.</p></div>
          <Link href="/listings" className="btn btn-ghost">All listings <ArrowRight size={15} /></Link>
        </div>
        {listings.length ? <div className="divide-y divide-border">{listings.slice(0, 12).map((l) => <div key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{l.productName}</p><p className="text-xs text-muted-foreground">{l.clientName} · {l.marketplace} · {l.engine}</p></div><span className={`pill ${l.score >= 80 ? "pill-ok" : l.score >= 60 ? "pill-warn" : "pill-bad"}`}>{l.score}/100</span><Link className="text-sm font-medium text-flow-green hover:underline" href={`/listings/${l.id}`}>Review</Link></div>)}</div> : <p className="p-5 text-sm text-muted-foreground">No saved listings to audit yet.</p>}
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5"><div><h2 className="h-section">Catalog Health Check</h2><p className="mt-1 text-sm text-muted-foreground">فحص سريع للمنتجات المسجلة لاكتشاف التكرار والبيانات الأساسية الناقصة.</p></div><Link href="/pipeline" className="btn btn-ghost">Open catalog <ArrowRight size={15} /></Link></div>
        {products.length ? <div className="divide-y divide-border">{products.slice(0, 15).map((p) => { const duplicate = p.sku && products.some((x) => x.id !== p.id && x.sku.toLowerCase() === p.sku.toLowerCase()); const missing = [!p.sku && "SKU", !p.listingId && "Listing"].filter(Boolean) as string[]; return <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{p.name}</p><p className="text-xs text-muted-foreground">{p.clientName} · {p.sku || "No SKU"}</p></div>{duplicate && <span className="pill pill-bad">Duplicate SKU</span>}{missing.map((x) => <span key={x} className="pill pill-warn">Missing {x}</span>)}{!duplicate && !missing.length && <span className="pill pill-ok">Basic checks passed</span>}</div>})}</div> : <p className="p-5 text-sm text-muted-foreground">No products in the catalog yet.</p>}
      </section>
    </div>
  );
}
