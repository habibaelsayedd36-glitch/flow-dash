"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Loader2, Search, Sparkles, WandSparkles } from "lucide-react";
import { bulkGenerateListingsAction, saveBrandVoiceAction } from "@/app/actions";
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
    const words = (s: string) => Array.from(new Set((s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length > 3)));
    const theirs = words(competitor);
    const ours = new Set(words(ownCopy));
    const shared = theirs.filter((w) => ours.has(w));
    const missing = theirs.filter((w) => !ours.has(w));
    return { total: theirs.length, shared, missing: missing.slice(0, 30) };
  }, [competitor, ownCopy]);

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
          <div className="flex items-center gap-2"><Search size={18} /><h2 className="h-section">Competitor Listing Analyzer</h2></div>
          <p className="mt-2 text-sm text-muted-foreground">الصقي نص Listing المنافس ونص منتجك. الأداة تقارن الكلمات الظاهرة فقط؛ لا تدّعي تحليل ترتيب أو مبيعات المنافس.</p>
          <label className="label mt-5" htmlFor="competitor-copy">Competitor listing text</label>
          <textarea id="competitor-copy" className="field min-h-28" value={competitor} onChange={(e) => setCompetitor(e.target.value)} placeholder="Paste competitor title, bullets and description…" />
          <label className="label mt-4" htmlFor="own-copy">Your listing text</label>
          <textarea id="own-copy" className="field min-h-28" value={ownCopy} onChange={(e) => setOwnCopy(e.target.value)} placeholder="Paste your listing…" />
          {(competitor.trim() || ownCopy.trim()) && (
            <div className="mt-4 rounded-2xl bg-secondary/60 p-4">
              <p className="text-sm font-semibold">Keyword coverage comparison</p>
              <p className="mt-1 text-sm text-muted-foreground">{comparison.shared.length} of {comparison.total} distinct competitor terms (over 3 characters) also appear in your text.</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Terms to review</p>
              <div className="mt-2 flex flex-wrap gap-2">{comparison.missing.length ? comparison.missing.map((w) => <span key={w} className="pill pill-warn">{w}</span>) : <span className="text-sm text-muted-foreground">No missing terms detected in the pasted text.</span>}</div>
            </div>
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
