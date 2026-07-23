import mysql from "mysql2/promise";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from the ingester root regardless of cwd (hooks run from anywhere).
dotenv.config({ path: path.join(__dirname, "..", ".env") });

let pool;

// Returns a shared mysql2 pool. Reused across calls so the long-running watcher
// keeps a small, bounded set of connections rather than reconnecting per write.
export function getClient() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add mysql://user:pass@host:port/db to ingester/.env"
    );
  }
  if (!pool) {
    pool = mysql.createPool({
      uri: url,
      namedPlaceholders: true,
      connectionLimit: 5,
      waitForConnections: true,
      enableKeepAlive: true,
    });
  }
  return pool;
}

export async function ensureSchema(client) {
  const schema = fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8");
  // Strip line comments so `;`-splitting isn't confused by "--" text, then run
  // each CREATE TABLE (indexes are inline, so no separate index step needed).
  const cleaned = schema
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  const stmts = cleaned.split(";").map((s) => s.trim()).filter(Boolean);
  for (const s of stmts) await client.query(s);
  await migrate(client);
}

// Additive, idempotent migrations for DBs created before a column existed.
// MySQL has no "ADD COLUMN IF NOT EXISTS", so we attempt and swallow the
// duplicate-column error (ER_DUP_FIELDNAME).
async function migrate(client) {
  const adds = [
    "ALTER TABLE sessions ADD COLUMN source VARCHAR(32) DEFAULT 'claude'",
    "ALTER TABLE sessions ADD COLUMN description TEXT",
    "ALTER TABLE sessions ADD COLUMN described_message_count INT",
  ];
  for (const sql of adds) {
    try {
      await client.query(sql);
    } catch (e) {
      if (e.code !== "ER_DUP_FIELDNAME" && !/duplicate column/i.test(e.message)) throw e;
    }
  }
}

const COLS = [
  "id", "source", "title", "summary", "description", "described_message_count",
  "first_prompt", "last_prompt", "cwd", "repo",
  "git_branch", "pr_url", "pr_number", "pr_repository", "message_count",
  "version", "started_at", "ended_at", "updated_at", "transcript_path",
];

// The describer only fills these when it (re)generates; on every other ingest
// they arrive null and must not clobber the stored value.
const KEEP_IF_NULL = new Set(["description", "described_message_count"]);

export async function upsertSession(client, row) {
  const data = { ...row, updated_at: new Date().toISOString() };
  const placeholders = COLS.map(() => "?").join(", ");
  // MySQL 8 row-alias upsert: `AS new ... = new.col` (the modern replacement
  // for the deprecated VALUES() form, and the analogue of SQLite's `excluded`).
  const updates = COLS.filter((c) => c !== "id")
    .map((c) => (KEEP_IF_NULL.has(c) ? `${c}=COALESCE(new.${c}, sessions.${c})` : `${c}=new.${c}`))
    .join(", ");
  await client.query(
    `INSERT INTO sessions (${COLS.join(", ")}) VALUES (${placeholders}) AS new
     ON DUPLICATE KEY UPDATE ${updates}`,
    COLS.map((c) => data[c] ?? null)
  );
}
