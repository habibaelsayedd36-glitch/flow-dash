import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JobRunner } from "@/components/JobRunner";
import { MarketBadge } from "@/components/ui";
import { getJob } from "@/lib/data";
import { flagSummary } from "@/lib/job-fields";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata: Metadata = { title: "Listing job" };

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await getJob(Number(id) || 0);
  if (!row || row.job.type !== "listing" || row.job.status === "draft") notFound();
  const { job, clientName } = row;

  return (
    <>
      <Link href="/tools/listing" className="mb-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-flow-green hover:underline">
        <ArrowLeft size={16} aria-hidden />
        Listing Automation
      </Link>
      <header className="mb-6">
        <h1 className="h-page break-words">{job.title || `Job #${job.id}`}</h1>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-mute">
          <span>Listing automation</span>
          {clientName && <span>{clientName}</span>}
          <MarketBadge m={job.marketplace} />
          {job.productType && <span className="pill pill-mute">{job.productType}</span>}
          {job.template && <span className="pill pill-ok">Seller Central template attached</span>}
        </div>
      </header>

      <JobRunner
        jobId={job.id}
        hasClient={job.clientId !== null}
        clientName={clientName}
        imported={job.imported}
        status={job.status}
        items={job.items.map((item, index) => ({
          index,
          sku: item.source.sku ?? "",
          name: item.source.name || item.source.nameAr || "",
          status: item.status,
          title: item.content?.titleEn ?? "",
          titleAr: item.content?.titleAr ?? "",
          score: item.score ?? null,
          engine: item.engine ?? null,
          flags: flagSummary(item),
          hasEstimates: Boolean(item.estimated?.length),
          error: item.error ?? null,
        }))}
      />
    </>
  );
}
