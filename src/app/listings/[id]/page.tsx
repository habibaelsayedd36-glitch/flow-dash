import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ListingEditor } from "@/components/ListingEditor";
import { getAiProvider } from "@/lib/ai";
import { getListing } from "@/lib/data";
import { getI18n } from "@/lib/locale";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Listing" };

export default async function ListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ai_error?: string }>;
}) {
  const [{ id }, sp, { locale }] = await Promise.all([params, searchParams, getI18n()]);
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId < 1) notFound();
  const row = await getListing(numericId);
  if (!row) notFound();
  const { listing, product, clientName } = row;
  const provider = await getAiProvider();

  return (
    <ListingEditor
      locale={locale}
      listingId={listing.id}
      initial={{
        titleEn: listing.titleEn,
        titleAr: listing.titleAr,
        bulletsEn: listing.bulletsEn,
        bulletsAr: listing.bulletsAr,
        descriptionEn: listing.descriptionEn,
        descriptionAr: listing.descriptionAr,
        searchTerms: listing.searchTerms,
      }}
      meta={{
        marketplace: listing.marketplace,
        status: listing.status,
        engine: listing.engine,
        model: listing.model,
        edited: listing.edited,
        tone: listing.tone,
      }}
      product={{
        name: product.name,
        nameAr: product.nameAr,
        brand: product.brand,
        features: product.features,
        featuresAr: product.featuresAr,
        keywords: product.keywords,
        clientName,
      }}
      aiModel={provider ? provider.model : null}
      aiError={typeof sp.ai_error === "string" ? sp.ai_error.slice(0, 300) : null}
    />
  );
}
