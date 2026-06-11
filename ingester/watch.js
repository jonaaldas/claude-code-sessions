#!/usr/bin/env node
/**
 * Background watcher — collects session metadata continuously.
 *
 * Watches ~/.claude/projects for transcript writes and upserts the affected
 * session into Turso (debounced per file). On startup it backfills every
 * existing session once. Designed to run as a launchd service.
 */
import chokidar from "chokidar";
import path from "node:path";
import { PROJECTS_DIR, allTranscripts } from "./lib/discover.js";
import { parseSession } from "./lib/parse.js";
import { getClient, ensureSchema, upsertSession } from "./lib/db.js";

const DEBOUNCE_MS = 4000;

const client = getClient();
await ensureSchema(client);

const pending = new Map(); // file -> timer

async function ingest(file) {
  const row = parseSession(file);
  if (!row) return;
  try {
    await upsertSession(client, row);
    log(`upserted ${row.repo}/${row.git_branch} ${row.id}`);
  } catch (e) {
    log(`ERROR ${file}: ${e.message}`);
  }
}

function schedule(file) {
  if (!file.endsWith(".jsonl")) return;
  clearTimeout(pending.get(file));
  pending.set(
    file,
    setTimeout(() => {
      pending.delete(file);
      ingest(file);
    }, DEBOUNCE_MS)
  );
}

function log(msg) {
  process.stdout.write(`[watch] ${msg}\n`);
}

// Initial backfill.
const existing = allTranscripts();
log(`backfilling ${existing.length} existing session(s)…`);
for (const f of existing) await ingest(f);
log("backfill complete; watching for changes.");

chokidar
  .watch(PROJECTS_DIR, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 300 },
    ignored: (p) => p.includes("/.") && !p.endsWith(".jsonl"),
  })
  .on("add", schedule)
  .on("change", schedule);

log(`watching ${PROJECTS_DIR}`);
