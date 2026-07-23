import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { clip } from "./parse.js";

/**
 * Best-effort AI description of a session, so the dashboard row tells you what
 * you were talking about instead of echoing a raw prompt.
 *
 * Generated locally with `claude -p --model haiku` from the session's real
 * prompts and cached in the `description` column. Regenerated only when the
 * session has grown to at least twice the size it had when last described, so
 * the watcher doesn't burn a call on every keystroke of a live session.
 *
 * The prompt starts with a "session-describer:" sentinel; parse.js drops any
 * transcript whose first prompt carries it, so the describer's own print-mode
 * sessions never loop back into the table.
 *
 * Disable entirely with DESCRIBE=0, override the CLI path with CLAUDE_BIN.
 */

const MIN_MESSAGES = 3; // one-liner sessions (/usage etc.) aren't worth a call
const TIMEOUT_MS = 90_000;

export async function maybeDescribe(client, row) {
  try {
    if (process.env.DESCRIBE === "0") return;
    if (!row || row.message_count < MIN_MESSAGES) return;
    const prompts = promptsOf(row);
    if (!prompts.length && !row.title) return;

    const [rows] = await client.query(
      "SELECT description, described_message_count FROM sessions WHERE id = ?",
      [row.id]
    );
    const existing = rows[0];
    if (
      existing?.description &&
      row.message_count < 2 * (existing.described_message_count || 1)
    ) {
      return; // still fresh — upsert COALESCEs, so the stored one survives
    }

    const text = await runClaude(buildPrompt(row, prompts));
    if (!text) return;
    row.description = clip(text.split("\n")[0], 200);
    row.described_message_count = row.message_count;
  } catch {
    /* descriptions are best-effort; never block ingestion */
  }
}

function promptsOf(row) {
  const p = Array.isArray(row._prompts) && row._prompts.length
    ? row._prompts
    : [row.first_prompt, row.last_prompt];
  return p.filter(Boolean);
}

function buildPrompt(row, prompts) {
  const lines = [
    "session-describer: You are labeling one row of a dashboard listing past coding-agent sessions.",
    "Write ONE plain sentence (max 120 characters) saying what the user was working on in this session —",
    "concrete enough that they instantly remember it. Output only the sentence: no quotes, no preamble.",
    "",
    `Repo: ${row.repo || "?"}   Branch: ${row.git_branch || "?"}`,
  ];
  if (row.title) lines.push(`Existing short title: ${row.title}`);
  prompts.forEach((p, i) => lines.push(`User prompt ${i + 1}: ${p}`));
  return lines.join("\n");
}

function runClaude(prompt) {
  return new Promise((resolve) => {
    execFile(
      claudeBin(),
      ["-p", prompt, "--model", "haiku"],
      { timeout: TIMEOUT_MS, cwd: os.tmpdir(), maxBuffer: 1024 * 1024 },
      (err, stdout) => resolve(err ? null : String(stdout).trim() || null)
    );
  });
}

// launchd services run with a minimal PATH, so probe the usual install spots.
function claudeBin() {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const candidates = [
    path.join(os.homedir(), ".local", "bin", "claude"),
    "/opt/homebrew/bin/claude",
    "/usr/local/bin/claude",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return "claude";
}
