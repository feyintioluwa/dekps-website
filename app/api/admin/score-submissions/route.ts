import { NextResponse } from "next/server";
import { adminClient } from "@/lib/admin";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

type Mark = { student_id: string; kind: string; score: number };

export async function GET(req: Request) {
  const c = adminClient(req);
  if ("error" in c) return bad(c.error ?? "Admin access denied.", c.status ?? 403);
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const { data: submission, error: submissionError } = await c.sb.from("score_submissions")
      .select("id,term_id,class_id,subject_id,teacher_id,status,review_note,submitted_at")
      .eq("id", id).maybeSingle();
    if (submissionError) return bad("Could not load the submission.", 500);
    if (!submission) return bad("Submission not found.", 404);

    const [studentsResult, termResult, classResult, subjectResult, teacherResult] = await Promise.all([
      c.sb.from("students").select("id,login_id,name").eq("class_id", submission.class_id).eq("is_active", true).order("name"),
      c.sb.from("terms").select("term,session").eq("id", submission.term_id).maybeSingle(),
      c.sb.from("classes").select("name").eq("id", submission.class_id).maybeSingle(),
      c.sb.from("subjects").select("name").eq("id", submission.subject_id).maybeSingle(),
      c.sb.from("teachers").select("name").eq("id", submission.teacher_id).maybeSingle(),
    ]);
    if (studentsResult.error || termResult.error || classResult.error || subjectResult.error || teacherResult.error)
      return bad("Could not load submission details.", 500);
    const students = studentsResult.data ?? [];
    const studentIds = students.map(s => s.id);
    const [electivesResult, marksResult] = await Promise.all([
      studentIds.length ? c.sb.from("student_subjects").select("student_id,subject_id").in("student_id", studentIds)
        : Promise.resolve({ data: [], error: null }),
      studentIds.length ? c.sb.from("scores").select("student_id,kind,score")
        .eq("term_id", submission.term_id).eq("subject_id", submission.subject_id).in("student_id", studentIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (electivesResult.error || marksResult.error) return bad("Could not load student marks.", 500);
    const subjectsByStudent = new Map<string, Set<string>>();
    for (const entry of electivesResult.data ?? []) {
      if (!subjectsByStudent.has(entry.student_id)) subjectsByStudent.set(entry.student_id, new Set());
      subjectsByStudent.get(entry.student_id)!.add(entry.subject_id);
    }
    const eligible = students.filter(s => {
      const subjects = subjectsByStudent.get(s.id);
      return !subjects || subjects.size === 0 || subjects.has(submission.subject_id);
    });
    const byStudent = new Map<string, { ca: number | null; exam: number | null; duplicate: boolean }>();
    for (const score of (marksResult.data ?? []) as Mark[]) {
      const kind = score.kind === "test1" || score.kind === "ca" ? "ca" : score.kind === "exam" ? "exam" : null;
      if (!kind) continue;
      const row = byStudent.get(score.student_id) ?? { ca: null, exam: null, duplicate: false };
      if (row[kind] !== null) row.duplicate = true;
      row[kind] = score.score;
      byStudent.set(score.student_id, row);
    }
    const rows = eligible.map(s => {
      const mark = byStudent.get(s.id);
      const ca = mark?.ca ?? null;
      const exam = mark?.exam ?? null;
      const valid = ca !== null && exam !== null && Number.isInteger(ca) && Number.isInteger(exam)
        && ca >= 0 && ca <= 40 && exam >= 0 && exam <= 60 && !mark?.duplicate;
      return { student_id: s.id, login_id: s.login_id, name: s.name, ca, exam,
        total: valid ? ca + exam : null, complete: valid,
        issue: mark?.duplicate ? "Duplicate marks" : ca === null || exam === null ? "Missing marks" : valid ? "" : "Invalid marks" };
    });
    const complete = rows.filter(r => r.complete).length;
    return NextResponse.json({ submission: {
      ...submission, class_name: classResult.data?.name ?? "Unknown class",
      subject_name: subjectResult.data?.name ?? "Unknown subject",
      teacher_name: teacherResult.data?.name ?? "Unknown teacher",
      term_label: termResult.data ? `${termResult.data.term} — ${termResult.data.session}` : "Unknown term",
    }, rows, total: rows.length, complete, ready: rows.length > 0 && complete === rows.length });
  }
  const { data, error } = await c.sb.from("score_submissions")
    .select("id,term_id,class_id,subject_id,teacher_id,status,review_note,submitted_at,reviewed_at")
    .order("updated_at", { ascending: false }).limit(500);
  if (error) return bad("Could not load submissions. Run the Stage 14 SQL migration.", 500);
  const items = data ?? [];
  const names = async (table: string, ids: string[]) => {
    if (!ids.length) return new Map<string, string>();
    const r = await c.sb.from(table).select("id,name").in("id", ids);
    return new Map<string, string>((r.data ?? []).map(x => [x.id, x.name]));
  };
  const ids = (key: "class_id" | "subject_id" | "teacher_id") => [...new Set(items.map(x => x[key]))];
  const [classes, subjects, teachers] = await Promise.all([
    names("classes", ids("class_id")), names("subjects", ids("subject_id")), names("teachers", ids("teacher_id")),
  ]);
  return NextResponse.json({ items: items.map(x => ({ ...x,
    class_name: classes.get(x.class_id) ?? x.class_id,
    subject_name: subjects.get(x.subject_id) ?? x.subject_id,
    teacher_name: teachers.get(x.teacher_id) ?? x.teacher_id,
  })) });
}

export async function POST(req: Request) {
  const c = adminClient(req);
  if ("error" in c) return bad(c.error ?? "Admin access denied.", c.status ?? 403);
  const b = await req.json().catch(() => null);
  if (!b || typeof b.id !== "string" || !["approve", "return"].includes(b.action) || typeof b.note !== "string")
    return bad("Invalid decision");
  // The database function must recheck completeness atomically at approval time.
  const { data, error } = await c.sb.rpc("stage14_admin_transition", {
    p_id: b.id, p_action: b.action, p_note: b.note.slice(0, 1000),
  });
  return error ? bad(error.message, 409) : NextResponse.json({ ok: true, status: data });
}
