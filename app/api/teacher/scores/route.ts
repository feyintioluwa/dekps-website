import { NextResponse } from "next/server";
import { getTeacher, teacherDenied, type TeacherCtx } from "@/lib/teacher";

type Pair = { class_id: string; subject_id: string };

const pk = (c: string, s: string) => `${c}|${s}`;
// The page and Excel use "ca"; the scores table stores that kind as "test1".
const LIMIT: Record<string, number> = { ca: 40, exam: 60 };

/**
 * Every (class, subject) this teacher may enter scores for:
 *  - a subject teacher: only their own subjects (teacher_subjects)
 *  - a class teacher: EVERY subject their class takes
 */
async function allowedPairs(t: TeacherCtx): Promise<Pair[]> {
  const out = new Map<string, Pair>();
  for (const l of t.subjectLinks) out.set(pk(l.class_id, l.subject_id), l);
  if (t.classTeacherIds.length) {
    const { data } = await t.db.from("class_subjects").select("class_id, subject_id").in("class_id", t.classTeacherIds);
    for (const l of (data ?? []) as Pair[]) out.set(pk(l.class_id, l.subject_id), l);
  }
  return [...out.values()];
}

type Term = { id: string; session: string; term: string; is_active: boolean; is_locked: boolean | null };

async function currentTerm(t: TeacherCtx): Promise<Term | null> {
  const { data } = await t.db.from("terms").select("id, session, term, is_active, is_locked").eq("is_active", true).limit(1);
  return ((data ?? [])[0] as Term | undefined) ?? null;
}

export async function GET(request: Request) {
  const t = await getTeacher();
  if (t.status !== "ok") return teacherDenied(t.status);
  const { db } = t;

  const term = await currentTerm(t);
  const termInfo = term ? { id: term.id, label: `${term.term} — ${term.session}`, locked: !!term.is_locked } : null;

  const pairs = await allowedPairs(t);
  const classIds = [...new Set(pairs.map((p) => p.class_id))];
  const classId = new URL(request.url).searchParams.get("classId");

  // 1) No class chosen: the list of this teacher's classes
  if (!classId) {
    if (!classIds.length) return NextResponse.json({ term: termInfo, classes: [] });
    const { data } = await db.from("classes").select("id, name").in("id", classIds).order("sort_order");
    return NextResponse.json({ term: termInfo, classes: data ?? [] });
  }

  // 2) One class: its students, this teacher's subjects, and the scores already saved
  if (!classIds.includes(classId)) {
    return NextResponse.json({ error: "You do not have access to that class." }, { status: 403 });
  }
  const subjectIds = pairs.filter((p) => p.class_id === classId).map((p) => p.subject_id);

  const [students, cs, subs] = await Promise.all([
    db.from("students").select("id, login_id, name").eq("class_id", classId).eq("is_active", true).order("name"),
    db.from("class_subjects").select("subject_id, position").eq("class_id", classId).in("subject_id", subjectIds).order("position"),
    db.from("subjects").select("id, name").in("id", subjectIds),
  ]);
  if (students.error || cs.error || subs.error) {
    console.error("teacher scores GET failed");
    return NextResponse.json({ error: "Could not load the class." }, { status: 500 });
  }

  const subjects = (cs.data ?? [])
    .map((x) => (subs.data ?? []).find((s) => s.id === x.subject_id))
    .filter((s): s is { id: string; name: string } => Boolean(s));
  const sids = (students.data ?? []).map((s) => s.id);

  const { data: ss } = sids.length
    ? await db.from("student_subjects").select("student_id, subject_id").in("student_id", sids)
    : { data: [] as { student_id: string; subject_id: string }[] };

  const { data: scores } = term && sids.length && subjectIds.length
    ? await db.from("scores").select("student_id, subject_id, kind, score").eq("term_id", term.id).in("student_id", sids).in("subject_id", subjectIds)
    : { data: [] as { student_id: string; subject_id: string; kind: string; score: number }[] };

  return NextResponse.json({
    term: termInfo,
    students: students.data ?? [],
    subjects,
    studentSubjects: ss ?? [],
    scores: (scores ?? []).map((x) => ({ ...x, kind: x.kind === "test1" ? "ca" : x.kind })),
  });
}

