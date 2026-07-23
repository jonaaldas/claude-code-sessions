import fs from "node:fs";
import path from "node:path";

/**
 * Parse a single Claude Code session transcript (.jsonl) into a flat row.
 *
 * Claude writes one JSON object per line. Across the lifetime of a session the
 * interesting metadata is spread over several record `type`s:
 *   - user / assistant      → cwd, gitBranch, version, timestamps, message bodies
 *   - ai-title              → aiTitle (Claude's own generated session title)
 *   - last-prompt           → lastPrompt (the most recent user prompt text)
 *   - pr-link               → prNumber, prUrl, prRepository
 *   - summary               → summary (compaction summary, when present)
 *
 * We take the LAST occurrence of each single-valued field so the row reflects
 * the final state of the session.
 *
 * @param {string} file absolute path to a .jsonl transcript
 * @returns {object|null} a session row, or null if the file has no usable data
 */
export function parseSession(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }

  const row = {
    id: null,
    source: "claude",
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

  const userTexts = []; // real (non-noise) user prompts, in order

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue; // tolerate partial / corrupt trailing lines
    }

    if (o.sessionId && !row.id) row.id = o.sessionId;

    switch (o.type) {
      case "ai-title":
        if (o.aiTitle) row.title = o.aiTitle;
        break;
      case "last-prompt":
        if (o.lastPrompt) row.last_prompt = o.lastPrompt;
        break;
      case "summary":
        if (o.summary) row.summary = o.summary;
        break;
      case "pr-link":
        if (o.prUrl) row.pr_url = o.prUrl;
        if (o.prNumber != null) row.pr_number = o.prNumber;
        if (o.prRepository) row.pr_repository = o.prRepository;
        break;
      case "user":
      case "assistant": {
        if (o.cwd) row.cwd = o.cwd;
        if (o.gitBranch) row.git_branch = o.gitBranch;
        if (o.version) row.version = o.version;
        if (o.timestamp) {
          if (!row.started_at) row.started_at = o.timestamp;
          row.ended_at = o.timestamp;
        }
        if (o.type === "user" && !o.isMeta) {
          row.message_count++;
          const t = extractText(o.message);
          if (t && !isNoisePrompt(t)) userTexts.push(t);
        }
        if (o.type === "assistant") row.message_count++;
        break;
      }
    }
  }

  if (!row.id) return null;

  // Sessions spawned by our own describer (lib/describe.js) tag their prompt
  // with a sentinel — never ingest them, or the watcher would loop on itself.
  if (userTexts.length && userTexts[0].trimStart().startsWith("session-describer:")) {
    return null;
  }

  row.first_prompt = userTexts.length ? clip(userTexts[0], 500) : null;
  // Claude's last-prompt record can itself be slash-command noise; prefer the
  // last real user prompt in that case.
  const cleanLast = userTexts.length ? userTexts[userTexts.length - 1] : null;
  const recordedLast = row.last_prompt && !isNoisePrompt(row.last_prompt) ? row.last_prompt : null;
  row.last_prompt = recordedLast || cleanLast ? clip(recordedLast || cleanLast, 500) : null;
  row._prompts = samplePrompts(userTexts);
  if (row.title) row.title = redact(row.title);
  if (row.summary) row.summary = redact(row.summary);

  // Derive a human repo label: prefer the GitHub repo, then the cwd basename.
  row.repo =
    row.pr_repository ||
    (row.cwd ? path.basename(row.cwd) : null) ||
    deriveRepoFromTranscriptDir(file);

  // Fall back to file mtime if no message carried a timestamp.
  if (!row.ended_at) {
    try {
      row.ended_at = new Date(fs.statSync(file).mtimeMs).toISOString();
    } catch {
      /* ignore */
    }
  }

  return row;
}

// Prompts that are tooling artifacts, not something the user "said" — slash
// command invocations, injected reminders, interrupt markers. These made
// first_prompt useless as a description (e.g. "<command-name>/usage…").
const NOISE_PREFIXES = [
  "<command-name>",
  "<local-command",
  "<system-reminder",
  "<task-notification",
  "[Request interrupted",
  "Caveat: the messages below",
];

export function isNoisePrompt(t) {
  const s = String(t).trimStart();
  return NOISE_PREFIXES.some((p) => s.startsWith(p));
}

// A small, order-preserving sample of the session's real prompts (first two +
// last two) used as input for the AI describer. Kept off the DB row (leading
// underscore — not in the upsert column list).
export function samplePrompts(userTexts) {
  const picked =
    userTexts.length <= 4
      ? userTexts
      : [...userTexts.slice(0, 2), ...userTexts.slice(-2)];
  return picked.map((t) => clip(t, 300));
}

function extractText(message) {
  if (!message) return null;
  const c = message.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    const t = c.find((x) => x && x.type === "text" && x.text);
    return t ? t.text : null;
  }
  return null;
}

// Patterns for credentials that can leak into prompts. Anything matched is
// replaced with [redacted] before it ever reaches the DB / public dashboard.
// Exported so the Codex parser applies the exact same redaction.
export const SECRET_PATTERNS = [
  /\bcfut_[A-Za-z0-9_-]{20,}/g, // Cloudflare API tokens
  /\bv1\.0-[A-Za-z0-9_-]{20,}/g, // Cloudflare origin/global tokens
  /\bsk-[A-Za-z0-9_-]{20,}/g, // OpenAI / Anthropic style
  /\bgh[posru]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT (Turso/etc.)
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /\b(?:ghp|glpat|npm_)[A-Za-z0-9_-]{20,}/g, // misc PATs
];

export function redact(s) {
  let out = String(s);
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[redacted]");
  return out;
}

export function clip(s, n) {
  s = redact(String(s)).replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// Claude's project dir encodes the cwd by replacing "/" with "-".
// e.g. -Users-aldas-Documents-incruises-monorepo
function deriveRepoFromTranscriptDir(file) {
  const dir = path.basename(path.dirname(file));
  const parts = dir.split("-").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}
