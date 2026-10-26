import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const bad = (status: string, code = 400) => NextResponse.json({ status }, { status: code });

type Soon = { kind: "test" | "exam" | "assignment"; subject: string; title: string; at: string; label: "opens" | "closes" | "due" };

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

  const { data: cur } = await sb.from("terms").select("term, session").eq("is_active", true).maybeSingle();

  // Prefect role for the current session (none if the student has no role)
  let prefect: { role: string; session: string } | null = null;
  if (cur?.session) {
    const { data: pf } = await sb.from("prefects").select("role").eq("student_id", studentId).eq("session", cur.session).maybeSingle();
    if (pf?.role) prefect = { role: pf.role, session: cur.session };
  }

  // Notices for this student's class (or all classes) that have not expired, newest first
  const nowIso = new Date(now).toISOString();
  const { data: nts } = await sb.from("notices")
    .select("id, title, body, created_at")
    .or(`class_id.is.null,class_id.eq.${classId}`)
    .or(`hide_after.is.null,hide_after.gt.${nowIso}`)
    .order("created_at", { ascending: false }).limit(3);

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
  // Tests not yet submitted and not yet over (open now or opening later), for the Coming up list
  const liveTests = asmList.filter((a) => {
    const att = (atts ?? []).find((t) => t.assessment_id === a.id);
    if (att?.submitted_at) return false;
    const end = a.end_at ?? a.closes_at;
    return !(end && new Date(end).getTime() < now);
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
  // Nearest deadline first; no deadline goes last
  const dueMs = (d: string | null) => (d ? new Date(d).getTime() : Number.MAX_SAFE_INTEGER);
  const todoByDeadline = [...todo].sort((x, y) => dueMs(x.due_at) - dueMs(y.due_at));
  const markedCount = (subs ?? []).filter((s) => s.score !== null && s.score !== undefined).length;

  const ids = [loginId];
  const { data: stu } = await sb.from("students").select("previous_login_id").eq("login_id", loginId).maybeSingle();
  if (stu?.previous_login_id) ids.push(stu.previous_login_id);
  const { data: res } = await sb.from("student_results")
    .select("term, session, grade, average, teacher_remark, school_remark")
    .in("login_id", ids).order("created_at", { ascending: false });

  // The student's subjects: every subject of the class, unless the student has their own list (e.g. SSS electives)
  const { data: cs } = await sb.from("class_subjects").select("subject_id, position").eq("class_id", classId).order("position");
  const { data: mine } = await sb.from("student_subjects").select("subject_id").eq("student_id", studentId);
  const mySet = new Set((mine ?? []).map((x) => x.subject_id));
  const classSubIds = (cs ?? []).map((x) => x.subject_id).filter((id) => mySet.size === 0 || mySet.has(id));

  const subjIds = [...new Set([
    ...openTests.map((a) => a.subject_id), ...liveTests.map((a) => a.subject_id),
    ...todo.map((a) => a.subject_id), ...classSubIds,
  ])];
  const { data: subjects } = subjIds.length
    ? await sb.from("subjects").select("id, name").in("id", subjIds)
    : { data: [] as { id: string; name: string }[] };
  const sname = (id: string) => (subjects ?? []).find((s) => s.id === id)?.name ?? "";
  const subjectList = classSubIds.map(sname).filter(Boolean);

  // Coming up: tests opening or closing, and assignment deadlines, soonest first
  const soon: Soon[] = [];
  for (const a of liveTests) {
    const start = a.start_at ?? a.opens_at;
    const end = a.end_at ?? a.closes_at;
    const kind = a.kind === "exam" ? "exam" : "test";
    if (start && new Date(start).getTime() > now) soon.push({ kind, subject: sname(a.subject_id), title: kind === "exam" ? "Exam" : "Test", at: start, label: "opens" });
    else if (end) soon.push({ kind, subject: sname(a.subject_id), title: kind === "exam" ? "Exam" : "Test", at: end, label: "closes" });
  }
  for (const a of todo) {
    if (a.due_at) soon.push({ kind: "assignment", subject: sname(a.subject_id), title: a.title, at: a.due_at, label: "due" });
  }
  soon.sort((x, y) => new Date(x.at).getTime() - new Date(y.at).getTime());

  const latest = res?.[0];
  return NextResponse.json({
    status: "ok",
    student: { name: me.o_name, className: me.o_class_name, loginId },
    prefect,
    term: cur ? { term: cur.term, session: cur.session } : null,
    notices: (nts ?? []).map((x) => ({ id: x.id, title: x.title, body: x.body, postedAt: x.created_at })),
    subjects: subjectList,
    soon: soon.slice(0, 6),
    tests: {
      count: openTests.length,
      items: openTests.slice(0, 5).map((a) => ({ subject: sname(a.subject_id), kind: a.kind, end: a.end_at ?? a.closes_at })),
    },
    assignments: {
      todoCount: todo.length,
      markedCount,
      items: todoByDeadline.slice(0, 20).map((a) => ({ title: a.title, subject: sname(a.subject_id), dueAt: a.due_at })),
    },
    results: {
      count: (res ?? []).length,
      latest: latest ? `${latest.term} — ${latest.session}` : null,
      grade: latest?.grade ?? null,
      average: latest?.average != null ? Number(latest.average) : null,
      teacherRemark: latest?.teacher_remark ?? null,
    },
  });
}