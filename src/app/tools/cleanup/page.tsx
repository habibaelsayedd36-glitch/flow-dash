import type { Metadata } from "next";
import { ImageStudio } from "@/components/ImageStudio";
import { RecentJobs } from "@/components/RecentJobs";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Image Clean-up" };

export default function ImageCleanupPage() {
  return (
    <>
      <PageHeader title="Image Clean-up" sub="Drop in a batch of product photos and get them back e-commerce ready: white background, no shadows, centred." />
      <ImageStudio mode="cleanup" />
      <RecentJobs type="cleanup" />
    </>
  );
}
