import { cookies } from "next/headers";
import { connection } from "next/server";
import { createClient } from "@supabase/supabase-js";

const ACCESS = "dkps_t_access";
const REFRESH = "dkps_t_refresh";

/** Server-only client with full database access. Always authorise first. */
export function serviceDb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Server not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Publishable-key client: used ONLY to check an email + password and refresh a session. */
export function authClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Server not configured");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Jar = Awaited<ReturnType<typeof cookies>>;
type Sess = { access_token: string; refresh_token: string; expires_in: number };

export function writeSession(jar: Jar, s: Sess) {
  const base = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
  jar.set(ACCESS, s.access_token, { ...base, maxAge: s.expires_in });
  jar.set(REFRESH, s.refresh_token, { ...base, maxAge: 60 * 60 * 24 * 30 });
}

export function clearSession(jar: Jar) {
  for (const name of [ACCESS, REFRESH]) jar.set(name, "", { path: "/", maxAge: 0 });
}

export type TeacherCtx = {
  db: ReturnType<typeof serviceDb>;
  teacher: { id: string; name: string; email: string };
  /** Classes where this teacher is the class teacher (sees every subject). */
  classTeacherIds: string[];
  /** Subject-teacher links: one row per class + subject. */
  subjectLinks: { class_id: string; subject_id: string }[];
  /** Every class this teacher may open. */
  allowedClassIds: string[];
};

export type TeacherResult =
  | ({ status: "ok" } & TeacherCtx)
  | { status: "anon" | "inactive" | "not_teacher" | "error" };

/**
 * Works out who is calling from the sign-in cookie, then loads what they are
 * allowed to see. Call this at the top of EVERY teacher route.
 */
export async function getTeacher(): Promise<TeacherResult> {
  await connection(); // tells Next this runs per request, never at build time
  try {
    const jar = await cookies();
    const db = serviceDb();

    let userId: string | null = null;
    const access = jar.get(ACCESS)?.value;
    const refresh = jar.get(REFRESH)?.value;

    if (access) {
      const { data } = await db.auth.getUser(access);
      userId = data.user?.id ?? null;
    }

    // Access token missing or expired: quietly renew it.
    if (!userId && refresh) {
      const { data, error } = await authClient().auth.refreshSession({ refresh_token: refresh });
      if (!error && data.session && data.user) {
        writeSession(jar, data.session);
        userId = data.user.id;
      }
    }

    if (!userId) return { status: "anon" };

    const { data: t } = await db
      .from("teachers")
      .select("id, name, email, is_active")
      .eq("auth_user_id", userId)
      .maybeSingle();
    const teacher = t as { id: string; name: string; email: string; is_active: boolean } | null;

    if (!teacher) return { status: "not_teacher" };
    if (!teacher.is_active) return { status: "inactive" };

    const [tc, ts] = await Promise.all([
      db.from("teacher_classes").select("class_id").eq("teacher_id", teacher.id),
      db.from("teacher_subjects").select("class_id, subject_id").eq("teacher_id", teacher.id),
    ]);
    if (tc.error || ts.error) return { status: "error" };

    const classTeacherIds = ((tc.data ?? []) as { class_id: string }[]).map((r) => r.class_id);
    const subjectLinks = (ts.data ?? []) as { class_id: string; subject_id: string }[];
    const allowedClassIds = [...new Set([...classTeacherIds, ...subjectLinks.map((r) => r.class_id)])];

    return {
      status: "ok",
      db,
      teacher: { id: teacher.id, name: teacher.name, email: teacher.email },
      classTeacherIds,
      subjectLinks,
      allowedClassIds,
    };
  } catch (e) {
    console.error("getTeacher failed:", (e as Error).message);
    return { status: "error" };
  }
}

/** Standard JSON error for a failed getTeacher(). */
export function teacherDenied(status: "anon" | "inactive" | "not_teacher" | "error") {
  const map = {
    anon: [401, "Please sign in."],
    inactive: [403, "This teacher account has been deactivated. Please see the school admin."],
    not_teacher: [403, "This account is not set up as a teacher."],
    error: [500, "Something went wrong. Please try again."],
  } as const;
  const [code, error] = map[status];
  return Response.json({ error }, { status: code });
}