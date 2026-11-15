import type { Metadata } from "next";
import { ImageStudio } from "@/components/ImageStudio";
import { RecentJobs } from "@/components/RecentJobs";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Image Angles" };

export default function ImageAnglesPage() {
  return (
    <>
      <PageHeader title="Image Angles" sub="Turn one product's photos into clean white-background front, side and back shots, sized and named for every marketplace." />
      <ImageStudio mode="shots" />
      <RecentJobs type="shots" />
    </>
  );
}
