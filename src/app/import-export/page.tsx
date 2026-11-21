import { ArrowDownToLine, FileSpreadsheet, FileUp, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ListingJobWizard } from "@/components/ListingJobWizard";
import { RecentJobs } from "@/components/RecentJobs";
import { PageHeader } from "@/components/ui";
import { getClients } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Import & Export Center" };

export default async function ImportExportPage() {
  const clients = await getClients();
  return (
    <>
      <PageHeader title="Import & Export Center" sub="Bring product data in, prepare marketplace-ready files, and return to saved exports without rebuilding a batch." />
      <section className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="card p-5">
          <FileUp size={20} className="text-moss" aria-hidden />
          <h2 className="mt-3 font-semibold text-ink">Import product sheets</h2>
          <p className="mt-1 text-sm leading-relaxed text-mute">Upload CSV, XLSX, XLSM or tab-delimited TXT files. Map columns and process up to 1,000 products per batch.</p>
        </div>
        <div className="card p-5">
          <FileSpreadsheet size={20} className="text-moss" aria-hidden />
          <h2 className="mt-3 font-semibold text-ink">Export Excel reports</h2>
          <p className="mt-1 text-sm leading-relaxed text-mute">Download the collecting sheet with bilingual content, product specs, flags and unverified estimates clearly marked.</p>
        </div>
        <div className="card p-5">
          <ArrowDownToLine size={20} className="text-moss" aria-hidden />
          <h2 className="mt-3 font-semibold text-ink">Amazon Flat Files</h2>
          <p className="mt-1 text-sm leading-relaxed text-mute">Download English or Arabic tab-delimited files. Attach your Seller Central template from a saved job to preserve its field layout.</p>
        </div>
      </section>
      {clients.length === 0 ? (
        <div className="card p-6">
          <p className="font-medium text-ink">Add a client before importing a listing batch.</p>
          <Link href="/clients" className="btn btn-primary mt-4">Open Clients</Link>
        </div>
      ) : <ListingJobWizard clients={clients.map((client) => ({ id: client.id, name: client.name }))} />}
      <RecentJobs type="listing" />
      <div className="mt-6 flex items-start gap-2 rounded-xl bg-sage-soft p-4 text-sm leading-relaxed text-mute">
        <ShieldCheck size={17} className="mt-0.5 shrink-0 text-moss" aria-hidden />
        Amazon Flat Files should always be checked with Seller Central's “Check my file” before uploading. Required columns and values can vary by category and marketplace.
      </div>
    </>
  );
}
