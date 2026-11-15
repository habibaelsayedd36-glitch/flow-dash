import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { IntelligenceStudio } from "@/components/IntelligenceStudio";
import { getListings, getPipeline } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI Commerce Intelligence" };

export default async function IntelligencePage() {
  const [listingRows, productRows] = await Promise.all([getListings(), getPipeline()]);
  const listings = listingRows.map((r) => ({ id: r.id, productName: r.productName, clientName: r.clientName, marketplace: r.marketplace, status: r.status, score: r.score, engine: r.engine }));
  const products = productRows.map((r) => ({ id: r.id, name: r.name, sku: r.sku, marketplace: r.marketplace, stage: r.stage, clientName: r.clientName, listingId: r.listingId }));
  return (
    <>
      <PageHeader title="AI Commerce Intelligence" sub="A connected workspace for product data, listing quality, competitor research, brand voice and publishing operations." />
      <IntelligenceStudio listings={listings} products={products} />
    </>
  );
}
