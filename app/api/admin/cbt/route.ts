import { NextResponse } from "next/server";
import { adminClient } from "@/lib/admin";

function client(request: Request) {
  return adminClient(request);
}

export async function GET(request: Request) {
  const c = client(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const { sb } = c;
  const [classes, subjects, terms, assessments] = await Promise.all([
    sb.from("classes").select("id, name").order("sort_order"),
    sb.from("subjects").select("id, name").order("name"),
    sb.from("terms").select("*"),
    sb.from("assessments").select("id, kind, class_id, subject_id, term_id, max_score, duration_minutes, start_at, end_at, is_published, created_at").order("created_at", { ascending: false }).limit(60),
  ]);
  return NextResponse.json({
    classes: classes.data ?? [],
    subjects: subjects.data ?? [],
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
      kind: b.kind === "exam" ? "exam" : "test",
      mode: "cbt",
      max_score: Number(b.maxScore),
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

  return fail("Unknown action", 400);
}
