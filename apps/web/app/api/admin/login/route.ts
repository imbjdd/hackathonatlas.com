import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  adminSecret,
  secretMatches,
} from "../../../../src/lib/admin-auth";

// Accepts the /admin login form (a plain HTML POST, no JS required). On a
// correct secret it sets the session cookie and redirects back to /admin;
// otherwise it redirects with ?error=1 so the form can show a message.
export async function POST(request: NextRequest) {
  const secret = adminSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "ADMIN_SECRET is not configured" },
      { status: 500 },
    );
  }

  const form = await request.formData();
  const provided = String(form.get("secret") ?? "");

  if (!secretMatches(provided)) {
    // 303 forces the follow-up request to be a GET.
    return NextResponse.redirect(new URL("/admin?error=1", request.url), 303);
  }

  const res = NextResponse.redirect(new URL("/admin", request.url), 303);
  res.cookies.set(ADMIN_COOKIE, secret, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // Secure flag on HTTPS only, so the cookie still works over local http.
    secure: request.nextUrl.protocol === "https:",
    maxAge: 60 * 60 * 24 * 7, // 1 week
  });
  return res;
}
