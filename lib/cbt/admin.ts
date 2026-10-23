import { createHash } from "crypto";
import { NextResponse } from "next/server";

export const ADMIN_COOKIE = "cbt_admin";

export function adminPassword(): string {
  return process.env.CBT_ADMIN_PASSWORD || "admin1234";
}

export function adminToken(): string {
  return createHash("sha256")
    .update(`dkps-cbt:${adminPassword()}`)
    .digest("hex");
}

export function isAdmin(request: Request): boolean {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${ADMIN_COOKIE}=`));
  return !!match && match.slice(ADMIN_COOKIE.length + 1) === adminToken();
}

export function unauthorized() {
  return NextResponse.json(
    { status: "unauthorized" },
    { status: 401 }
  );
}

export function loginResponse(success: boolean) {
  const res = NextResponse.json({ status: success ? "ok" : "invalid" });
  if (success) {
    res.cookies.set(ADMIN_COOKIE, adminToken(), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });
  }
  return res;
}

export function logoutResponse() {
  const res = NextResponse.json({ status: "ok" });
  res.cookies.set(ADMIN_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
