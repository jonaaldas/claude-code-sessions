import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sessions from "./server-build/api/sessions.js";
import login from "./server-build/api/login.js";
import logout from "./server-build/api/logout.js";
import agentSearch from "./server-build/api/v1/sessions/search.js";
import agentSession from "./server-build/api/v1/sessions/[id].js";

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "dist");
const routes = new Map([
  ["/api/sessions", sessions],
  ["/api/login", login],
  ["/api/logout", logout],
  ["/api/v1/sessions/search", agentSearch],
]);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const server = createServer(async (req, res) => {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(data));
    return res;
  };
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/healthz") {
      res.setHeader("Cache-Control", "no-store");
      res.json({ ok: true });
      return;
    }
    const sessionMatch = /^\/api\/v1\/sessions\/([^/]+)$/.exec(url.pathname);
    const handler = routes.get(url.pathname) || (sessionMatch ? agentSession : undefined);
    if (handler) {
      req.query = Object.fromEntries(url.searchParams);
      if (sessionMatch && !routes.has(url.pathname)) {
        try { req.query.id = decodeURIComponent(sessionMatch[1]); }
        catch { res.status(400).json({ error: "Invalid session ID" }); return; }
      }
      const chunks = [];
      let length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 16_384) {
          res.status(413).json({ error: "Request body too large" });
          return;
        }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString("utf8");
      if (body) {
        try { req.body = JSON.parse(body); }
        catch { res.status(400).json({ error: "Invalid JSON" }); return; }
      }
      await handler(req, res);
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.setHeader("Allow", "GET, HEAD");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { res.status(400).json({ error: "Invalid path" }); return; }
    if (pathname.split("/").some((segment) => segment.startsWith("."))) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    let file = resolve(dist, "." + pathname);
    if (file !== dist && !file.startsWith(dist + sep)) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) {
      if (extname(pathname)) { res.status(404).end("Not found"); return; }
      file = resolve(dist, "index.html");
    }
    const data = await readFile(file);
    res.setHeader("Content-Type", mime[extname(file)] || "application/octet-stream");
    res.setHeader("Cache-Control", file.includes(`${sep}assets${sep}`)
      ? "public, max-age=31536000, immutable" : "no-cache");
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
    else res.end();
  }
});

export { server };

server.listen(Number(process.env.PORT || 3000), "0.0.0.0", () => {
  console.log("Session dashboard server listening");
});
for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
