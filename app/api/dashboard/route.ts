import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const bad = (status: string, code = 400) => NextResponse.json({ status }, { status: code });

export async function POST(request: Request) {
  let body: { loginId?: string; pin?: string };
  try { body = await request.json(); } catch { return bad("invalid"); }
  const loginId = String(body.loginId ?? "").trim();
  const pin = String(body.pin ?? "").trim();
  if (!loginId || loginId.length > 50 || !/^\d{4}$/.test(pin)) return bad("invalid");

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return bad("error", 500);
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: auth, error: aerr } = await sb.rpc("cbt_login", { p_login: loginId, p_pin: pin });
  if (aerr) { console.error("cbt_login failed:", aerr.message); return bad("error", 500); }
  const me = auth?.[0];
  if (!me || me.o_status !== "ok") return NextResponse.json({ status: me?.o_status ?? "invalid" });
  const studentId: string = me.o_student_id;
  const classId: string = me.o_class_id;
  const now = Date.now();

  const { data: asms } = await sb.from("assessments")
    .select("id, kind, subject_id, start_at, end_at, opens_at, closes_at")
    .eq("class_id", classId).eq("is_published", true);
  const asmList = asms ?? [];
  const { data: atts } = asmList.length
    ? await sb.from("attempts").select("assessment_id, submitted_at").eq("student_id", studentId).in("assessment_id", asmList.map((a) => a.id))
    : { data: [] as { assessment_id: string; submitted_at: string | null }[] };
  const openTests = asmList.filter((a) => {
    const att = (atts ?? []).find((t) => t.assessment_id === a.id);
    if (att?.submitted_at) return false;
    const start = a.start_at ?? a.opens_at;
    const end = a.end_at ?? a.closes_at;
    if (start && new Date(start).getTime() > now) return false;
    if (end && new Date(end).getTime() < now) return false;
    return true;
  });

  const { data: asgs } = await sb.from("assignments")
    .select("id, subject_id, title, due_at")
    .eq("class_id", classId).eq("is_published", true).order("created_at", { ascending: false });
  const asgList = asgs ?? [];
  const { data: subs } = asgList.length
    ? await sb.from("assignment_submissions").select("assignment_id, score").eq("student_id", studentId).in("assignment_id", asgList.map((a) => a.id))
    : { data: [] as { assignment_id: string; score: number | null }[] };
  const todo = asgList.filter((a) => {
    if ((subs ?? []).some((s) => s.assignment_id === a.id)) return false;
    return !(a.due_at && new Date(a.due_at).getTime() < now);
  });
  const markedCount = (subs ?? []).filter((s) => s.score !== null && s.score !== undefined).length;

  const ids = [loginId];
  const { data: stu } = await sb.from("students").select("previous_login_id").eq("login_id", loginId).maybeSingle();
  if (stu?.previous_login_id) ids.push(stu.previous_login_id);
  const { data: res } = await sb.from("student_results").select("term, session").in("login_id", ids).order("created_at", { ascending: false });

  // The student's subjects: every subject of the class, unless the student has their own list (e.g. SSS electives)
  const { data: cs } = await sb.from("class_subjects").select("subject_id, position").eq("class_id", classId).order("position");
  const { data: mine } = await sb.from("student_subjects").select("subject_id").eq("student_id", studentId);
  const mySet = new Set((mine ?? []).map((x) => x.subject_id));
  const classSubIds = (cs ?? []).map((x) => x.subject_id).filter((id) => mySet.size === 0 || mySet.has(id));

  const subjIds = [...new Set([...openTests.map((a) => a.subject_id), ...todo.map((a) => a.subject_id), ...classSubIds])];
  const { data: subjects } = subjIds.length
    ? await sb.from("subjects").select("id, name").in("id", subjIds)
    : { data: [] as { id: string; name: string }[] };
  const sname = (id: string) => (subjects ?? []).find((s) => s.id === id)?.name ?? "";
  const subjectList = classSubIds.map(sname).filter(Boolean);

  return NextResponse.json({
    status: "ok",
    student: { name: me.o_name, className: me.o_class_name },
    subjects: subjectList,
    tests: {
      count: openTests.length,
      items: openTests.slice(0, 5).map((a) => ({ subject: sname(a.subject_id), kind: a.kind, end: a.end_at ?? a.closes_at })),
    },
    assignments: {
      todoCount: todo.length,
      markedCount,
      items: todo.slice(0, 5).map((a) => ({ title: a.title, subject: sname(a.subject_id), dueAt: a.due_at })),
    },
    results: {
      count: (res ?? []).length,
      latest: res?.[0] ? `${res[0].term} — ${res[0].session}` : null,
    },
  });
}