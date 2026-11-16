import { pool } from "@/db";
import { DDL, UPGRADE } from "./ddl";
import { seed } from "./seed";

/**
 * Makes the app self-sufficient on a fresh database: creates the tables if
 * they are missing (DDL is exported from the Drizzle schema, see ddl.ts) and
 * loads the sample workspace once.
 *
 * Use a transaction-scoped advisory lock: DATABASE_URL may use Neon's
 * transaction pooler, where session-scoped advisory locks can outlive the
 * client checkout and block every subsequent serverless request.
 */

const LOCK = 727_001;
const g = globalThis as typeof globalThis & { __flowReady?: Promise<void> };

async function init(): Promise<void> {
  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query("begin");
    inTransaction = true;
    await client.query("select pg_advisory_xact_lock($1)", [LOCK]);

    const reg = await client.query<{ t: string | null }>("select to_regclass('public.clients')::text as t");
    if (!reg.rows[0]?.t) await client.query(DDL);
    // Idempotent: adds tables/columns introduced after the first release.
    await client.query(UPGRADE);

    const marker = await client.query("select 1 from settings where key = 'seeded'");
    const existing = await client.query<{ n: string }>("select count(*)::text as n from clients");
    if (marker.rowCount === 0 && existing.rows[0]?.n === "0") {
      await seed();
    }
    if (marker.rowCount === 0) {
      await client.query("insert into settings (key, value) values ('seeded', $1) on conflict (key) do nothing", [
        new Date().toISOString(),
      ]);
    }

    await client.query("commit");
    inTransaction = false;
  } catch (error) {
    if (inTransaction) await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function ensureDb(): Promise<void> {
  if (!g.__flowReady) {
    g.__flowReady = init().catch((e) => {
      g.__flowReady = undefined;
      throw e;
    });
  }
  return g.__flowReady;
}
