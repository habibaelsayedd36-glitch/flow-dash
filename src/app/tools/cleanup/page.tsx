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
        sub="Regenerate product photos with free FLUX.2 Klein 4B AI, preserve the original product design, and export clean square marketplace images."
      />
      <div className="mb-5 rounded-xl border border-line bg-sage-soft px-4 py-3 text-sm leading-relaxed text-mute">
        FLOW can create a newly rendered studio-style product photo using the free Hugging Face FLUX.2 Klein 4B ZeroGPU Space. The source photo is used as the reference; review the product shape, logo, colors, and especially small label text before publishing. Free GPU queue and startup delays may occur. No paid AI fallback is enabled.
      </div>
      <ImageStudio mode="cleanup" />
      <RecentJobs type="cleanup" />
    </>
  );
}
