import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@libsql/client";

// Read-only endpoint: returns all sessions, newest first.
// Supports ?q= (search), ?repo=, ?branch= filters.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) {
    // Site is deployed but Turso isn't wired yet — render an intentional
    // "connect your database" state rather than a 500.
    res.status(200).json({ sessions: [], configured: false });
    return;
  }

  const client = createClient({ url, authToken });

  const q = (req.query.q as string) || "";
  const repo = (req.query.repo as string) || "";
  const branch = (req.query.branch as string) || "";
  const fresh = req.query.fresh === "1"; // manual "Sync now" bypasses edge cache

  const where: string[] = [];
  const args: Record<string, string> = {};
  if (q) {
    where.push(
      "(title LIKE :q OR last_prompt LIKE :q OR first_prompt LIKE :q OR repo LIKE :q OR git_branch LIKE :q)"
    );
    args.q = `%${q}%`;
  }
  if (repo) {
    where.push("repo = :repo");
    args.repo = repo;
  }
  if (branch) {
    where.push("git_branch = :branch");
    args.branch = branch;
  }

  // Privacy gate. On the public Vercel deployment we only ever expose repos
  // explicitly allowlisted via the PUBLIC_REPOS env var (comma-separated).
  // Fails CLOSED: if PUBLIC_REPOS is unset, the public site shows nothing.
  // Locally (no VERCEL env — e.g. serve-local.js / vite) everything is visible.
  const isPublicDeploy = !!process.env.VERCEL;
  const allowed = (process.env.PUBLIC_REPOS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (isPublicDeploy) {
    if (allowed.length === 0) {
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({
        sessions: [],
        configured: true,
        restricted: true,
        lastSynced: null,
        total: 0,
      });
      return;
    }
    const ph = allowed.map((_, i) => `:allow${i}`).join(", ");
    where.push(`LOWER(repo) IN (${ph})`);
    allowed.forEach((a, i) => (args[`allow${i}`] = a));
  }

  const sql =
    `SELECT id, title, summary, first_prompt, last_prompt, cwd, repo, git_branch,
            pr_url, pr_number, message_count, version, started_at, ended_at, updated_at
     FROM sessions` +
    (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
    ` ORDER BY ended_at DESC LIMIT 1000`;

  try {
    const result = await client.execute({ sql, args });
    // lastSynced = the most recent ingest write across all sessions.
    const meta = await client.execute(
      "SELECT MAX(updated_at) AS last_synced, COUNT(*) AS total FROM sessions"
    );
    res.setHeader(
      "Cache-Control",
      fresh ? "no-store" : "s-maxage=10, stale-while-revalidate=59"
    );
    res.status(200).json({
      sessions: result.rows,
      configured: true,
      restricted: isPublicDeploy,
      lastSynced: meta.rows[0]?.last_synced ?? null,
      total: result.rows.length,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}
