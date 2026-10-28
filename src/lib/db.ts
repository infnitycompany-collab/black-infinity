import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
export interface DB {
  query<T = Record<string, any>>(
    sql: string,
    params?: any[],
  ): Promise<{ rows: T[] }>;
}
type Database = DB & { transaction<T>(fn: (db: DB) => Promise<T>): Promise<T> };
const state = globalThis as typeof globalThis & {
  infinityDb?: Promise<Database>;
};
export function database(): Promise<Database> {
  if (!state.infinityDb) state.infinityDb = open();
  return state.infinityDb;
}
async function open(): Promise<Database> {
  const schema = await readFile(
    path.join(process.cwd(), "src/lib/schema.sql"),
    "utf8",
  );
  if (process.env.DATABASE_URL) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
    });
    const migration = await pool.connect();
    try {
      await migration.query("BEGIN");
      await migration.query("SELECT pg_advisory_xact_lock(125234)");
      await migration.query(schema);
      await migration.query("COMMIT");
    } catch (e) {
      await migration.query("ROLLBACK");
      throw e;
    } finally {
      migration.release();
    }
    return {
      query: async <T>(s: string, p?: any[]) => ({
        rows: (await pool.query(s, p)).rows as T[],
      }),
      transaction: async (fn) => {
        const c = await pool.connect();
        try {
          await c.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
          const result = await fn(c);
          await c.query("COMMIT");
          return result;
        } catch (e) {
          await c.query("ROLLBACK");
          throw e;
        } finally {
          c.release();
        }
      },
    };
  }
  if (
    process.env.NODE_ENV === "production" &&
    process.env.LOCAL_PREVIEW !== "1"
  )
    throw new Error("Production requires DATABASE_URL");
  const root = path.resolve(
    /* turbopackIgnore: true */ process.env.DATA_DIR || ".data",
  );
  await mkdir(root, { recursive: true });
  const pg = new PGlite(path.join(root, "postgres"));
  await pg.waitReady;
  await pg.exec(schema);
  return {
    query: async <T>(s: string, p?: any[]) => pg.query<T>(s, p),
    transaction: (fn) => pg.transaction((tx) => fn(tx as DB)),
  };
}
export async function one<T = Record<string, any>>(
  sql: string,
  params?: any[],
  db?: DB,
): Promise<T | undefined> {
  return (await (db || (await database())).query<T>(sql, params)).rows[0];
}
export const id = () => crypto.randomUUID();
