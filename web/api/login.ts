import type { VercelRequest, VercelResponse } from "@vercel/node";
import { dbQuery } from "./_db.js";
import {
  hashPassword,
  verifyPassword,
  signToken,
  sessionCookie,
  hintCookie,
  SESSION_TTL_MS,
} from "./_auth.js";

// A throwaway hash compared against when the email is unknown, so a missing
// user and a wrong password take the same time (no user enumeration).
const DUMMY_HASH = hashPassword("dummy-password-for-timing-equalization");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret || !process.env.DATABASE_URL) {
    res.status(500).json({ error: "Auth is not configured on the server." });
    return;
  }

  const body = (typeof req.body === "string" ? safeJson(req.body) : req.body) || {};
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  let storedHash = DUMMY_HASH;
  try {
    const r = await dbQuery(
      "SELECT password_hash FROM auth_users WHERE email = :email",
      { email }
    );
    if (r.rows[0]?.password_hash) storedHash = String(r.rows[0].password_hash);
  } catch {
    /* table may not exist yet — fall through to a guaranteed-fail compare */
  }

  if (!verifyPassword(password, storedHash) || storedHash === DUMMY_HASH) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  const token = signToken({ email, exp: Date.now() + SESSION_TTL_MS }, secret);
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader("Set-Cookie", [sessionCookie(token, maxAge), hintCookie(maxAge)]);
  res.status(200).json({ ok: true });
}

function safeJson(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
