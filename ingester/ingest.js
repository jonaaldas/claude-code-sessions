#!/usr/bin/env node
/**
 * Ingest Claude Code and Codex CLI sessions into Turso.
 *
 * Usage:
 *   node ingest.mjs <transcript.jsonl>   ingest one file (agent auto-detected)
 *   node ingest.mjs --all                ingest every Claude + Codex session
 *   node ingest.mjs --all --claude       only ~/.claude/projects
 *   node ingest.mjs --all --codex        only ~/.codex/sessions
 *   node ingest.mjs --all --dry          parse + print, no DB writes (no Turso needed)
 *
 * The Stop hook also pipes the hook JSON ({transcript_path,...}) on stdin; if no
 * path arg is given and stdin has data, we read transcript_path from there.
 */
import { allTranscripts, allCodexTranscripts } from "./lib/discover.js";
import { parseAny } from "./lib/parse-any.js";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const all = args.includes("--all");
const onlyClaude = args.includes("--claude");
const onlyCodex = args.includes("--codex");
const fileArgs = args.filter((a) => !a.startsWith("--"));

async function readStdinPath() {
  if (process.stdin.isTTY) return null;
  let data = "";
  for await (const chunk of process.stdin) data += chunk;
  data = data.trim();
  if (!data) return null;
  try {
    const o = JSON.parse(data);
    return o.transcript_path || null;
  } catch {
    return data; // allow a bare path on stdin
  }
}

async function main() {
  let targets = [];
  if (all) {
    if (!onlyCodex) targets.push(...allTranscripts());
    if (!onlyClaude) targets.push(...allCodexTranscripts());
  } else if (fileArgs.length) {
    targets = fileArgs;
  } else {
    const p = await readStdinPath();
    if (p) targets = [p];
  }

  if (!targets.length) {
    console.error("Nothing to ingest. Pass a file, --all, or pipe hook JSON.");
    process.exit(dry ? 0 : 1);
  }

  const rows = [];
  for (const t of targets) {
    const row = parseAny(t);
    if (row) rows.push(row);
  }

  if (dry) {
    for (const r of rows) {
      console.log(
        `${(r.source || "?").padEnd(7)} ${(r.repo || "?").padEnd(22)} ${(r.git_branch || "?").padEnd(14)} ` +
        `msgs:${String(r.message_count).padStart(4)}  ${r.id}\n  → ${r.title || r.last_prompt || r.first_prompt || "(no title)"}`
      );
    }
    console.log(`\n${rows.length} session(s) parsed (dry run, no DB writes).`);
    return;
  }

  const { getClient, ensureSchema, upsertSession } = await import("./lib/db.js");
  const client = getClient();
  await ensureSchema(client);
  let ok = 0;
  for (const r of rows) {
    try {
      await upsertSession(client, r);
      ok++;
    } catch (e) {
      console.error(`Failed to upsert ${r.id}: ${e.message}`);
    }
  }
  console.log(`Ingested ${ok}/${rows.length} session(s) into MySQL.`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
