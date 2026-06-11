import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");

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
