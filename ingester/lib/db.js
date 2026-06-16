import { createClient } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from the ingester root regardless of cwd (hooks run from anywhere).
dotenv.config({ path: path.join(__dirname, "..", ".env") });

export function getClient() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL is not set. Run ./setup-db.sh after `turso auth login`."
    );
  }
  return createClient({ url, authToken });
}

export async function ensureSchema(client) {
  const schema = fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8");
  const stmts = schema.split(";").map((s) => s.trim()).filter(Boolean);

  // Create the table first so migrations can run against it, then apply
  // migrations, then everything else (indexes that may reference new columns).
  for (const s of stmts) if (/^CREATE TABLE/i.test(s)) await client.execute(s);
  await migrate(client);
  for (const s of stmts) if (!/^CREATE TABLE/i.test(s)) await client.execute(s);
}

// Additive, idempotent migrations for DBs created before a column existed.
// SQLite has no "ADD COLUMN IF NOT EXISTS", so we attempt and swallow the
// duplicate-column error.
async function migrate(client) {
  const adds = [
    "ALTER TABLE sessions ADD COLUMN source TEXT DEFAULT 'claude'",
  ];
  for (const sql of adds) {
    try {
      await client.execute(sql);
    } catch (e) {
      if (!/duplicate column name/i.test(e.message)) throw e;
    }
  }
}

const COLS = [
  "id", "source", "title", "summary", "first_prompt", "last_prompt", "cwd", "repo",
  "git_branch", "pr_url", "pr_number", "pr_repository", "message_count",
  "version", "started_at", "ended_at", "updated_at", "transcript_path",
];

export async function upsertSession(client, row) {
  const data = { ...row, updated_at: new Date().toISOString() };
  const placeholders = COLS.map(() => "?").join(", ");
  const updates = COLS.filter((c) => c !== "id")
    .map((c) => `${c}=excluded.${c}`)
    .join(", ");
  await client.execute({
    sql: `INSERT INTO sessions (${COLS.join(", ")}) VALUES (${placeholders})
          ON CONFLICT(id) DO UPDATE SET ${updates}`,
    args: COLS.map((c) => data[c] ?? null),
  });
}
