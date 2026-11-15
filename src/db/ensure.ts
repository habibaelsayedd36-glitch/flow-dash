import { pool } from "@/db";
import { DDL, UPGRADE } from "./ddl";
import { seed } from "./seed";

/**
 * Makes the app self-sufficient on a fresh database: creates the tables if
 * they are missing (DDL is exported from the Drizzle schema, see ddl.ts) and
 * loads the sample workspace once. Guarded by an advisory lock so concurrent
 * first requests cannot double-seed.
 */

const LOCK = 727_001;
const g = globalThis as typeof globalThis & { __flowReady?: Promise<void> };

async function init(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK]);
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
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK]).catch(() => undefined);
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
