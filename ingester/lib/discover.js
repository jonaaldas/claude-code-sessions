import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
export const CODEX_SESSIONS_DIR = path.join(os.homedir(), ".codex", "sessions");

/** All session transcript files under ~/.claude/projects, newest first. */
export function allTranscripts(dir = PROJECTS_DIR) {
  const out = [];
  let projectDirs;
  try {
    projectDirs = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const d of projectDirs) {
    if (!d.isDirectory()) continue;
    const pdir = path.join(dir, d.name);
    let files;
    try {
      files = fs.readdirSync(pdir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (f.endsWith(".jsonl")) {
        const full = path.join(pdir, f);
        try {
          out.push({ path: full, mtime: fs.statSync(full).mtimeMs });
        } catch {
          /* ignore */
        }
      }
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime).map((x) => x.path);
}

/**
 * All Codex rollout transcripts under ~/.codex/sessions, newest first.
 * Codex nests them by date (sessions/YYYY/MM/DD/rollout-*.jsonl), so we walk
 * the tree rather than assuming a flat layout.
 */
export function allCodexTranscripts(dir = CODEX_SESSIONS_DIR) {
  const out = [];
  walk(dir, out);
  return out.sort((a, b) => b.mtime - a.mtime).map((x) => x.path);
}

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, out);
    } else if (e.name.endsWith(".jsonl")) {
      try {
        out.push({ path: full, mtime: fs.statSync(full).mtimeMs });
      } catch {
        /* ignore */
      }
    }
  }
}
