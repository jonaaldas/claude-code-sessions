#!/usr/bin/env node
/**
 * Provision (or update) the single login user in MySQL.
 *
 *   node scripts/set-password.js you@example.com
 *     → prompts for the password (hidden), then upserts the scrypt hash.
 *
 *   node scripts/set-password.js you@example.com 'the-password'
 *     → non-interactive (avoid: leaks into shell history).
 *
 * Reads DATABASE_URL from web/.env. The hashing scheme ("salt:hash" hex via
 * scrypt) matches api/_auth.ts exactly.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Minimal .env loader (no dotenv dependency in the web package).
function loadEnv() {
  const file = path.join(__dirname, "..", ".env");
  try {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
  } catch {
    /* no .env — rely on the ambient environment */
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // Mute the echo while typing the password.
    const onData = () => (rl.output.write = () => {});
    process.stdout.write(question);
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    onData();
  });
}

async function main() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set (expected in web/.env).");
    process.exit(1);
  }

  const email = (process.argv[2] || "").trim().toLowerCase();
  if (!email) {
    console.error("Usage: node scripts/set-password.js <email> [password]");
    process.exit(1);
  }
  const password = process.argv[3] || (await promptHidden(`Password for ${email}: `));
  if (!password || password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const pool = mysql.createPool({ uri: url, namedPlaceholders: true, connectionLimit: 2 });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_users (
      email         VARCHAR(255) NOT NULL,
      password_hash TEXT NOT NULL,
      created_at    VARCHAR(40),
      PRIMARY KEY (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await pool.query(
    `INSERT INTO auth_users (email, password_hash, created_at)
     VALUES (:email, :hash, :now) AS new
     ON DUPLICATE KEY UPDATE password_hash = new.password_hash`,
    { email, hash: hashPassword(password), now: new Date().toISOString() }
  );
  await pool.end();

  console.log(`✓ Login set for ${email}. You can now log in on the dashboard.`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
