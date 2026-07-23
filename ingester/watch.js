#!/usr/bin/env node
/**
 * Background watcher — collects session metadata continuously.
 *
 * Watches ~/.claude/projects and ~/.codex/sessions for transcript writes and
 * upserts the affected session into MySQL (debounced per file). On startup it
 * backfills every existing session once. Designed to run as a launchd service.
 */
import chokidar from "chokidar";
import {
  PROJECTS_DIR,
  CODEX_SESSIONS_DIR,
  allTranscripts,
  allCodexTranscripts,
} from "./lib/discover.js";
import { parseAny } from "./lib/parse-any.js";
import { getClient, ensureSchema, upsertSession } from "./lib/db.js";
import { maybeDescribe } from "./lib/describe.js";

const DEBOUNCE_MS = 4000;

const client = getClient();
await ensureSchema(client);

const pending = new Map(); // file -> timer

async function ingest(file) {
  const row = parseAny(file);
  if (!row) return;
  try {
    await maybeDescribe(client, row);
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

// Initial backfill (both agents).
const existing = [...allTranscripts(), ...allCodexTranscripts()];
log(`backfilling ${existing.length} existing session(s)…`);
for (const f of existing) await ingest(f);
log("backfill complete; watching for changes.");

chokidar
  .watch([PROJECTS_DIR, CODEX_SESSIONS_DIR], {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 300 },
    ignored: (p) => p.includes("/.") && !p.endsWith(".jsonl"),
  })
  .on("add", schedule)
  .on("change", schedule);

log(`watching ${PROJECTS_DIR} and ${CODEX_SESSIONS_DIR}`);
