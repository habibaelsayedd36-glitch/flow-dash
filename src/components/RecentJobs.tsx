import { History } from "lucide-react";
import Link from "next/link";
import { MARKETPLACE_META, isMarketplace } from "@/lib/catalog";
import { getJobs } from "@/lib/data";
import { timeAgo } from "@/lib/i18n";
import { DataTable, Empty, StatusPill, Td } from "./ui";

/** The latest jobs of one automation, shown under that automation's page. */
export async function RecentJobs({ type }: { type: "listing" | "cleanup" | "shots" }) {
  const jobs = await getJobs(12, type);
  return (
    <section className="mt-10" aria-labelledby="recent-jobs">
      <h2 id="recent-jobs" className="h-section mb-4">Recent jobs</h2>
      {jobs.length === 0 ? (
        <Empty icon={<History size={18} aria-hidden />}>No jobs yet. Finished jobs show up here.</Empty>
      ) : (
        <DataTable head={["Job", "Items", "Flagged", "Status", "Started"]} minWidth={620}>
          {jobs.map((j) => {
            const detail = [j.clientName, isMarketplace(j.marketplace) ? MARKETPLACE_META[j.marketplace].label : j.marketplace].filter(Boolean).join(" · ");
            return (
              <tr key={j.id}>
                <Td>
                  {type === "listing" ? (
                    <Link href={`/tools/jobs/${j.id}`} className="font-medium text-flow-green hover:underline">{j.title || `Job #${j.id}`}</Link>
                  ) : (
                    <span className="text-foreground">{j.title || `Job #${j.id}`}</span>
                  )}
                  {detail && <span className="block text-[13px] text-muted-foreground">{detail}</span>}
                </Td>
                <Td className="num">{j.total}</Td>
                <Td>{j.flagged > 0 ? <span className="pill pill-warn num">{j.flagged} to check</span> : <span className="text-[13px] text-muted-foreground">None</span>}</Td>
                <Td><StatusPill status={j.status === "done" ? "approved" : "review"} text={j.status === "done" ? "Done" : "Running"} /></Td>
                <Td className="whitespace-nowrap text-[13px] text-muted-foreground">{timeAgo(j.createdAt, "en")}</Td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </section>
  );
}
