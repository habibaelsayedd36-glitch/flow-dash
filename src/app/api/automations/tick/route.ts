import { ensureDb } from "@/db/ensure";
import { runScheduledChecks } from "@/lib/engine";

export const dynamic = "force-dynamic";

/**
 * Scheduler endpoint for time-based automations ("product stuck for N days").
 * Point any cron service at it, e.g. every hour:
 *   curl -X POST https://<host>/api/automations/tick -H "Authorization: Bearer $CRON_SECRET"
 * If CRON_SECRET is set in the environment the bearer token is required.
 * Runs are de-duplicated, so calling it more often than needed is harmless.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    await ensureDb();
    const results = await runScheduledChecks();
    const tally = (s: string) => results.filter((r) => r.status === s).length;
    return Response.json({ ok: true, fired: tally("success"), skipped: tally("skipped"), failed: tally("failed") });
  } catch {
    return Response.json({ ok: false, error: "tick failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
