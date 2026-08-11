// Minimal shared-secret auth for the /admin moderation page.
//
// The secret lives only in the ADMIN_SECRET env var (set on Railway, never
// committed) — so the code can be open source without exposing access. On a
// correct login we drop an httpOnly cookie holding the secret and check it on
// every admin request with a constant-time compare.

import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "admin_session";

export function adminSecret(): string | null {
  return process.env.ADMIN_SECRET || null;
}

export function secretMatches(provided: string | undefined | null): boolean {
  const secret = adminSecret();
  if (!secret || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  // timingSafeEqual throws on length mismatch, so guard first.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return secretMatches(store.get(ADMIN_COOKIE)?.value);
}
