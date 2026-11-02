import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { getPool, getAuthPool } from "../server-build/api/_db.js";
import { hashPassword, verifyToken } from "../server-build/api/_auth.js";
import login from "../server-build/api/login.js";

test("login uses its authentication store and keeps credentials out of logs", async () => {
  const keys = ["DATABASE_URL", "AUTH_DATABASE_URL", "AUTH_SECRET", "NODE_ENV"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, {
    DATABASE_URL: "mysql://localhost:1/session_test",
    AUTH_DATABASE_URL: "mysql://localhost:1/auth_test",
    AUTH_SECRET: randomBytes(48).toString("hex"),
    NODE_ENV: "production",
  });
  const email = "owner@example.test";
  const password = randomBytes(24).toString("hex");
  const stored = hashPassword(password);
  const logs = [];
  const info = console.info;
  const error = console.error;
  console.info = console.error = (line) => logs.push(line);
  const sessions = getPool();
  const auth = getAuthPool();
  sessions.query = async () => { throw new Error("Login queried the session store"); };

  const response = () => ({
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  });
  const request = (value) => ({
    method: "POST", headers: {},
    body: { email: "  OWNER@EXAMPLE.TEST  ", password: value },
  });

  try {
    assert.notEqual(sessions, auth);
    auth.query = async (_sql, args) => {
      assert.equal(args.email, email);
      return [[{ password_hash: stored }]];
    };
    const valid = response();
    await login(request(password), valid);
    assert.equal(valid.statusCode, 200);
    assert.deepEqual(valid.body, { ok: true });
    assert.equal(valid.headers["cache-control"], "no-store");
    const cookies = valid.headers["set-cookie"];
    assert.equal(cookies.length, 2);
    assert.ok(cookies.every((cookie) => cookie.includes("; Secure") && cookie.includes("Path=/")));
    assert.ok(cookies[0].includes("HttpOnly"));
    const token = cookies[0].split(";", 1)[0].slice("auth=".length);
    assert.equal(verifyToken(token, process.env.AUTH_SECRET).email, email);

    const invalid = response();
    await login(request(randomBytes(24).toString("hex")), invalid);
    assert.equal(invalid.statusCode, 401);
    assert.equal(invalid.headers["set-cookie"], undefined);

    auth.query = async () => {
      throw Object.assign(new Error(password), { code: "ER_NO_SUCH_TABLE" });
    };
    const unavailable = response();
    await login(request(password), unavailable);
    assert.equal(unavailable.statusCode, 503);
    assert.ok(!JSON.stringify(unavailable.body).includes(password));
    const output = logs.join("\n");
    for (const sensitive of [email, password, stored, token, process.env.AUTH_SECRET]) {
      assert.ok(!output.includes(sensitive), "Sensitive authentication data appeared in logs");
    }
    assert.deepEqual(logs.map((line) => JSON.parse(line).outcome), [
      "success", "invalid_credentials", "database_error",
    ]);
    delete process.env.AUTH_DATABASE_URL;
    assert.equal(getAuthPool(), sessions, "Single-database deployments retain their existing behavior");
  } finally {
    console.info = info;
    console.error = error;
    await Promise.all([sessions.end(), auth.end()]);
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
