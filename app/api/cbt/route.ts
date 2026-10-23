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
    sb.from("assessments").select("id, kind, class_id, subject_id, term_id, max_score, duration_minutes, start_at, end_at, is_published, created_at").order("created_at", { ascending: false }).limit(60),
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
    // One test is created for EVERY class ticked (same settings, separate copies)
    const classIds = ((b.classIds ?? (b.classId ? [b.classId] : [])) as string[]).filter(Boolean);
    if (!classIds.length) return fail("Choose at least one class", 400);
    const rows = classIds.map((classId) => ({
      term_id: b.termId, class_id: classId, subject_id: b.subjectId,
      kind: b.kind === "exam" ? "exam" : "test1",
      mode: "cbt",
      max_score: b.kind === "exam" ? 60 : (Number(b.maxScore) === 20 ? 20 : 40),
      duration_minutes: Number(b.duration),
      start_at: b.startAt || null, end_at: b.endAt || null,
      opens_at: b.startAt || null, closes_at: b.endAt || null,
      instructions: b.instructions || null,
      is_published: false,
    }));
    const { data, error } = await sb.from("assessments").insert(rows).select("id, class_id");
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true, id: data[0].id, ids: data.map((d) => d.id) });
  }

  if (b.action === "questions") {
    const qs = (b.questions ?? []) as { question: string; a: string; b: string; c: string; d: string; correct: string }[];
    // The same questions can be added to several tests at once (assessmentIds)
    const targets = ((b.assessmentIds ?? (b.assessmentId ? [b.assessmentId] : [])) as string[]).filter(Boolean);
    if (!targets.length || !qs.length) return fail("Nothing to add", 400);
    for (const assessmentId of targets) {
      const { data: last } = await sb.from("questions").select("position").eq("assessment_id", assessmentId).order("position", { ascending: false }).limit(1);
      let pos = last?.[0]?.position ?? 0;
      const rows = qs.map((q) => ({
        assessment_id: assessmentId, position: ++pos, question: q.question,
        option_a: q.a, option_b: q.b, option_c: q.c, option_d: q.d, correct: q.correct,
      }));
      const { error } = await sb.from("questions").insert(rows);
      if (error) return fail(error.message);
    }
    return NextResponse.json({ ok: true, added: qs.length, tests: targets.length });
  }

  if (b.action === "copy") {
    // Copy the questions of one test into the same test of other classes.
    // Targets that already have questions, or that students have started, are skipped.
    const targetIds = ((b.targetIds ?? []) as string[]).filter((x) => x && x !== b.assessmentId);
    if (!b.assessmentId || !targetIds.length) return fail("Nothing to copy to", 400);
    const { data: src } = await sb.from("assessments").select("id, kind, subject_id, term_id").eq("id", b.assessmentId).single();
    const { data: tgts } = await sb.from("assessments").select("id, kind, subject_id, term_id").in("id", targetIds);
    if (!src) return fail("Test not found", 404);
    const { data: qs } = await sb.from("questions")
      .select("position, question, option_a, option_b, option_c, option_d, correct")
      .eq("assessment_id", b.assessmentId).order("position");
    if (!qs?.length) return fail("This test has no questions to copy", 400);
    let copied = 0, skipped = 0;
    for (const t of tgts ?? []) {
      if (t.kind !== src.kind || t.subject_id !== src.subject_id || t.term_id !== src.term_id) { skipped++; continue; }
      const { count: have } = await sb.from("questions").select("id", { count: "exact", head: true }).eq("assessment_id", t.id);
      const { count: tried } = await sb.from("attempts").select("id", { count: "exact", head: true }).eq("assessment_id", t.id);
      if ((have ?? 0) > 0 || (tried ?? 0) > 0) { skipped++; continue; }
      const rows = qs.map((q) => ({ assessment_id: t.id, ...q }));
      const { error } = await sb.from("questions").insert(rows);
      if (error) return fail(error.message);
      copied++;
    }
    return NextResponse.json({ ok: true, copied, skipped, questions: qs.length });
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

  return fail("Unknown action", 400);
}