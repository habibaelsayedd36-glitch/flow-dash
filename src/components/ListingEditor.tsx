"use client";

import { ArrowLeft, Check, Copy, Info, Loader2, Plus, RefreshCw, Sparkles, Trash2, X, Zap } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { regenerateListingAction, saveListingAction, setListingStatusAction } from "@/app/actions";
import { MARKETPLACES, MARKETPLACE_META, TONES, isMarketplace, type Marketplace } from "@/lib/catalog";
import { dictFor, label, tpl, type Locale } from "@/lib/i18n";
import { RULES, byteLength, checkListing, scoreOf, type ListingContent } from "@/lib/rules";
import { MarketBadge, StatusPill, pname } from "./ui";

type Meta = { marketplace: string; status: string; engine: string; model: string | null; edited: boolean; tone: string };
type ProductInfo = { name: string; nameAr: string; brand: string; features: string; featuresAr: string; keywords: string; clientName: string };

function Counter({ n, max }: { n: number; max: number | null }) {
  return (
    <span dir="ltr" className={`num text-xs ${max !== null && n > max ? "font-semibold text-danger" : "text-mute"}`}>
      {max === null ? n : `${n}/${max}`}
    </span>
  );
}

function TextField(props: {
  id: string;
  lang: "en" | "ar" | "mixed";
  labelText: string;
  hideLabel?: boolean;
  value: string;
  onChange: (v: string) => void;
  rows: number;
  max: number | null;
  count?: number;
}) {
  const { id, lang, labelText, hideLabel, value, onChange, rows, max, count } = props;
  return (
    <div className="min-w-0">
      <div className={`mb-1.5 flex items-center gap-2 ${hideLabel ? "justify-end" : "justify-between"}`}>
        <label htmlFor={id} className={hideLabel ? "sr-only" : "label !mb-0"}>{labelText}</label>
        <Counter n={count ?? value.length} max={max} />
      </div>
      <textarea
        id={id}
        className="field"
        rows={rows}
        value={value}
        lang={lang === "mixed" ? undefined : lang}
        dir={lang === "mixed" ? "auto" : lang === "ar" ? "rtl" : "ltr"}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const c = 2 * Math.PI * 24;
  const color = score >= 90 ? "#2e6b45" : score >= 70 ? "#c98a1b" : "#c0392b";
  return (
    <span className="relative grid size-16 shrink-0 place-items-center" aria-hidden>
      <svg viewBox="0 0 56 56" className="absolute inset-0 -rotate-90">
        <circle cx="28" cy="28" r="24" fill="none" stroke="#eaf1de" strokeWidth="5" />
        <circle
          cx="28" cy="28" r="24" fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)}
          style={{ transition: "stroke-dashoffset 400ms ease, stroke 400ms ease" }}
        />
      </svg>
      <span className="num text-lg font-semibold text-ink">{score}</span>
    </span>
  );
}

