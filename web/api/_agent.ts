import { createHash, timingSafeEqual } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export function authorizeAgent(req: VercelRequest, res: VercelResponse): boolean {
  res.setHeader("Cache-Control", "private, no-store");
  const expected = process.env.SESSION_API_KEY;
  const header = req.headers.authorization;
  const match = typeof header === "string" && header.length <= 1024
    ? /^Bearer ([^\s]+)$/i.exec(header) : null;
  if (!expected || !match || !timingSafeEqual(
    createHash("sha256").update(expected).digest(),
    createHash("sha256").update(match[1]).digest(),
  )) {
    res.setHeader("WWW-Authenticate", 'Bearer realm="SessionAI"');
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return false;
  }
  return true;
}

export const SEARCH_FIELDS = `id, source, repo AS project, LEFT(cwd, 1024) AS cwd, git_branch AS branch,
  LEFT(pr_url, 512) AS pr_url, pr_number, LEFT(title, 160) AS title, LEFT(first_prompt, 240) AS first_prompt,
  ended_at, updated_at`;

export const TEXT_MATCH = "MATCH(title, first_prompt, transcript_text)";

export function keywordQuery(value: string): string {
  const words = [...new Set(value.match(/[\p{L}\p{N}_]+/gu) || [])]
    .filter((word) => word.length >= 3);
  if (!words.length || words.length > 12) throw new Error("Use 1–12 keywords of at least 3 characters for q");
  return words.map((word) => `+${word}*`).join(" ");
}
