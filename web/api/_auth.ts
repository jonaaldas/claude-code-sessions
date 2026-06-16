// Shared auth helpers for the serverless functions. Files in /api prefixed with
// `_` are NOT turned into routes by Vercel — they're importable internals.
//
// Design: single-user, stateless. Passwords are scrypt-hashed in the
// `auth_users` table. A successful login mints a signed (HMAC-SHA256) cookie
// carrying { email, exp }; /api/sessions trusts that cookie to lift the public
// privacy gate. No server-side session store — the signature is the proof.
import crypto from "node:crypto";
import type { VercelRequest } from "@vercel/node";

export const COOKIE_NAME = "auth";
// A non-secret, JS-readable hint mirroring the HttpOnly auth cookie's lifetime.
// Lets the frontend know to request fresh (uncached) data so a logged-in owner
// never gets served the publicly-cached gated response. NOT used for auth.
export const HINT_COOKIE = "dash_authed";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// scrypt password hashing: stored as "salt:hash" (both hex).
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = (stored || "").split(":");
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = crypto.scryptSync(password, salt, 64);
  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(expected, actual)
  );
}

// Stateless signed token: base64url(payload).base64url(hmac).
export function signToken(payload: object, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(
  token: string,
  secret: string
): { email: string; exp: number } | null {
  const [body, sig] = (token || "").split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!payload?.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(req: VercelRequest): Record<string, string> {
  const header = req.headers.cookie || "";
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** True if the request carries a valid, unexpired auth cookie. */
export function isAuthed(req: VercelRequest): boolean {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return false; // fail closed when auth isn't configured
  const token = parseCookies(req)[COOKIE_NAME];
  return token ? verifyToken(token, secret) !== null : false;
}

export function sessionCookie(value: string, maxAgeSec: number): string {
  // HttpOnly so JS can't read it; Secure in prod; Lax is fine (same-site app).
  const secure = process.env.VERCEL ? "; Secure" : "";
  return `${COOKIE_NAME}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

// Readable companion to sessionCookie (no HttpOnly) — a UI hint only.
export function hintCookie(maxAgeSec: number): string {
  const secure = process.env.VERCEL ? "; Secure" : "";
  return `${HINT_COOKIE}=1; Path=/; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}
