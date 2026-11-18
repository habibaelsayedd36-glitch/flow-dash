import { requireApiUser } from "@/lib/auth/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ensureDb } from "@/db/ensure";
import { jobs } from "@/db/schema";
import { suggestMapping } from "@/lib/job-fields";
import { MAX_ROWS, parseSheet } from "@/lib/sheets";

export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const fail = (error: string, status = 400) => Response.json({ ok: false, error }, { status });

/**
 * kind=sheet    → parses a receiving sheet (.xlsx / .csv / .txt) and opens a draft job.
 * kind=template → attaches the header rows of the seller's own Amazon flat-file template to a job.
 */
export async function POST(req: Request) {
  await ensureDb();
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Upload a file.");
  }
  const file = form.get("file");
  const kind = String(form.get("kind") ?? "sheet");
  if (!(file instanceof File) || file.size === 0) return fail("Upload a file.");
  if (file.size > MAX_BYTES) return fail("That file is larger than 8 MB.");
  if (!/\.(xlsx|xlsm|csv|txt|tsv)$/i.test(file.name)) return fail("Use an .xlsx, .csv or tab-delimited .txt file.");

  try {
    const buf = await file.arrayBuffer();

    if (kind === "template") {
      const jobId = Number(form.get("jobId"));
      const rows = await parseSheet(buf, file.name, { preferSheet: "template", keepLayout: true });
      const fieldRow = rows.findIndex((r) => r.some((c) => c.trim() === "item_sku"));
      if (fieldRow < 0) return fail("No row with the field name item_sku was found. Upload the Template tab of your Seller Central file.", 422);
      const header = rows.slice(0, fieldRow + 1);
      const updated = await db.update(jobs).set({ template: header }).where(eq(jobs.id, jobId)).returning({ id: jobs.id });
      if (updated.length === 0) return fail("Job not found.", 404);
      return Response.json({ ok: true, fields: header[fieldRow].filter(Boolean).length });
    }

    const rows = await parseSheet(buf, file.name);
    if (rows.length < 2) return fail("The sheet needs a header row and at least one product row.", 422);
    const width = Math.max(...rows.map((r) => r.length));
    const padded = rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ""));
    const headers = padded[0].map((h, i) => h || `Column ${i + 1}`);
    const data = padded.slice(1, MAX_ROWS + 1);
    const [job] = await db
      .insert(jobs)
      .values({ type: "listing", title: file.name.slice(0, 120), status: "draft", raw: [headers, ...data] })
      .returning({ id: jobs.id });
    return Response.json({
      ok: true,
      jobId: job.id,
      headers,
      preview: data.slice(0, 4),
      total: data.length,
      truncated: padded.length - 1 > MAX_ROWS,
      mapping: suggestMapping(headers),
    });
  } catch {
    return fail("That file could not be read. Check it opens in Excel and try again.", 422);
  }
}
