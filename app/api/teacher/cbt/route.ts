import { NextResponse } from "next/server";
import { getTeacher, teacherDenied, type TeacherCtx } from "@/lib/teacher";

type Pair = { class_id: string; subject_id: string };
type Asm = { id: string; kind: string; class_id: string; subject_id: string; is_published: boolean | null };
type QIn = { question: string; a: string; b: string; c: string; d: string; correct: string };

const pk = (c: string, s: string) => `${c}|${s}`;
const LETTERS = ["A", "B", "C", "D"];

/**
 * Every (class, subject) this teacher may work on:
 *  - a subject teacher: the rows in teacher_subjects
 *  - a class teacher: every subject their class takes
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

/** Checks one question of a QIn: A and B, a valid answer, and the answer's option is not empty. */
function validQuestion(q: QIn): boolean {
  if (!q || !String(q.question ?? "").trim() || !String(q.a ?? "").trim() || !String(q.b ?? "").trim()) return false;
  if (!LETTERS.includes(q.correct)) return false;
  const opt = { A: q.a, B: q.b, C: q.c, D: q.d }[q.correct as "A" | "B" | "C" | "D"];
  return !!String(opt ?? "").trim();
}

export async function GET() {
  const t = await getTeacher();
  if (t.status !== "ok") return teacherDenied(t.status);
  const { db } = t;

  const pairs = await allowedPairs(t);
  const classIds = [...new Set(pairs.map((p) => p.class_id))];
  const subjectIds = [...new Set(pairs.map((p) => p.subject_id))];
  if (!classIds.length) {
    return NextResponse.json({ classes: [], subjects: [], classSubjects: [], terms: [], assessments: [] });
  }
  const ok = new Set(pairs.map((p) => pk(p.class_id, p.subject_id)));

  const [classes, subjects, terms, assessments] = await Promise.all([
    db.from("classes").select("id, name").in("id", classIds).order("sort_order"),
    db.from("subjects").select("id, name").in("id", subjectIds).order("name"),
    db.from("terms").select("*"),
    db.from("assessments")
      .select("id, kind, class_id, subject_id, term_id, max_score, duration_minutes, start_at, end_at, is_published, instructions, created_at")
      .in("class_id", classIds).in("subject_id", subjectIds)
      .order("created_at", { ascending: false }).limit(200),
  ]);

  const list = ((assessments.data ?? []) as (Asm & Record<string, unknown>)[]).filter((a) => ok.has(pk(a.class_id, a.subject_id)));

  return NextResponse.json({
    classes: classes.data ?? [],
    subjects: subjects.data ?? [],
    classSubjects: pairs,
    terms: terms.error ? null : terms.data,
    assessments: list,
  });
}

