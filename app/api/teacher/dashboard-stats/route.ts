import { NextResponse } from "next/server";
import { getTeacher, teacherDenied } from "@/lib/teacher";

type Pair = { class_id: string; subject_id: string };
type Assignment = { id: string; class_id: string; subject_id: string; is_published: boolean };
type Assessment = { class_id: string; subject_id: string; is_published: boolean };
type Submission = { assignment_id: string; score: number | null };
type Student = { id: string; class_id: string };
type Enrollment = { student_id: string; subject_id: string };
type Score = { student_id: string; subject_id: string; kind: string };
const key = (c: string, s: string) => `${c}|${s}`;

export async function GET() {
  const t = await getTeacher();
  if (t.status !== "ok") return teacherDenied(t.status);
  try {
    const db = t.db;
    const { data: active, error: termError } = await db.from("terms")
      .select("id").eq("is_active", true).limit(1);
    if (termError) throw termError;
    const termId = active?.[0]?.id;
    if (!termId) return NextResponse.json({ noActiveTerm: true, pendingTasks: null, missingScores: null });

    const pairs = new Map<string, Pair>();
    for (const p of t.subjectLinks) pairs.set(key(p.class_id, p.subject_id), p);
    if (t.classTeacherIds.length) {
      const { data, error } = await db.from("class_subjects")
        .select("class_id, subject_id").in("class_id", t.classTeacherIds);
      if (error) throw error;
      for (const p of (data ?? []) as Pair[]) pairs.set(key(p.class_id, p.subject_id), p);
    }
    const allowed = new Set(pairs.keys());
    const classIds = [...new Set([...pairs.values()].map((p) => p.class_id))];
    if (!classIds.length) return NextResponse.json({ pendingTasks: 0, missingScores: 0, drafts: 0, unmarked: 0 });

    // Page through results: Supabase commonly caps responses at 1,000 rows.
    async function pages<T>(makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
      const result: T[] = [];
      for (let start = 0; ; start += 1000) {
        const { data, error } = await makeQuery(start, start + 999);
        if (error) throw new Error(error.message);
        result.push(...(data ?? []));
        if (!data || data.length < 1000) return result;
      }
    }

    const [assignments, assessments, students] = await Promise.all([
      pages<Assignment>((a, b) => db.from("assignments").select("id, class_id, subject_id, is_published")
        .eq("term_id", termId).in("class_id", classIds).order("id").range(a, b)),
      pages<Assessment>((a, b) => db.from("assessments").select("class_id, subject_id, is_published")
        .eq("term_id", termId).in("class_id", classIds).order("id").range(a, b)),
      pages<Student>((a, b) => db.from("students").select("id, class_id")
        .in("class_id", classIds).eq("is_active", true).order("id").range(a, b)),
    ]);
    const ownAssignments = assignments.filter((x) => allowed.has(key(x.class_id, x.subject_id)));
    const drafts = ownAssignments.filter((x) => !x.is_published).length +
      assessments.filter((x) => allowed.has(key(x.class_id, x.subject_id)) && !x.is_published).length;
    let unmarked = 0;
    const publishedIds = ownAssignments.filter((x) => x.is_published).map((x) => x.id);
    for (let i = 0; i < publishedIds.length; i += 50) {
      const ids = publishedIds.slice(i, i + 50);
      const rows = await pages<Submission>((a, b) => db.from("assignment_submissions")
        .select("assignment_id, score").in("assignment_id", ids).order("id").range(a, b));
      unmarked += rows.filter((r) => r.score == null).length;
    }

    const studentIds = students.map((s) => s.id);
    const enrollments: Enrollment[] = [];
    const scores: Score[] = [];
    for (let i = 0; i < studentIds.length; i += 100) {
      const ids = studentIds.slice(i, i + 100);
      const [enrolled, marked] = await Promise.all([
        pages<Enrollment>((a, b) => db.from("student_subjects")
          .select("student_id, subject_id").in("student_id", ids).order("student_id").order("subject_id").range(a, b)),
        pages<Score>((a, b) => db.from("scores")
          .select("student_id, subject_id, kind").eq("term_id", termId)
          .in("student_id", ids).in("kind", ["test1", "exam"])
          .order("student_id").order("subject_id").order("kind").range(a, b)),
      ]);
      enrollments.push(...enrolled);
      scores.push(...marked);
    }
    const enrolledByStudent = new Map<string, Set<string>>();
    for (const row of enrollments) {
      if (!enrolledByStudent.has(row.student_id)) enrolledByStudent.set(row.student_id, new Set());
      enrolledByStudent.get(row.student_id)!.add(row.subject_id);
    }
    const saved = new Set(scores.map((s) => `${s.student_id}|${s.subject_id}|${s.kind}`));
    const byClass = new Map<string, string[]>();
    for (const p of pairs.values()) {
      if (!byClass.has(p.class_id)) byClass.set(p.class_id, []);
      byClass.get(p.class_id)!.push(p.subject_id);
    }
    let missingScores = 0;
    for (const student of students) {
      const enrolled = enrolledByStudent.get(student.id);
      for (const subjectId of byClass.get(student.class_id) ?? []) {
        // Match the existing scores API: no enrolment rows means all class subjects.
        if (enrolled?.size && !enrolled.has(subjectId)) continue;
        if (!saved.has(`${student.id}|${subjectId}|test1`)) missingScores++;
        if (!saved.has(`${student.id}|${subjectId}|exam`)) missingScores++;
      }
    }
    return NextResponse.json({ pendingTasks: drafts + unmarked, missingScores, drafts, unmarked });
  } catch (error) {
    console.error("Teacher dashboard stats error:", error);
    return NextResponse.json({ error: "Could not load dashboard statistics." }, { status: 500 });
  }
}
