import fs from "node:fs";
import path from "node:path";
import { clip, redact, samplePrompts } from "./parse.js";

/**
 * Parse a single Codex CLI "rollout" transcript (.jsonl) into the same flat row
 * shape the Claude parser produces, so both agents land in one `sessions` table.
 *
 * Codex writes one JSON object per line. The records we care about:
 *   - session_meta            → id, cwd, git.branch, cli_version, started_at
 *   - event_msg/user_message  → clean user prompt text (no env-context noise)
 *   - event_msg/agent_message → assistant turns
 *   - top-level `timestamp`   → present on every line; last one = ended_at
 *
 * Codex has no AI-generated title, compaction summary, or PR linkage, so those
 * columns stay null. `source` is tagged "codex" to distinguish it in the UI.
 *
 * @param {string} file absolute path to a rollout-*.jsonl transcript
 * @returns {object|null} a session row, or null if the file has no usable data
 */
export function parseCodexSession(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }

  const row = {
    id: null,
    source: "codex",
    title: null,
    summary: null,
    last_prompt: null,
    first_prompt: null,
    cwd: null,
    repo: null,
    git_branch: null,
    pr_url: null,
    pr_number: null,
    pr_repository: null,
    message_count: 0,
    version: null,
    started_at: null,
    ended_at: null,
    transcript_path: file,
  };

  const userTexts = [];
  let sawEventMessages = false; // prefer event_msg streams; fall back if absent

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue; // tolerate partial / corrupt trailing lines
    }

    // Every record carries a wall-clock timestamp; track the span.
    if (o.timestamp) {
      if (!row.started_at) row.started_at = o.timestamp;
      row.ended_at = o.timestamp;
    }

    const p = o.payload || {};

    if (o.type === "session_meta") {
      if (p.id) row.id = p.id;
      if (p.cwd) row.cwd = p.cwd;
      if (p.cli_version) row.version = `codex ${p.cli_version}`;
      if (p.timestamp) row.started_at = p.timestamp;
      if (p.git && p.git.branch) row.git_branch = p.git.branch;
      continue;
    }

    if (o.type === "event_msg") {
      if (p.type === "user_message" && p.message) {
        sawEventMessages = true;
        userTexts.push(p.message);
        row.message_count++;
      } else if (p.type === "agent_message" && p.message) {
        sawEventMessages = true;
        row.message_count++;
      }
      continue;
    }

    // Fallback for rollouts without event_msg streams: read the raw message
    // items, skipping system/developer noise and Codex's injected context.
    if (!sawEventMessages && o.type === "response_item" && p.type === "message") {
      if (p.role === "user") {
        const t = textOf(p.content);
        if (t && !t.startsWith("<")) {
          userTexts.push(t);
          row.message_count++;
        }
      } else if (p.role === "assistant") {
        row.message_count++;
      }
    }
  }

  if (!row.id) return null;

  row.first_prompt = userTexts.length ? clip(userTexts[0], 500) : null;
  row.last_prompt = userTexts.length ? clip(userTexts[userTexts.length - 1], 500) : null;
  row._prompts = samplePrompts(userTexts);

  // Mirror the Claude parser: repo label is the cwd basename so the same
  // project groups together regardless of which agent produced the session.
  row.repo = row.cwd ? path.basename(row.cwd) : deriveRepoFromTranscriptDir(file);
  if (row.repo) row.repo = redact(row.repo);

  if (!row.ended_at) {
    try {
      row.ended_at = new Date(fs.statSync(file).mtimeMs).toISOString();
    } catch {
      /* ignore */
    }
  }

  return row;
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const t = content.find((x) => x && typeof x.text === "string" && x.text);
    return t ? t.text : null;
  }
  return null;
}

// Last-resort repo label from the rollout filename's parent dirs (date-based,
// so not useful) — fall back to null; cwd basename is the normal path.
function deriveRepoFromTranscriptDir() {
  return null;
}
