import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authClient, clearSession, serviceDb, writeSession } from "@/lib/teacher";

// POST = sign in, DELETE = sign out
export async function POST(request: Request) {
  const b = await request.json().catch(() => null);
  const email = String(b?.email ?? "").trim().toLowerCase();
  const password = String(b?.password ?? "");
  if (!email || !password || email.length > 200 || password.length > 200) {
    return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });
  }

  let auth, db;
  try {
    auth = authClient();
    db = serviceDb();
  } catch {
    return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  }

  const { data, error } = await auth.auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) {
    return NextResponse.json({ error: "Wrong email or password." }, { status: 401 });
  }

  // A valid login is not enough: it must belong to an active teacher.
  const { data: t } = await db
    .from("teachers")
    .select("is_active")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  const teacher = t as { is_active: boolean } | null;

  if (!teacher) {
    return NextResponse.json({ error: "This account is not set up as a teacher." }, { status: 403 });
  }
  if (!teacher.is_active) {
    return NextResponse.json(
      { error: "This teacher account has been deactivated. Please see the school admin." },
      { status: 403 }
    );
  }

  writeSession(await cookies(), data.session);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  clearSession(await cookies());
  return NextResponse.json({ ok: true });
}