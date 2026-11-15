import { redirect } from "next/navigation";

/** The three automations are separate pages now. Old links to /tools land on the first one. */
export default function ToolsIndex() {
  redirect("/tools/listing");
}
