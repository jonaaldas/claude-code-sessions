// Shared MySQL pool for the serverless functions. Files in /api prefixed with
// `_` are NOT turned into routes by Vercel — they're importable internals.
//
// A single module-scoped pool is reused across warm invocations (Fluid Compute
// reuses instances), so we don't open a fresh connection per request. Named
// placeholders (`:name`) are enabled so query SQL stays readable.
import mysql from "mysql2/promise";

let pool: mysql.Pool | undefined;

export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      namedPlaceholders: true,
      connectionLimit: 5,
      waitForConnections: true,
      enableKeepAlive: true,
    });
  }
  return pool;
}

// Thin wrapper mirroring the old libsql client's `.execute()` → `{ rows }`
// shape, so call sites read the same. Accepts positional or named args.
export async function dbQuery(
  sql: string,
  args?: any[] | Record<string, any>
): Promise<{ rows: any[] }> {
  const [rows] = await getPool().query(sql, args ?? []);
  return { rows: rows as any[] };
}