export async function POST(request: Request) {
  const t = await getTeacher();
  if (t.status !== "ok") return teacherDenied(t.status);
  const { db: sb } = t;

  const b = await request.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const fail = (m: string, s = 500) => NextResponse.json({ error: m }, { status: s });

  const pairs = await allowedPairs(t);
  const ok = new Set(pairs.map((p) => pk(p.class_id, p.subject_id)));

  // Loads a test/exam ONLY if it is one of this teacher's own class + subject combinations
  async function own(id: unknown): Promise<Asm | null> {
    const aid = String(id ?? "");
    if (!aid) return null;
    const { data } = await sb.from("assessments").select("id, kind, class_id, subject_id, is_published").eq("id", aid).maybeSingle();
    const a = data as Asm | null;
    return a && ok.has(pk(a.class_id, a.subject_id)) ? a : null;
  }
  const started = async (assessmentId: string) => {
    const { count } = await sb.from("attempts").select("id", { count: "exact", head: true }).eq("assessment_id", assessmentId);
    return !!count;
  };
  // A question may only be touched through a test the teacher owns
  async function ownQuestion(questionId: unknown): Promise<{ id: string; assessment_id: string } | null> {
    const qid = String(questionId ?? "");
    if (!qid) return null;
    const { data } = await sb.from("questions").select("id, assessment_id").eq("id", qid).maybeSingle();
    const q = data as { id: string; assessment_id: string } | null;
    if (!q || !(await own(q.assessment_id))) return null;
    return q;
  }

  if (b.action === "createMany") {
    const classIds = ((b.classIds ?? []) as string[]).map(String);
    const subjectId = String(b.subjectId ?? "");
    if (!b.termId || !subjectId || !classIds.length) return fail("Choose a term, at least one class and a subject", 400);
    const duration = Math.floor(Number(b.duration));
    if (!(duration > 0 && duration <= 600)) return fail("Time allowed must be between 1 and 600 minutes", 400);

    const good = classIds.filter((id) => ok.has(pk(id, subjectId)));
    const bad = classIds.filter((id) => !ok.has(pk(id, subjectId)));
    if (!good.length) return fail("You do not teach that subject in the ticked classes", 400);

    const rows = good.map((class_id) => ({
      term_id: b.termId, class_id, subject_id: subjectId,
      kind: b.kind === "exam" ? "exam" : "test1",
      mode: "cbt",
      max_score: b.kind === "exam" ? 60 : Number(b.maxScore) === 20 ? 20 : 40,
      duration_minutes: duration,
      start_at: null, end_at: null, opens_at: null, closes_at: null,
      instructions: String(b.instructions ?? "").trim().slice(0, 3000) || null,
      is_published: false,
    }));
    const { data, error } = await sb.from("assessments").insert(rows).select("id");
    if (error) { console.error("teacher cbt createMany failed:", error.message); return fail("Could not create the test."); }
    const { data: cl } = bad.length ? await sb.from("classes").select("id, name").in("id", bad) : { data: [] as { id: string; name: string }[] };
    return NextResponse.json({ ok: true, ids: (data ?? []).map((r) => r.id), skipped: (cl ?? []).map((c) => c.name) });
  }

  if (b.action === "questions") {
    const qs = (b.questions ?? []) as QIn[];
    if (!b.assessmentId || !qs.length) return fail("Nothing to add", 400);
    if (qs.length > 200) return fail("Add at most 200 questions at a time", 400);
    if (!qs.every(validQuestion)) return fail("Every question needs a question, options A and B, and an answer whose option is filled in", 400);

    const main = String(b.assessmentId);
    if (!(await own(main))) return fail("Test not found", 404);
    if (await started(main)) return fail("Students have already started this one, so questions cannot be added.", 400);

    const targets = [...new Set([main, ...((b.alsoIds ?? []) as string[]).map(String)])];
    let tests = 0;
    let skipped = 0;
    for (const id of targets) {
      if (id !== main && (!(await own(id)) || (await started(id)))) { skipped++; continue; }
      const { data: last } = await sb.from("questions").select("position").eq("assessment_id", id).order("position", { ascending: false }).limit(1);
      let pos = (last?.[0] as { position?: number } | undefined)?.position ?? 0;
      const rows = qs.map((q) => ({
        assessment_id: id, position: ++pos, question: String(q.question).trim().slice(0, 1500),
        option_a: String(q.a).trim().slice(0, 300), option_b: String(q.b).trim().slice(0, 300),
        option_c: String(q.c ?? "").trim().slice(0, 300), option_d: String(q.d ?? "").trim().slice(0, 300),
        correct: q.correct,
      }));
      const { error } = await sb.from("questions").insert(rows);
      if (error) { console.error("teacher cbt questions failed:", error.message); return fail("Could not add the questions."); }
      tests++;
    }
    return NextResponse.json({ ok: true, added: qs.length, tests, skipped });
  }

  // Build an exam from the teacher's own tests of the same subject (question bank)
  if (b.action === "pull") {
    const exam = await own(b.assessmentId);
    if (!exam) return fail("Exam not found", 404);
    if (exam.kind !== "exam") return fail("Only an exam can be built from tests", 400);
    if (await started(exam.id)) return fail("Students have already started this exam, so its questions cannot be changed.", 400);

    const asked = ((b.sourceIds ?? []) as string[]).map(String);
    const count = Math.max(1, Math.min(200, Number(b.count) || 10));
    if (!asked.length) return fail("Choose source tests", 400);

    const { data: src } = await sb.from("assessments").select("id, kind, class_id, subject_id, is_published").in("id", asked);
    const sources = ((src ?? []) as Asm[]).filter((a) => a.kind === "test1" && a.subject_id === exam.subject_id && ok.has(pk(a.class_id, a.subject_id)));
    if (!sources.length) return fail("Choose tests of this subject that you teach", 400);

    const { data: pool } = await sb.from("questions").select("id").in("assessment_id", sources.map((s) => s.id));
    const { data: have } = await sb.from("exam_questions").select("question_id, position").eq("exam_id", exam.id);
    const taken = new Set((have ?? []).map((r) => r.question_id));
    const ids = (pool ?? []).map((r) => r.id as string).filter((id) => !taken.has(id));
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const pick = ids.slice(0, count);
    let pos = Math.max(0, ...(have ?? []).map((r) => (r.position as number | null) ?? 0));
    const rows = pick.map((question_id) => ({ exam_id: exam.id, question_id, position: ++pos }));
    if (rows.length) {
      const { error } = await sb.from("exam_questions").insert(rows);
      if (error) { console.error("teacher cbt pull failed:", error.message); return fail("Could not pull the questions."); }
    }
    return NextResponse.json({ ok: true, added: rows.length, available: ids.length });
  }

  if (b.action === "publish") {
    const a = await own(b.assessmentId);
    if (!a) return fail("Test not found", 404);
    const { error } = await sb.from("assessments").update({ is_published: !!b.value }).eq("id", a.id);
    if (error) return fail("Could not update the test.");
    return NextResponse.json({ ok: true });
  }

  if (b.action === "results") {
    const a = await own(b.assessmentId);
    if (!a) return fail("Test not found", 404);
    const { data: atts, error } = await sb.from("attempts").select("id, student_id, submitted_at, score, deadline").eq("assessment_id", a.id);
    if (error) return fail("Could not load the results.");
    const ids = (atts ?? []).map((x) => x.student_id);
    const { data: studs } = ids.length ? await sb.from("students").select("id, name, login_id").in("id", ids) : { data: [] as { id: string; name: string; login_id: string }[] };
    const { count } = await sb.from("questions").select("id", { count: "exact", head: true }).eq("assessment_id", a.id);
    const { count: pulled } = await sb.from("exam_questions").select("question_id", { count: "exact", head: true }).eq("exam_id", a.id);
    return NextResponse.json({
      questionCount: (count ?? 0) + (pulled ?? 0),
      rows: (atts ?? []).map((x) => ({
        ...x,
        name: studs?.find((s) => s.id === x.student_id)?.name ?? "",
        loginId: studs?.find((s) => s.id === x.student_id)?.login_id ?? "",
      })),
    });
  }

  // Finalize attempts whose time is up but were never submitted (e.g. closed browser)
  if (b.action === "finalize") {
    const a = await own(b.assessmentId);
    if (!a) return fail("Test not found", 404);
    const { data: atts } = await sb.from("attempts").select("id, deadline").eq("assessment_id", a.id).is("submitted_at", null);
    let n = 0;
    for (const x of atts ?? []) {
      if (x.deadline && new Date(x.deadline).getTime() < Date.now()) {
        const { error } = await sb.rpc("cbt_submit", { p_attempt: x.id });
        if (!error) n++;
      }
    }
    return NextResponse.json({ ok: true, finalized: n });
  }

  if (b.action === "listQuestions") {
    const a = await own(b.assessmentId);
    if (!a) return fail("Test not found", 404);
    const cols = "id, position, question, option_a, option_b, option_c, option_d, correct";
    const mine = await sb.from("questions").select(cols).eq("assessment_id", a.id).order("position");
    if (mine.error) return fail("Could not load the questions.");
    const { data: links } = await sb.from("exam_questions").select("question_id").eq("exam_id", a.id);
    const ids = (links ?? []).map((l) => l.question_id);
    let pulled: typeof mine.data = [];
    if (ids.length) { const r = await sb.from("questions").select(cols).in("id", ids); pulled = r.data ?? []; }
    return NextResponse.json({
      questions: [
        ...(mine.data ?? []).map((q) => ({ ...q, pulled: false })),
        ...(pulled ?? []).map((q) => ({ ...q, pulled: true })),
      ],
    });
  }

  if (b.action === "updateAssessment") {
    const a = await own(b.assessmentId);
    if (!a) return fail("Test not found", 404);
    const dur = Math.floor(Number(b.duration));
    if (!(dur > 0 && dur <= 600)) return fail("Time allowed must be between 1 and 600 minutes", 400);
    const { error } = await sb.from("assessments")
      .update({ duration_minutes: dur, instructions: String(b.instructions ?? "").trim().slice(0, 3000) || null }).eq("id", a.id);
    if (error) return fail("Could not save the details.");
    return NextResponse.json({ ok: true });
  }

  // Safe delete only: nobody started it, and none of its questions are used in an exam
  if (b.action === "deleteAssessment") {
    const a = await own(b.assessmentId);
    if (!a) return fail("Test not found", 404);
    if (a.is_published) return fail("Unpublish it first, then delete it.", 400);
    if (await started(a.id)) return fail("Students have already started this one, so it cannot be deleted. Unpublish it instead.", 400);
    const { data: mine } = await sb.from("questions").select("id").eq("assessment_id", a.id);
    const ownIds = (mine ?? []).map((q) => q.id);
    if (ownIds.length) {
      const { count: used } = await sb.from("exam_questions").select("question_id", { count: "exact", head: true }).in("question_id", ownIds);
      if (used) return fail("Some of its questions are used in an exam. Remove them from that exam first.", 400);
    }
    const e1 = await sb.from("exam_questions").delete().eq("exam_id", a.id);
    if (e1.error) return fail("Could not delete the test.");
    const e2 = await sb.from("questions").delete().eq("assessment_id", a.id);
    if (e2.error) return fail("Could not delete the test.");
    const e3 = await sb.from("assessments").delete().eq("id", a.id);
    if (e3.error) return fail("Could not delete the test.");
    return NextResponse.json({ ok: true });
  }

  if (b.action === "updateQuestion") {
    const q = b.question as (QIn & { id: string }) | undefined;
    if (!q || !validQuestion(q)) return fail("A question, options A and B, and an answer whose option is filled in are required", 400);
    const oq = await ownQuestion(q.id);
    if (!oq) return fail("Question not found", 404);
    const { count } = await sb.from("answers").select("question_id", { count: "exact", head: true }).eq("question_id", oq.id);
    if (count) return fail("Students have already answered this question, so it cannot be changed.", 400);
    const { error } = await sb.from("questions").update({
      question: String(q.question).trim().slice(0, 1500),
      option_a: String(q.a).trim().slice(0, 300), option_b: String(q.b).trim().slice(0, 300),
      option_c: String(q.c ?? "").trim().slice(0, 300), option_d: String(q.d ?? "").trim().slice(0, 300),
      correct: q.correct,
    }).eq("id", oq.id);
    if (error) return fail("Could not save the question.");
    return NextResponse.json({ ok: true });
  }

  if (b.action === "deleteQuestion") {
    const oq = await ownQuestion(b.questionId);
    if (!oq) return fail("Question not found", 404);
    const { count: answered } = await sb.from("answers").select("question_id", { count: "exact", head: true }).eq("question_id", oq.id);
    if (answered) return fail("Students have already answered this question, so it cannot be deleted.", 400);
    const { count: used } = await sb.from("exam_questions").select("question_id", { count: "exact", head: true }).eq("question_id", oq.id);
    if (used) return fail("This question is used in an exam. Remove it from that exam first.", 400);
    const { error } = await sb.from("questions").delete().eq("id", oq.id);
    if (error) return fail("Could not delete the question.");
    return NextResponse.json({ ok: true });
  }

  if (b.action === "removeFromExam") {
    const exam = await own(b.examId);
    if (!exam || !b.questionId) return fail("Exam not found", 404);
    if (await started(exam.id)) return fail("Students have already started this exam, so its questions cannot be changed.", 400);
    const { error } = await sb.from("exam_questions").delete().eq("exam_id", exam.id).eq("question_id", String(b.questionId));
    if (error) return fail("Could not remove the question.");
    return NextResponse.json({ ok: true });
  }

  return fail("Unknown action", 400);
}