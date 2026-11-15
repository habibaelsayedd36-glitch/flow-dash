import { Info, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ListingJobWizard } from "@/components/ListingJobWizard";
import { RecentJobs } from "@/components/RecentJobs";
import { PageHeader } from "@/components/ui";
import { getAiProvider } from "@/lib/ai";
import { getClients } from "@/lib/data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Listing Automation" };

export default async function ListingAutomationPage() {
  const [clients, provider] = await Promise.all([getClients(), getAiProvider()]);
  return (
    <>
      <PageHeader title="Listing Automation" sub="Receiving sheet in, collecting sheet and an uploadable Amazon flat file out. Titles, descriptions, bullets, keywords and specs, with every estimate flagged." />

      {provider ? (
        <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-lime-soft px-3.5 py-1.5 text-sm text-forest">
          <Sparkles size={14} aria-hidden />
          Copy and spec estimates will be written by {provider.label} ({provider.model}).
        </p>
      ) : (
        <aside className="mb-4 flex gap-3 rounded-2xl border border-amber-300 bg-amber-soft p-4">
          <Info size={18} aria-hidden className="mt-0.5 shrink-0 text-amber-ink" />
          <p className="max-w-3xl text-sm leading-relaxed text-amber-900">
            <strong className="text-amber-ink">No AI key is connected.</strong> The job will still run, but the template engine only arranges what is already in the sheet: no new
            copy, no translation, no spec estimates. Missing values are flagged instead.{" "}
            <Link href="/settings" className="font-medium text-amber-ink underline underline-offset-2">Add a key in Settings & AI Key</Link>
          </p>
        </aside>
      )}

      <ListingJobWizard clients={clients.map((c) => ({ id: c.id, name: c.name }))} />
      <RecentJobs type="listing" />
    </>
  );
}
