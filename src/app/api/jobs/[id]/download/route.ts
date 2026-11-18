import { requireApiUser } from "@/lib/auth/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ensureDb } from "@/db/ensure";
import { jobs } from "@/db/schema";
import { buildCollectingSheet, buildFlatFile } from "@/lib/sheets";

export const dynamic = "force-dynamic";

/**
 * ?file=collecting               → collecting sheet (.xlsx), estimates highlighted
 * ?file=flat&lang=en|ar          → Amazon flat file (tab-delimited .txt)
 *   &estimates=1                 → include values that are still unverified estimates
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureDb();
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const [job] = await db.select().from(jobs).where(eq(jobs.id, Number(id) || 0));
  if (!job || job.type !== "listing") return Response.json({ ok: false, error: "Job not found" }, { status: 404 });

  if (url.searchParams.get("file") === "flat") {
    const lang = url.searchParams.get("lang") === "ar" ? "ar" : "en";
    const body = buildFlatFile(job, lang, url.searchParams.get("estimates") === "1");
    return new Response(body, {
      headers: {
        "content-type": "text/tab-separated-values; charset=utf-8",
        "content-disposition": `attachment; filename="amazon-flat-file-job${job.id}-${lang}.txt"`,
        "cache-control": "no-store",
      },
    });
  }

  const buffer = await buildCollectingSheet(job);
  return new Response(buffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="collecting-sheet-job${job.id}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
