"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useActionState, useState } from "react";
import { generateListingAction, type FormState } from "@/app/actions";
import { MARKETPLACES, MARKETPLACE_META, TONES } from "@/lib/catalog";
import { dictFor, type Locale } from "@/lib/i18n";

type Opt = { id: number; text: string; marketplace: string };

export function NewListingForm({ locale, products }: { locale: Locale; products: Opt[] }) {
  const t = dictFor(locale);
  const [productId, setProductId] = useState(String(products[0]?.id ?? ""));
  const [marketplace, setMarketplace] = useState(products[0]?.marketplace ?? "amazon");
  const [state, action, pending] = useActionState<FormState, FormData>(generateListingAction, {});

  return (
    <form action={action} className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
      <div className="min-w-0">
        <label className="label" htmlFor="nl-product">{t.listings.pickProduct}</label>
        <select
          id="nl-product"
          name="productId"
          className="field"
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value);
            const p = products.find((x) => String(x.id) === e.target.value);
            if (p) setMarketplace(p.marketplace);
          }}
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.text}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="nl-market">{t.common.marketplace}</label>
        <select id="nl-market" name="marketplace" className="field" value={marketplace} onChange={(e) => setMarketplace(e.target.value)}>
          {MARKETPLACES.map((m) => (
            <option key={m} value={m}>{MARKETPLACE_META[m].label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="nl-tone">{t.listings.tone}</label>
        <select id="nl-tone" name="tone" className="field" defaultValue="clear">
          {TONES.map((tone) => (
            <option key={tone} value={tone}>{t.tone[tone]}</option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Sparkles size={16} aria-hidden />}
        {pending ? t.listings.generating : t.listings.generate}
      </button>
      {state.error && <p role="alert" className="text-sm text-danger md:col-span-4">{t.common.failed}</p>}
    </form>
  );
}
