import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authorizeAgent, SEARCH_FIELDS } from "../../_agent.js";
import { dbQuery } from "../../_db.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!authorizeAgent(req, res)) return;
  const id = req.query.id;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,255}$/.test(id)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }
  try {
    const { rows } = await dbQuery(
      `SELECT ${SEARCH_FIELDS}, LEFT(summary, 2000) AS summary,
       LEFT(description, 500) AS description, started_at, message_count
       FROM sessions WHERE id = :id LIMIT 1`, { id },
    );
    if (!rows.length) { res.status(404).json({ error: "Session not found" }); return; }
    res.status(200).json({ session: rows[0] });
  } catch {
    res.status(503).json({ error: "Session lookup is temporarily unavailable" });
  }
}
