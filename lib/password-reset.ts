// Stateless reset token: base64url(payload).HMAC(secret, payload + currentPasswordHash)
// - expires after 1 hour
// - single use: once the password changes, the hash changes and the token stops verifying
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

const secret = () => {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET is not set");
  return s;
};

const sign = (payload: string, passwordHash: string) =>
  createHmac("sha256", secret()).update(payload + "." + passwordHash).digest("base64url");

export function makeResetToken(user: { id: string; passwordHash: string }, ttlMs = 60 * 60 * 1000) {
  const payload = Buffer.from(JSON.stringify({ uid: user.id, exp: Date.now() + ttlMs })).toString("base64url");
  return `${payload}.${sign(payload, user.passwordHash)}`;
}

// Step 1: read the user id (not yet trusted)
export function peekResetToken(token: string): string | null {
  try {
    const [payload] = token.split(".");
    const { uid } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { uid?: unknown };
    return typeof uid === "string" ? uid : null;
  } catch {
    return null;
  }
}

// Step 2: verify signature + expiry against the user's CURRENT password hash
export function verifyResetToken(token: string, user: { id: string; passwordHash: string }): boolean {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { uid?: string; exp?: number };
    if (data.uid !== user.id || typeof data.exp !== "number" || data.exp < Date.now()) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(sign(payload, user.passwordHash));
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(72, "At most 72 characters")
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/\d/, "Include at least one number");
