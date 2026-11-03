import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authorizeAgent, keywordQuery, SEARCH_FIELDS, TEXT_MATCH } from "../../_agent.js";
import { dbQuery } from "../../_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!authorizeAgent(req, res)) return;
  const where: string[] = [];
  const args: Record<string, string | number> = {};
  let limit = 10;
  try {
    for (const [key, value] of Object.entries(req.query)) {
      if (!["branch", "pr", "q", "limit"].includes(key) || typeof value !== "string") {
        throw new Error("Supported parameters: branch, pr, q, limit");
      }
    }
    if (req.query.limit !== undefined) {
      if (!/^[1-9]\d?$/.test(req.query.limit as string)) throw new Error("limit must be between 1 and 20");
      limit = Number(req.query.limit);
      if (limit > 20) throw new Error("limit must be between 1 and 20");
    }
    for (const name of ["branch", "pr", "q"]) {
      if (req.query[name] !== undefined && !(req.query[name] as string).trim()) {
        throw new Error(`${name} must not be empty`);
      }
    }
    const branch = (req.query.branch as string | undefined)?.trim();
    const pr = (req.query.pr as string | undefined)?.trim();
    const q = (req.query.q as string | undefined)?.trim();
    if (!branch && !pr && !q) throw new Error("Provide branch, pr, or q");
    if (branch) {
      if (branch.length > 255) throw new Error("branch is too long");
      where.push("git_branch = :branch");
      args.branch = branch;
    }
    if (q) {
      if (q.length > 256) throw new Error("q is too long");
      args.text = keywordQuery(q);
      where.push(`${TEXT_MATCH} AGAINST (:text IN BOOLEAN MODE)`);
    }
    if (pr) {
      if (pr.length > 512) throw new Error("pr is too long");
      let number: string;
      let url: string | undefined;
      if (/^[1-9]\d*$/.test(pr)) number = pr;
      else {
        let parsed: URL;
        try { parsed = new URL(pr); } catch { throw new Error("pr must be a PR number or GitHub pull request URL"); }
        const match = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/([1-9]\d*)\/?$/.exec(parsed.pathname);
        if (!["http:", "https:"].includes(parsed.protocol) || parsed.hostname !== "github.com" || parsed.username || parsed.password || !match) {
          throw new Error("pr must be a PR number or GitHub pull request URL");
        }
        number = match[3]!;
        url = `https://github.com/${match[1]}/${match[2]}/pull/${number}`;
      }
      if (!Number.isSafeInteger(Number(number)) || Number(number) > 2147483647) throw new Error("Invalid PR number");
      if (url) {
        args.prUrl = url;
        args.prLink = `/pull/${number}`;
        args.prPattern = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^A-Za-z0-9_]|$)";
        where.push(`(pr_url = :prUrl OR
          (LOCATE(:prLink, CAST(transcript_text AS BINARY)) > 0
            AND REGEXP_LIKE(transcript_text, :prPattern, 'i')))`);
      } else {
        args.prNumber = Number(number);
        args.prLink = `/pull/${number}`;
        args.prHash = `#${number}`;
        args.prPattern = `(/pull/|#)${number}([^A-Za-z0-9_]|$)`;
        where.push(`(pr_number = :prNumber OR REGEXP_LIKE(pr_url, :prPattern, 'i') OR
          ((LOCATE(:prLink, CAST(transcript_text AS BINARY)) > 0
              OR LOCATE(:prHash, CAST(transcript_text AS BINARY)) > 0)
            AND REGEXP_LIKE(transcript_text, :prPattern, 'i')))`);
      }
    }
  } catch (error: unknown) {
    res.status(400).json({ error: (error as Error).message });
    return;
  }
  try {
    const { rows } = await dbQuery(
      `SELECT ${SEARCH_FIELDS} FROM sessions WHERE ${where.join(" AND ")}
       ORDER BY ended_at DESC, id DESC LIMIT :limit`,
      { ...args, limit },
    );
    res.status(200).json({ sessions: rows });
  } catch {
    res.status(503).json({ error: "Session search is temporarily unavailable" });
  }
}