export async function POST(request: Request) {
  const t = await getTeacher();
  if (t.status !== "ok") return teacherDenied(t.status);
  const { db } = t;

  const b = await request.json().catch(() => null);
  const fail = (m: string, s = 500) => NextResponse.json({ error: m }, { status: s });
  if (!b || b.action !== "save") return fail("Unknown action", 400);

  // Only the CURRENT term, and only while it is not locked
  const term = await currentTerm(t);
  if (!term) return fail("No current term has been set. Please see the school admin.", 400);
  if (term.is_locked) return fail(`${term.term} — ${term.session} is locked, so scores cannot be changed.`, 400);

  const classId = String(b.classId ?? "");
  const pairs = await allowedPairs(t);
  const mine = new Set(pairs.filter((p) => p.class_id === classId).map((p) => p.subject_id));
  if (!mine.size) return fail("You do not have access to that class.", 403);

  const rows = (Array.isArray(b.rows) ? b.rows : []) as { loginId: string; scores: { subjectId: string; kind: string; score: number }[] }[];
  if (rows.length > 500) return fail("Too many students in one upload.", 400);

  const { data: studs } = await db.from("students").select("id, login_id").eq("class_id", classId).eq("is_active", true);
  const byLogin = new Map((studs ?? []).map((s) => [s.login_id as string, s.id as string]));
  const { data: ss } = studs?.length
    ? await db.from("student_subjects").select("student_id, subject_id").in("student_id", studs.map((s) => s.id))
    : { data: [] as { student_id: string; subject_id: string }[] };
  const electives = new Map<string, Set<string>>();
  for (const x of ss ?? []) {
    if (!electives.has(x.student_id)) electives.set(x.student_id, new Set());
    electives.get(x.student_id)!.add(x.subject_id);
  }

  const out: { student_id: string; subject_id: string; kind: string; score: number }[] = [];
  const unknown: string[] = [];
  const bad: string[] = [];
  let notTaking = 0;

  for (const r of rows) {
    const sid = byLogin.get(String(r.loginId));
    if (!sid) { unknown.push(String(r.loginId)); continue; }
    for (const s of Array.isArray(r.scores) ? r.scores : []) {
      if (!mine.has(s.subjectId)) { bad.push("a subject that is not yours"); continue; }
      if (!["ca", "exam"].includes(s.kind) || !Number.isInteger(s.score) || s.score < 0) { bad.push("an invalid score"); continue; }
      if (s.score > LIMIT[s.kind]) { bad.push(`${s.kind === "ca" ? "CA" : "Exam"} ${s.score} (max ${LIMIT[s.kind]})`); continue; }
      const own = electives.get(sid);
      if (own && own.size && !own.has(s.subjectId)) { notTaking++; continue; } // student does not take this subject
      out.push({ student_id: sid, subject_id: s.subjectId, kind: s.kind === "ca" ? "test1" : "exam", score: s.score });
    }
  }
  if (bad.length) {
    return fail(`Nothing saved. The file has ${[...new Set(bad)].slice(0, 6).join("; ")}.`, 400);
  }

  let saved = 0;
  for (let i = 0; i < out.length; i += 400) {
    const { data, error } = await db.rpc("teacher_save_scores", { p_term: term.id, p_class: classId, p_rows: out.slice(i, i + 400) });
    if (error) { console.error("teacher_save_scores failed:", error.message); return fail("Could not save the scores. " + error.message); }
    saved += Number(data);
  }
  return NextResponse.json({ ok: true, saved, unknown, notTaking });
}