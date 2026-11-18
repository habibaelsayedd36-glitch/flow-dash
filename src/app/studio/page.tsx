import { redirect } from "next/navigation";

/** Individual listing generation has been replaced by the bulk workflow. */
export default function StudioPage() {
  redirect("/tools/listing");
}
