import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sessionCookie, hintCookie } from "./_auth.js";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  // Expire both cookies immediately.
  res.setHeader("Set-Cookie", [sessionCookie("", 0), hintCookie(0)]);
  res.status(200).json({ ok: true });
}