export function ListingEditor(props: {
  locale: Locale;
  listingId: number;
  initial: ListingContent;
  meta: Meta;
  product: ProductInfo;
  aiModel: string | null;
  aiError: string | null;
}) {
  const { locale, listingId, initial, meta, product, aiModel } = props;
  const t = dictFor(locale);
  const [content, setContent] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [marketplace, setMarketplace] = useState<Marketplace>(isMarketplace(meta.marketplace) ? meta.marketplace : "amazon");
  const [status, setStatus] = useState(meta.status);
  const [origin, setOrigin] = useState({ engine: meta.engine, model: meta.model, edited: meta.edited });
  const [brief, setBrief] = useState({ features: product.features, featuresAr: product.featuresAr, keywords: product.keywords, tone: meta.tone, notes: "", market: marketplace as string });
  const [aiError, setAiError] = useState(props.aiError);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "regen" | "status">("");
  const [copied, setCopied] = useState(false);

  const rule = RULES[marketplace];
  const checks = useMemo(
    () => checkListing(content, marketplace, { brand: product.brand, keywords: brief.keywords }),
    [content, marketplace, product.brand, brief.keywords],
  );
  const score = scoreOf(checks);
  const passed = checks.filter((c) => c.pass).length;
  const sorted = useMemo(() => [...checks].sort((a, b) => Number(a.pass) - Number(b.pass) || (a.severity === "error" ? -1 : 1) - (b.severity === "error" ? -1 : 1)), [checks]);
  const dirty = JSON.stringify(content) !== JSON.stringify(saved);
  const rows = Math.min(rule.bullets, Math.max(content.bulletsEn.length, content.bulletsAr.length, 1));

  const patch = (p: Partial<ListingContent>) => setContent((c) => ({ ...c, ...p }));
  const setBullet = (key: "bulletsEn" | "bulletsAr", i: number, v: string) =>
    setContent((c) => {
      const next = Array.from({ length: Math.max(rows, c[key].length) }, (_, k) => c[key][k] ?? "");
      next[i] = v;
      return { ...c, [key]: next };
    });
  const removeBullet = (i: number) =>
    setContent((c) => ({ ...c, bulletsEn: c.bulletsEn.filter((_, k) => k !== i), bulletsAr: c.bulletsAr.filter((_, k) => k !== i) }));
  const addBullet = () =>
    setContent((c) => {
      const pad = (a: string[]) => [...Array.from({ length: rows }, (_, k) => a[k] ?? ""), ""];
      return { ...c, bulletsEn: pad(c.bulletsEn), bulletsAr: pad(c.bulletsAr) };
    });

  const persist = async (): Promise<string | null> => {
    try {
      const res = await saveListingAction(listingId, content);
      if (res.ok) {
        setSaved(content);
        setOrigin((o) => ({ ...o, edited: true }));
        return null;
      }
      return res.error || t.common.failed;
    } catch (error) {
      return error instanceof Error ? error.message : t.common.failed;
    }
  };

  const save = async () => {
    setBusy("save");
    const error = await persist();
    setBusy("");
    setNotice(error || t.editor.saved);
  };

  const changeStatus = async (next: string) => {
    setBusy("status");
    if (dirty) {
      const saveError = await persist();
      if (saveError) {
        setBusy("");
        setNotice(saveError);
        return;
      }
    }
    const res = await setListingStatusAction(listingId, next);
    setBusy("");
    if (!res.ok) return setNotice(res.error || t.common.failed);
    setStatus(next);
    setNotice(res.ran > 0 ? `${label(t.listingStatus, next)} · ${tpl(t.editor.ran, { n: res.ran })}` : label(t.listingStatus, next));
  };

  const regenerate = async () => {
    setBusy("regen");
    let res: Awaited<ReturnType<typeof regenerateListingAction>>;
    try {
      res = await regenerateListingAction(listingId, { features: brief.features, featuresAr: brief.featuresAr, keywords: brief.keywords, marketplace: brief.market, tone: brief.tone, notes: brief.notes });
    } catch (error) {
      setBusy("");
      return setNotice(error instanceof Error ? error.message : t.common.failed);
    }
    setBusy("");
    if (!res.ok) return setNotice(res.error || t.common.failed);
    setContent(res.content);
    setSaved(res.content);
    if (isMarketplace(res.marketplace)) setMarketplace(res.marketplace);
    setOrigin({ engine: res.engine, model: res.model, edited: false });
    setStatus("draft");
    setAiError(res.aiError);
    setNotice(res.ran > 0 ? tpl(t.editor.ran, { n: res.ran }) : "");
  };

  const autoFixCompliance = async () => {
    setBusy("regen");
    setNotice("");
    let nextContent = content;
    let nextResult: Awaited<ReturnType<typeof regenerateListingAction>> | null = null;
    let remaining = checks.filter((c) => !c.pass);

    // Give the model up to three attempts, feeding it the exact checks that still fail.
    // Without a connected provider, regenerateListingAction uses FLOW's built-in
    // deterministic template engine. Run it once; AI providers may refine up to 3 times.
    const maxAttempts = aiModel ? 3 : 1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const correctionNotes = remaining.length
        ? `Automatically fix every failed marketplace compliance check: ${remaining.map((c) => `${t.check[c.id]} ${c.detail ? `(${c.detail})` : ""}`).join("; ")}. Keep all claims strictly grounded in the product facts. Ensure English and Arabic bullets match one-to-one.`
        : "Create a fully marketplace-compliant bilingual listing using only the supplied product facts.";
      const notes = [brief.notes, correctionNotes].filter(Boolean).join(" ").slice(0, 500);
      const res = await regenerateListingAction(listingId, {
        features: brief.features,
        featuresAr: brief.featuresAr,
        keywords: brief.keywords,
        marketplace: brief.market,
        tone: brief.tone,
        notes,
      });
      if (!res.ok) {
        setBusy("");
        setNotice(res.error || t.common.failed);
        return;
      }
      nextResult = res;
      nextContent = res.content;
      const targetMarket = isMarketplace(res.marketplace) ? res.marketplace : marketplace;
      remaining = checkListing(nextContent, targetMarket, { brand: product.brand, keywords: brief.keywords }).filter((c) => !c.pass);
      // A provider/research failure already produced the fallback draft and
      // its actionable error. Repeating the same failed request only burns quota.
      if (remaining.length === 0 || res.aiError || res.engine !== "ai") break;
    }

    if (!nextResult) {
      setBusy("");
      setNotice(t.common.failed);
      return;
    }
    setContent(nextContent);
    setSaved(nextContent);
    if (isMarketplace(nextResult.marketplace)) setMarketplace(nextResult.marketplace);
    setOrigin({ engine: nextResult.engine, model: nextResult.model, edited: false });
    setStatus("draft");
    setAiError(nextResult.aiError);
    setBusy("");
    setNotice(remaining.length
      ? `Auto-fix finished with ${remaining.length} check(s) still needing review. Please verify the highlighted items.`
      : "All listing compliance checks passed. Listing saved automatically.");
  };

  const copyAll = async () => {
    const parts = [content.titleEn, ...content.bulletsEn.map((b) => `• ${b}`), content.descriptionEn, "", content.titleAr, ...content.bulletsAr.map((b) => `• ${b}`), content.descriptionAr];
    if (content.searchTerms) parts.push("", content.searchTerms);
    const text = parts.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setNotice(t.common.failed);
    }
  };

  const nextStatus = status === "draft" ? "review" : status === "review" ? "approved" : status === "approved" ? "published" : null;
  const nextLabel = status === "draft" ? t.editor.sendReview : status === "review" ? t.editor.approve : t.editor.publish;
  const originText = origin.engine === "ai" && origin.model ? origin.model : label(t.engine, origin.engine);
  const disabled = busy !== "";

  return (
    <>
      <Link href="/listings" className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-flow-green hover:underline">
        <ArrowLeft size={16} aria-hidden className="rtl:-scale-x-100" />
        {t.editor.back}
      </Link>

      <header className="mb-6 mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="h-page">{pname(locale, product.name, product.nameAr)}</h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-mute">
            <span>{product.clientName}</span>
            <MarketBadge m={marketplace} />
            <StatusPill status={status} text={label(t.listingStatus, status)} />
            <span className="pill pill-mute">
              <span dir="ltr">{originText}</span>
              {origin.edited && <span>· {t.editor.edited}</span>}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-ghost" onClick={copyAll}>
            {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
            {copied ? t.editor.copied : t.editor.copyAll}
          </button>
          <button type="button" className="btn btn-ghost" onClick={save} disabled={!dirty || disabled}>
            {busy === "save" && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {busy === "save" ? t.editor.saving : t.editor.save}
          </button>
          {status !== "draft" && (
            <button type="button" className="btn btn-ghost" onClick={() => changeStatus("draft")} disabled={disabled}>{t.editor.toDraft}</button>
          )}
          {nextStatus && (
            <button type="button" className="btn btn-primary" onClick={() => changeStatus(nextStatus)} disabled={disabled}>
              {busy === "status" && <Loader2 size={16} className="animate-spin" aria-hidden />}
              {nextLabel}
            </button>
          )}
        </div>
      </header>

      <div role="status" aria-live="polite" className={notice || dirty ? "mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" : "sr-only"}>
        {notice && (
          <span className="inline-flex items-center gap-2 rounded-full bg-lime-soft px-3 py-1 text-forest">
            <Zap size={14} aria-hidden />
            {notice}
          </span>
        )}
        {dirty && <span className="text-amber-ink">{t.editor.unsaved}</span>}
      </div>

      {aiError && (
        <div role="alert" className="mb-4 flex gap-3 rounded-2xl border border-red-200 bg-danger-soft p-4 text-sm text-danger">
          <X size={18} aria-hidden className="mt-0.5 shrink-0" />
          <p className="min-w-0 leading-relaxed">
            {t.editor.aiError} <span dir="ltr" className="break-words text-ink">{aiError}</span>
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="order-1 flex min-w-0 flex-col gap-4 xl:order-2">
          {!content.titleAr && origin.engine === "template" && (
            <p className="flex gap-2.5 rounded-xl bg-amber-soft px-4 py-3 text-sm text-amber-ink">
              <Info size={16} aria-hidden className="mt-0.5 shrink-0" />
              {t.editor.emptyAr}
            </p>
          )}

          <section className="card p-5 sm:p-6" aria-labelledby="f-title">
            <h2 id="f-title" className="h-section">{t.editor.titleField}</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <TextField id="title-en" lang="en" labelText={t.editor.english} value={content.titleEn} onChange={(v) => patch({ titleEn: v })} rows={3} max={rule.titleMax} />
              <TextField id="title-ar" lang="ar" labelText={t.editor.arabic} value={content.titleAr} onChange={(v) => patch({ titleAr: v })} rows={3} max={rule.titleMax} />
            </div>
          </section>

          <section className="card p-5 sm:p-6" aria-labelledby="f-bullets">
            <div className="flex items-center justify-between gap-3">
              <h2 id="f-bullets" className="h-section">{t.editor.bullets}</h2>
              <button type="button" className="btn btn-ghost btn-sm" onClick={addBullet} disabled={rows >= rule.bullets}>
                <Plus size={14} aria-hidden />
                {t.editor.addBullet}
              </button>
            </div>
            <ol className="mt-4 flex flex-col gap-4">
              {Array.from({ length: rows }, (_, i) => (
                <li key={i} className="flex gap-3">
                  <span className="num mt-7 w-4 shrink-0 text-sm font-medium text-mute">{i + 1}</span>
                  <div className="grid grid-cols-1 min-w-0 flex-1 gap-3 md:grid-cols-2">
                    <TextField id={`b-en-${i}`} lang="en" hideLabel labelText={`${tpl(t.editor.bullet, { n: i + 1 })} — ${t.editor.english}`} value={content.bulletsEn[i] ?? ""} onChange={(v) => setBullet("bulletsEn", i, v)} rows={2} max={rule.bulletMax} />
                    <TextField id={`b-ar-${i}`} lang="ar" hideLabel labelText={`${tpl(t.editor.bullet, { n: i + 1 })} — ${t.editor.arabic}`} value={content.bulletsAr[i] ?? ""} onChange={(v) => setBullet("bulletsAr", i, v)} rows={2} max={rule.bulletMax} />
                  </div>
                  <button type="button" className="btn btn-ghost btn-icon mt-6 shrink-0" onClick={() => removeBullet(i)} disabled={rows <= 1} aria-label={tpl(t.editor.removeBullet, { n: i + 1 })}>
                    <Trash2 size={15} aria-hidden />
                  </button>
                </li>
              ))}
            </ol>
          </section>

          <section className="card p-5 sm:p-6" aria-labelledby="f-desc">
            <h2 id="f-desc" className="h-section">{t.editor.description}</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <TextField id="desc-en" lang="en" labelText={t.editor.english} value={content.descriptionEn} onChange={(v) => patch({ descriptionEn: v })} rows={8} max={rule.descMax} />
              <TextField id="desc-ar" lang="ar" labelText={t.editor.arabic} value={content.descriptionAr} onChange={(v) => patch({ descriptionAr: v })} rows={8} max={rule.descMax} />
            </div>
          </section>

          <section className="card p-5 sm:p-6" aria-labelledby="f-terms">
            <h2 id="f-terms" className="h-section">{rule.terms?.kind === "tags" ? t.editor.tags : t.editor.searchTerms}</h2>
            {rule.terms ? (
              <div className="mt-4">
                <TextField
                  id="terms" lang="mixed" hideLabel
                  labelText={rule.terms.kind === "tags" ? t.editor.tags : `${t.editor.searchTerms} (${t.editor.bytes})`}
                  value={content.searchTerms} onChange={(v) => patch({ searchTerms: v })} rows={3}
                  max={rule.terms.kind === "bytes" ? rule.terms.max : null}
                  count={rule.terms.kind === "bytes" ? byteLength(content.searchTerms.trim()) : undefined}
                />
              </div>
            ) : (
              <p className="mt-2 text-sm text-mute">{t.editor.noTerms}</p>
            )}
          </section>
        </div>

        <aside className="order-2 flex min-w-0 flex-col gap-4 xl:order-1">
          <section className="card p-5 sm:p-6" aria-labelledby="f-check">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-4">
                <ScoreRing score={score} />
                <div className="min-w-0">
                  <h2 id="f-check" className="h-section">{t.editor.compliance}</h2>
                  <p className="mt-0.5 text-sm text-mute">{passed === checks.length ? t.editor.allGood : tpl(t.editor.passed, { a: passed, b: checks.length })}</p>
                </div>
              </div>
              <button type="button" className="btn btn-primary btn-sm" onClick={autoFixCompliance} disabled={disabled || passed === checks.length} title="Automatically fix what can be corrected from the saved product facts and recheck compliance">
                {busy === "regen" ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Sparkles size={15} aria-hidden />}
                {busy === "regen" ? "Fixing…" : "Auto-Fix"}
              </button>
            </div>
            {!aiModel && <p className="mt-3 text-xs text-mute">No API key needed. Auto-Fix uses FLOW's built-in rules and saved product facts; missing product information or Arabic translations may still need your review.</p>}
            <ul className="mt-5 flex flex-col gap-2.5">
              {sorted.map((c) => (
                <li key={c.id} className="flex gap-2.5 text-[13px] leading-snug">
                  <span
                    aria-hidden
                    className={`mt-px grid size-[18px] shrink-0 place-items-center rounded-full ${c.pass ? "bg-lime-soft text-moss" : c.severity === "error" ? "bg-danger-soft text-danger" : "bg-amber-soft text-amber-ink"}`}
                  >
                    {c.pass ? <Check size={12} strokeWidth={2.5} /> : c.severity === "error" ? <X size={12} strokeWidth={2.5} /> : <span className="text-[11px] font-bold leading-none">!</span>}
                  </span>
                  <span className={c.pass ? "text-mute" : "text-ink"}>
                    <span className="sr-only">{c.pass ? "✓" : "✗"} </span>
                    {t.check[c.id]}
                    {!c.pass && c.detail && <span dir="ltr" className="num ms-1 inline-block text-mute">({c.detail})</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-mute">{t.editor.rulesNote}</p>
          </section>

          <section className="card p-5 sm:p-6" aria-labelledby="f-brief">
            <h2 id="f-brief" className="h-section">{t.editor.brief}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-mute">{t.editor.briefSub}</p>
            <div className="mt-4 flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="label" htmlFor="br-market">{t.common.marketplace}</label>
                  <select id="br-market" className="field" value={brief.market} onChange={(e) => setBrief({ ...brief, market: e.target.value })}>
                    {MARKETPLACES.map((m) => (
                      <option key={m} value={m}>{MARKETPLACE_META[m].label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="br-tone">{t.listings.tone}</label>
                  <select id="br-tone" className="field" value={brief.tone} onChange={(e) => setBrief({ ...brief, tone: e.target.value })}>
                    {TONES.map((tone) => (
                      <option key={tone} value={tone}>{t.tone[tone]}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="br-feat">{t.editor.features}</label>
                <textarea id="br-feat" className="field" lang="en" dir="ltr" rows={5} value={brief.features} onChange={(e) => setBrief({ ...brief, features: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="br-feat-ar">{t.editor.featuresAr}</label>
                <textarea id="br-feat-ar" className="field" lang="ar" dir="rtl" rows={5} value={brief.featuresAr} onChange={(e) => setBrief({ ...brief, featuresAr: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="br-kw">{t.editor.keywords}</label>
                <textarea id="br-kw" className="field" dir="auto" rows={2} value={brief.keywords} onChange={(e) => setBrief({ ...brief, keywords: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="br-notes">{t.editor.notes}</label>
                <input id="br-notes" className="field" value={brief.notes} placeholder={t.editor.notesPh} maxLength={500} onChange={(e) => setBrief({ ...brief, notes: e.target.value })} />
              </div>
              <button type="button" className="btn btn-primary w-full" onClick={regenerate} disabled={disabled}>
                {busy === "regen" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <RefreshCw size={16} aria-hidden />}
                {busy === "regen" ? t.editor.regenerating : t.editor.regenerate}
              </button>
              <p className="text-xs leading-relaxed text-mute">
                {aiModel ? <span dir="ltr">{tpl(t.editor.willUseAi, { model: aiModel })}</span> : t.editor.willUseTemplate}
              </p>
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}
