import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { getPool } from "../server-build/api/_db.js";
import { signToken } from "../server-build/api/_auth.js";

test("agent HTTP endpoints require their own key, validate filters, and return metadata", async (t) => {
  const names = ["SESSION_API_KEY", "AUTH_SECRET", "DATABASE_URL", "PORT", "NODE_ENV"];
  const before = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const key = randomBytes(48).toString("base64url");
  Object.assign(process.env, { SESSION_API_KEY: key, AUTH_SECRET: randomBytes(32).toString("hex"),
    DATABASE_URL: "mysql://localhost:1/sessionai", PORT: "0", NODE_ENV: "production" });
  const pool = getPool();
  const calls = [];
  const row = { id: "session-123", source: "claude", project: "example", cwd: "/work/example",
    branch: "feature/agent-api", pr_url: "https://github.com/owner/example/pull/12", pr_number: 12,
    title: "Agent API", first_prompt: "Find a session", ended_at: "2026-11-03T12:00:00Z", updated_at: "2026-11-03T12:00:01Z" };
  let result = [row];
  let fail = false;
  pool.query = async (sql, args) => {
    calls.push({ sql, args });
    if (fail) throw new Error(key + " private database connection");
    return [result];
  };
  const { server } = await import("../server.mjs");
  if (!server.listening) await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options = {}) => fetch(base + path, {
    ...options, headers: { Authorization: `Bearer ${key}`, ...options.headers },
  });
  try {
    await t.test("401 without a key, wrong key, query key, or valid browser cookie", async () => {
      const token = signToken({ email: "owner@example.test", exp: Date.now() + 60000 }, process.env.AUTH_SECRET);
      for (const path of ["/api/v1/sessions/search?branch=main", "/api/v1/sessions/session-123"]) {
        for (const options of [ {}, { headers: { Authorization: "Bearer wrong" } },
          { headers: { Cookie: `auth=${token}` } }, { headers: { Authorization: "Basic invalid" } } ]) {
          const res = await fetch(base + path, options);
          assert.equal(res.status, 401);
          assert.equal(res.headers.get("cache-control"), "private, no-store");
          assert.match(res.headers.get("www-authenticate"), /^Bearer /);
        }
      }
      assert.equal((await fetch(base + "/api/v1/sessions/search?branch=main&api_key=" + key)).status, 401);
      delete process.env.SESSION_API_KEY;
      assert.equal((await request("/api/v1/sessions/search?branch=main")).status, 401);
      process.env.SESSION_API_KEY = key;
      assert.equal(calls.length, 0);
    });
    await t.test("search routing, branch binding, small limit and activity ordering", async () => {
      const branch = "feature/x' OR 1=1 --";
      const res = await request("/api/v1/sessions/search?branch=" + encodeURIComponent(branch));
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { sessions: [row] });
      const call = calls.at(-1);
      assert.equal(call.args.branch, branch);
      assert.equal(call.args.limit, 10);
      assert.ok(!call.sql.includes(branch));
      assert.match(call.sql, /ORDER BY ended_at DESC, id DESC LIMIT :limit/);
      const selection = call.sql.split("FROM sessions")[0];
      assert.ok(!selection.includes("transcript_text") && !selection.includes("password_hash"));
    });
    await t.test("indexed transcript keywords and combined filters", async () => {
      const res = await request("/api/v1/sessions/search?branch=main&q=SessionAI%20consolidation&pr=12&limit=20");
      assert.equal(res.status, 200);
      const { sql, args } = calls.at(-1);
      assert.match(sql, /MATCH\(title, first_prompt, transcript_text\) AGAINST/);
      assert.equal(args.text, "+SessionAI* +consolidation*");
      assert.equal(args.branch, "main");
      assert.equal(args.prNumber, 12);
      assert.equal(args.limit, 20);
      assert.ok(new RegExp(args.prPattern).test("review #12."));
      assert.ok(!new RegExp(args.prPattern).test("review #123."));
      assert.ok(!new RegExp(args.prPattern).test("color #12abcd"));
      assert.ok(!new RegExp(args.prPattern).test("/pull/123"));
    });
    await t.test("PR URLs retain repository identity and match transcript references", async () => {
      const url = "https://github.com/test_owner/repo.name/pull/12?diff=split#discussion";
      const res = await request("/api/v1/sessions/search?pr=" + encodeURIComponent(url));
      assert.equal(res.status, 200);
      const { sql, args } = calls.at(-1);
      assert.equal(args.prUrl, "https://github.com/test_owner/repo.name/pull/12");
      assert.equal(args.prLink, "/pull/12");
      assert.ok(new RegExp(args.prPattern).test(args.prUrl));
      assert.ok(!new RegExp(args.prPattern).test(args.prUrl + "3"));
      assert.ok(!new RegExp(args.prPattern).test("https://github.com/test_owner/other/pull/12"));
      assert.match(sql, /REGEXP_LIKE\(transcript_text/);
    });
    await t.test("invalid input and non-GET methods do not query the database", async () => {
      const count = calls.length;
      for (const query of ["", "?branch=", "?q=ab", "?q=" + "x".repeat(257), "?branch=main&limit=0",
        "?branch=main&limit=21", "?branch=main&limit=1.5", "?project=example", "?pr=-1", "?pr=2147483648",
        "?pr=https://example.com/owner/repo/pull/12", "?pr=https://github.com/owner/repo/issues/12"]) {
        assert.equal((await request("/api/v1/sessions/search" + query)).status, 400);
      }
      for (const method of ["POST", "PUT", "DELETE", "HEAD"]) {
        const res = await request("/api/v1/sessions/search?branch=main", { method });
        assert.equal(res.status, 405);
        assert.equal(res.headers.get("allow"), "GET");
      }
      assert.equal(calls.length, count);
    });
    await t.test("single-session lookup, validation and 404", async () => {
      const res = await request("/api/v1/sessions/session-123");
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { session: row });
      assert.equal(calls.at(-1).args.id, "session-123");
      assert.match(calls.at(-1).sql, /LEFT\(summary, 2000\)/);
      result = [];
      assert.equal((await request("/api/v1/sessions/not-found")).status, 404);
      assert.equal((await request("/api/v1/sessions/invalid%27id")).status, 400);
      result = [row];
    });
    await t.test("database errors do not expose keys or connection details", async () => {
      fail = true;
      for (const path of ["/api/v1/sessions/search?branch=main", "/api/v1/sessions/session-123"]) {
        const res = await request(path);
        assert.equal(res.status, 503);
        const body = await res.text();
        assert.ok(!body.includes(key) && !body.includes("private database"));
      }
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
    for (const name of names) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
  }
});
