import { NextResponse } from "next/server";
import { adminClient } from "@/lib/admin";

// Change this list to add or remove roles. Gold, blue and green colours are decided on the dashboard.
const ROLES = [
  "Head Boy", "Head Girl",
  "Assistant Head Boy", "Assistant Head Girl",
  "Labour Prefect",
  "Library/Laboratory Prefect", "Health Prefect", "Time Keeper", "Chapel Prefect", "Assistant Labour Prefect",
  "Assistant Library/Laboratory Prefect", "Assistant Health Prefect", "Assistant Time Keeper", "Assistant Social Prefect", "Social Prefect",
  "Publicity Prefect 1", "Publicity Prefect 2",
];

export async function GET(request: Request) {
  const c = adminClient(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const { sb } = c;
  const classId = new URL(request.url).searchParams.get("classId");

  const { data: cur } = await sb.from("terms").select("session").eq("is_active", true).maybeSingle();
  const session: string | null = cur?.session ?? null;
  const { data: classes } = await sb.from("classes").select("id, name").order("sort_order");

  let students: { id: string; name: string; login_id: string }[] = [];
  if (classId) {
    const { data } = await sb.from("students").select("id, name, login_id").eq("class_id", classId).eq("is_active", true).order("name");
    students = data ?? [];
  }

  let prefects: { id: string; role: string; name: string; loginId: string; className: string }[] = [];
  if (session) {
    const { data: pf } = await sb.from("prefects").select("id, role, student_id").eq("session", session);
    const ids = (pf ?? []).map((x) => x.student_id);
    const { data: studs } = ids.length
      ? await sb.from("students").select("id, name, login_id, class_id").in("id", ids)
      : { data: [] as { id: string; name: string; login_id: string; class_id: string }[] };
    const cname = new Map((classes ?? []).map((k) => [k.id, k.name]));
    prefects = (pf ?? []).map((x) => {
      const s = (studs ?? []).find((y) => y.id === x.student_id);
      return { id: x.id, role: x.role, name: s?.name ?? "", loginId: s?.login_id ?? "", className: s ? cname.get(s.class_id) ?? "" : "" };
    }).sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
  }

  return NextResponse.json({ session, roles: ROLES, classes: classes ?? [], students, prefects });
}

export async function POST(request: Request) {
  const c = adminClient(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const { sb } = c;
  const b = await request.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const fail = (m: string, s = 500) => NextResponse.json({ error: m }, { status: s });

  // Give a student a role for the current session (replaces their role if they already have one)
  if (b.action === "set") {
    const role = String(b.role ?? "");
    if (!ROLES.includes(role)) return fail("Choose a role from the list", 400);
    if (!b.studentId) return fail("Choose a student", 400);
    const { data: cur } = await sb.from("terms").select("session").eq("is_active", true).maybeSingle();
    if (!cur?.session) return fail("No current term is set, so there is no current session", 400);
    const { data: st } = await sb.from("students").select("id").eq("id", String(b.studentId)).eq("is_active", true).maybeSingle();
    if (!st) return fail("That student was not found", 400);
    const { error } = await sb.from("prefects").upsert(
      { student_id: st.id, session: cur.session, role },
      { onConflict: "student_id,session" },
    );
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
  }

  if (b.action === "remove") {
    if (!b.id) return fail("Missing prefect", 400);
    const { error } = await sb.from("prefects").delete().eq("id", String(b.id));
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
  }

  return fail("Unknown action", 400);
}