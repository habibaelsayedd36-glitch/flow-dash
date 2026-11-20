import type { Metadata } from "next";
import { ImageStudio } from "@/components/ImageStudio";
import { RecentJobs } from "@/components/RecentJobs";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Image Clean-up | FLOW" };

export default function ImageCleanupPage() {
  return (
    <>
      <PageHeader
        title="Image Clean-up"
        sub="Prepare your original product photo for marketplace listings: isolate the product, use a pure white background, and export a square image."
      />
      <div className="mb-5 rounded-xl border border-line bg-sage-soft px-4 py-3 text-sm leading-relaxed text-mute">
        FLOW uses AI background segmentation in your browser. It does not regenerate or redesign the product. Review every result carefully, especially fine edges, transparent packaging, and small label text, before publishing.
      </div>
      <ImageStudio mode="cleanup" />
      <RecentJobs type="cleanup" />
    </>
  );
}
