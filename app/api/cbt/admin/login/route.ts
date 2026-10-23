import { NextResponse } from "next/server";
import { loginResponse, logoutResponse, adminPassword } from "@/lib/cbt/admin";

export async function POST(request: Request) {
  let body: { password?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  if (body.action === "logout") return logoutResponse();

  const password = String(body.password ?? "");
  return loginResponse(password === adminPassword());
}
