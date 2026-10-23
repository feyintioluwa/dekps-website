import { NextResponse } from "next/server";
import { adminClient } from "@/lib/admin";

function client(request: Request) {
  return adminClient(request);
}

export async function GET(request: Request) {
  const c = client(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const { sb } = c;
  const [classes, subjects, terms, assessments, classSubjects] = await Promise.all([
    sb.from("classes").select("id, name").order("sort_order"),
    sb.from("subjects").select("id, name").order("name"),
    sb.from("terms").select("*"),
    sb.from("assessments").select("id, kind, class_id, subject_id, term_id, max_score, duration_minutes, start_at, end_at, is_published, instructions, created_at").order("created_at", { ascending: false }).limit(60),
    sb.from("class_subjects").select("class_id, subject_id"),
  ]);
  return NextResponse.json({
    classes: classes.data ?? [],
    subjects: subjects.data ?? [],
    classSubjects: classSubjects.data ?? [],
    terms: terms.error ? null : terms.data,
    assessments: assessments.data ?? [],
  });
}

export async function POST(request: Request) {
  const c = client(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const { sb } = c;
  const b = await request.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const fail = (m: string, s = 500) => NextResponse.json({ error: m }, { status: s });

  if (b.action === "create") {
    const row = {
      term_id: b.termId, class_id: b.classId, subject_id: b.subjectId,
      kind: b.kind === "exam" ? "exam" : "test1",
      mode: "cbt",
      max_score: b.kind === "exam" ? 60 : 40,
      duration_minutes: Number(b.duration),
      start_at: b.startAt || null, end_at: b.endAt || null,
      opens_at: b.startAt || null, closes_at: b.endAt || null,
      instructions: b.instructions || null,
      is_published: false,
    };
    const { data, error } = await sb.from("assessments").insert(row).select("id").single();
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (b.action === "questions") {
    const qs = (b.questions ?? []) as { question: string; a: string; b: string; c: string; d: string; correct: string }[];
    if (!b.assessmentId || !qs.length) return fail("Nothing to add", 400);
    const { data: last } = await sb.from("questions").select("position").eq("assessment_id", b.assessmentId).order("position", { ascending: false }).limit(1);
    let pos = last?.[0]?.position ?? 0;
    const rows = qs.map((q) => ({
      assessment_id: b.assessmentId, position: ++pos, question: q.question,
      option_a: q.a, option_b: q.b, option_c: q.c, option_d: q.d, correct: q.correct,
    }));
    const { error } = await sb.from("questions").insert(rows);
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true, added: rows.length });
  }

  if (b.action === "pull") {
    const sources = (b.sourceIds ?? []) as string[];
    const count = Math.max(1, Number(b.count) || 10);
    if (!b.assessmentId || !sources.length) return fail("Choose an exam and source tests", 400);
    const { data: pool } = await sb.from("questions").select("id").in("assessment_id", sources);
    const { data: have } = await sb.from("exam_questions").select("question_id, position").eq("exam_id", b.assessmentId);
    const taken = new Set((have ?? []).map((r) => r.question_id));
    const ids = (pool ?? []).map((r) => r.id).filter((id) => !taken.has(id));
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    const pick = ids.slice(0, count);
    let pos = Math.max(0, ...(have ?? []).map((r) => r.position ?? 0));
    const rows = pick.map((question_id) => ({ exam_id: b.assessmentId, question_id, position: ++pos }));
    if (rows.length) {
      const { error } = await sb.from("exam_questions").insert(rows);
      if (error) return fail(error.message);
    }
    return NextResponse.json({ ok: true, added: rows.length, available: ids.length });
  }

  if (b.action === "publish") {
    const { error } = await sb.from("assessments").update({ is_published: !!b.value }).eq("id", b.assessmentId);
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
  }

  if (b.action === "results") {
    const { data: atts, error } = await sb.from("attempts").select("id, student_id, submitted_at, score, deadline").eq("assessment_id", b.assessmentId);
    if (error) return fail(error.message);
    const ids = (atts ?? []).map((a) => a.student_id);
    const { data: studs } = ids.length ? await sb.from("students").select("id, name, login_id").in("id", ids) : { data: [] as { id: string; name: string; login_id: string }[] };
    const { count } = await sb.from("questions").select("id", { count: "exact", head: true }).eq("assessment_id", b.assessmentId);
    return NextResponse.json({
      questionCount: count ?? 0,
      rows: (atts ?? []).map((a) => ({
        ...a,
        name: studs?.find((s) => s.id === a.student_id)?.name ?? "",
        loginId: studs?.find((s) => s.id === a.student_id)?.login_id ?? "",
      })),
    });
  }

  // Finalize attempts whose time is up but were never submitted (e.g. closed browser)
  if (b.action === "finalize") {
    const { data: atts } = await sb.from("attempts").select("id, deadline").eq("assessment_id", b.assessmentId).is("submitted_at", null);
    let n = 0;
    for (const a of atts ?? []) {
      if (a.deadline && new Date(a.deadline).getTime() < Date.now()) {
        const { error } = await sb.rpc("cbt_submit", { p_attempt: a.id });
        if (!error) n++;
      }
    }
    return NextResponse.json({ ok: true, finalized: n });
  }

  // ---- Edit / delete (admin) ----
  if (b.action === "listQuestions") {
    const cols = "id, position, question, option_a, option_b, option_c, option_d, correct";
    const own = await sb.from("questions").select(cols).eq("assessment_id", b.assessmentId).order("position");
    if (own.error) return fail(own.error.message);
    const { data: links } = await sb.from("exam_questions").select("question_id").eq("exam_id", b.assessmentId);
    const ids = (links ?? []).map((l) => l.question_id);
    let pulled: typeof own.data = [];
    if (ids.length) { const r = await sb.from("questions").select(cols).in("id", ids); pulled = r.data ?? []; }
    return NextResponse.json({
      questions: [
        ...(own.data ?? []).map((q) => ({ ...q, pulled: false })),
        ...(pulled ?? []).map((q) => ({ ...q, pulled: true })),
      ],
    });
  }

  if (b.action === "updateAssessment") {
    const dur = Math.floor(Number(b.duration));
    if (!b.assessmentId || !(dur > 0)) return fail("Time allowed must be a number above 0", 400);
    const { error } = await sb.from("assessments").update({ duration_minutes: dur, instructions: b.instructions || null }).eq("id", b.assessmentId);
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
  }

  if (b.action === "deleteAssessment") {
    const id = b.assessmentId;
    if (!id) return fail("Missing test", 400);
    const { count: tries } = await sb.from("attempts").select("id", { count: "exact", head: true }).eq("assessment_id", id);
    if (tries) return fail("Students have already started this one, so it cannot be deleted. Unpublish it instead.", 400);
    const { data: own } = await sb.from("questions").select("id").eq("assessment_id", id);
    const ownIds = (own ?? []).map((q) => q.id);
    if (ownIds.length) {
      const { count: used } = await sb.from("exam_questions").select("question_id", { count: "exact", head: true }).in("question_id", ownIds);
      if (used) return fail("Some of its questions are used in an exam. Remove them from that exam first.", 400);
    }
    const e1 = await sb.from("exam_questions").delete().eq("exam_id", id);
    if (e1.error) return fail(e1.error.message);
    const e2 = await sb.from("questions").delete().eq("assessment_id", id);
    if (e2.error) return fail(e2.error.message);
    const e3 = await sb.from("assessments").delete().eq("id", id);
    if (e3.error) return fail(e3.error.message);
    return NextResponse.json({ ok: true });
  }

  if (b.action === "updateQuestion") {
    const q = b.question;
    if (!q?.id || !q.question || !q.a || !q.b || !["A", "B", "C", "D"].includes(q.correct)) return fail("A question, options A and B, and the answer are required", 400);
    const { count } = await sb.from("answers").select("question_id", { count: "exact", head: true }).eq("question_id", q.id);
    if (count) return fail("Students have already answered this question, so it cannot be changed.", 400);
    const { error } = await sb.from("questions").update({
      question: q.question, option_a: q.a, option_b: q.b, option_c: q.c ?? "", option_d: q.d ?? "", correct: q.correct,
    }).eq("id", q.id);
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
  }

  if (b.action === "deleteQuestion") {
    if (!b.questionId) return fail("Missing question", 400);
    const { count: answered } = await sb.from("answers").select("question_id", { count: "exact", head: true }).eq("question_id", b.questionId);
    if (answered) return fail("Students have already answered this question, so it cannot be deleted.", 400);
    const { count: used } = await sb.from("exam_questions").select("question_id", { count: "exact", head: true }).eq("question_id", b.questionId);
    if (used) return fail("This question is used in an exam. Remove it from that exam first.", 400);
    const { error } = await sb.from("questions").delete().eq("id", b.questionId);
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
  }

  if (b.action === "removeFromExam") {
    if (!b.examId || !b.questionId) return fail("Missing exam or question", 400);
    const { count: tries } = await sb.from("attempts").select("id", { count: "exact", head: true }).eq("assessment_id", b.examId);
    if (tries) return fail("Students have already started this exam, so its questions cannot be changed.", 400);
    const { error } = await sb.from("exam_questions").delete().eq("exam_id", b.examId).eq("question_id", b.questionId);
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
  }

  return fail("Unknown action", 400);
}