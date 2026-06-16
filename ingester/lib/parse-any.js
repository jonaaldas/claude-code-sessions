import fs from "node:fs";
import { parseSession } from "./parse.js";
import { parseCodexSession } from "./parse-codex.js";

// Codex rollouts start with a `session_meta` record and live under
// ~/.codex/sessions; Claude transcripts don't. Path is the cheap hint, the
// first line is the authoritative check.
export function detectKind(file) {
  if (file.includes(`${".codex"}/sessions`)) return "codex";
  try {
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);
    const first = buf.toString("utf8", 0, n).split("\n").find((l) => l.trim());
    if (first && JSON.parse(first).type === "session_meta") return "codex";
  } catch {
    /* fall through */
  }
  return "claude";
}

/** Parse a transcript with the right agent parser, auto-detected. */
export function parseAny(file) {
  return detectKind(file) === "codex"
    ? parseCodexSession(file)
    : parseSession(file);
}
