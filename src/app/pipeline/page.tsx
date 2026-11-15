import type { Metadata } from "next";
import { PipelineBoard } from "@/components/PipelineBoard";
import { PageHeader } from "@/components/ui";
import { getClients, getPipeline } from "@/lib/data";
import { getI18n } from "@/lib/locale";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const [{ locale, t }, rows, clients, sp] = await Promise.all([getI18n(), getPipeline(), getClients(), searchParams]);
  const now = Date.now();
  const cards = rows.map((r) => ({
    id: r.id,
    name: r.name,
    nameAr: r.nameAr,
    sku: r.sku,
    marketplace: r.marketplace,
    stage: r.stage,
    clientId: r.clientId,
    clientName: r.clientName,
    listingId: r.listingId,
    days: Math.max(0, Math.floor((now - r.stageEnteredAt.getTime()) / 86_400_000)),
  }));
  return (
    <>
      <PageHeader title={t.pipeline.title} sub={t.pipeline.sub} />
      <PipelineBoard
        locale={locale}
        cards={cards}
        clients={clients.map((c) => ({ id: c.id, name: c.name, marketplaces: c.marketplaces }))}
        openForm={sp.new === "1"}
      />
    </>
  );
}
