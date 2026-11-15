import type { Metadata } from "next";
import { AIAdStudio } from "@/components/AIAdStudio";
import { ImageStudio } from "@/components/ImageStudio";
import { RecentJobs } from "@/components/RecentJobs";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Image Clean-up | FLOW" };

export default function ImageCleanupPage() {
  return (
    <>
      <PageHeader title="Image Clean-up" sub="Turn a simple product photo into a polished advertising scene with free, on-device AI." />
      <AIAdStudio />
      <details className="card mt-6 p-4 sm:p-5">
        <summary className="cursor-pointer font-display text-base font-semibold text-ink">Classic white-background clean-up</summary>
        <p className="mb-4 mt-2 text-sm text-mute">For marketplace main images that require a clean white background.</p>
        <ImageStudio mode="cleanup" />
      </details>
      <RecentJobs type="cleanup" />
    </>
  );
}
