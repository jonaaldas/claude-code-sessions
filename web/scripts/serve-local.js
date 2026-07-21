#!/usr/bin/env node
/**
 * Offline preview server. Serves the built `dist/` plus a live /api/sessions
 * backed by the MySQL registry. Lets you see the dashboard without Vercel.
 *
 *   DATABASE_URL="mysql://user:pass@host:3306/claude_sessions" node scripts/serve-local.js
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, "..", "dist");
const PORT = process.env.PORT || 4321;

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  namedPlaceholders: true,
  connectionLimit: 5,
});

const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/api/sessions") {
    try {
      const [rows] = await pool.query(
        `SELECT id, source, title, summary, first_prompt, last_prompt, cwd, repo, git_branch,
                pr_url, pr_number, message_count, version, started_at, ended_at, updated_at
         FROM sessions ORDER BY ended_at DESC LIMIT 1000`
      );
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ sessions: rows }));
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  let file = path.join(dist, url.pathname === "/" ? "index.html" : url.pathname);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(dist, "index.html"); // SPA fallback
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`Preview on http://localhost:${PORT}`));
