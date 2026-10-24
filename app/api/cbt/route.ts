import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

type Body = {
  action?: string;
  loginId?: string;
  pin?: string;
  assessmentId?: string;
  attemptId?: string;
  questionId?: string;
  chosen?: string;
  code?: string;
};

const MAX_FAILS = 5;
const BLOCK_MS = 15 * 60000;

const bad = (status: string, code = 400) =>
  NextResponse.json({ status }, { status: code });

async function loadQuestions(sb: SupabaseClient, assessmentId: string) {
  const ids = new Set<string>();
  const { data: d } = await sb.from("questions").select("id").eq("assessment_id", assessmentId);
  (d ?? []).forEach((r) => ids.add(r.id));
  const { data: l } = await sb.from("exam_questions").select("question_id").eq("exam_id", assessmentId);
  (l ?? []).forEach((r) => ids.add(r.question_id));
  if (ids.size === 0) return [];
  const { data } = await sb
    .from("questions")
    .select("id, position, question, option_a, option_b, option_c, option_d")
    .in("id", [...ids])
    .order("position");
  return data ?? [];
}

// Is the class open, and has this student entered the current code?
async function accessState(sb: SupabaseClient, studentId: string, classId: string) {
  const { data: row } = await sb
    .from("class_test_access")
    .select("is_open, code")
    .eq("class_id", String(classId))
    .maybeSingle();
  if (!row || !row.is_open || !row.code) return { classOpen: false, unlocked: false };
  const { data: u } = await sb
    .from("test_access_unlock")
    .select("code")
    .eq("student_id", String(studentId))
    .eq("class_id", String(classId))
    .maybeSingle();
  return { classOpen: true, unlocked: !!u && u.code === row.code };
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return bad("invalid");
  }
  const loginId = String(body.loginId ?? "").trim();
  const pin = String(body.pin ?? "").trim();
  if (!loginId || loginId.length > 50 || !/^\d{4}$/.test(pin)) return bad("invalid");

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return bad("error", 500);
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: auth, error: aerr } = await sb.rpc("cbt_login", { p_login: loginId, p_pin: pin });
  if (aerr) {
    console.error("cbt_login failed:", aerr.message);
    return bad("error", 500);
  }
  const me = auth?.[0];
  if (!me || me.o_status !== "ok") return NextResponse.json({ status: me?.o_status ?? "invalid" });
  const studentId: string = me.o_student_id;
  const classId: string = me.o_class_id;
  const now = Date.now();

  const asmWindow = (a: { start_at: string | null; opens_at: string | null; end_at: string | null; closes_at: string | null }) => ({
    start: a.start_at ?? a.opens_at,
    end: a.end_at ?? a.closes_at,
  });

  // ---------- access: is the lock on for this student? ----------
  if (body.action === "access") {
    const s = await accessState(sb, studentId, classId);
    return NextResponse.json({ status: "ok", locked: !s.unlocked, classOpen: s.classOpen });
  }

  // ---------- unlock: student enters the class code ----------
  if (body.action === "unlock") {
    const { data: blk } = await sb
      .from("test_access_block")
      .select("fails, blocked_until")
      .eq("student_id", String(studentId))
      .maybeSingle();
    if (blk?.blocked_until && new Date(blk.blocked_until).getTime() > now) {
      return NextResponse.json({ status: "code_blocked" });
    }
    const { data: row } = await sb
      .from("class_test_access")
      .select("is_open, code")
      .eq("class_id", String(classId))
      .maybeSingle();
    if (!row || !row.is_open || !row.code) return NextResponse.json({ status: "class_locked" });

    const entered = String(body.code ?? "").trim().toUpperCase();
    if (entered && entered === row.code) {
      await sb
        .from("test_access_unlock")
        .upsert(
          { student_id: String(studentId), class_id: String(classId), code: row.code, granted_at: new Date(now).toISOString() },
          { onConflict: "student_id,class_id" }
        );
      await sb
        .from("test_access_block")
        .upsert({ student_id: String(studentId), fails: 0, blocked_until: null }, { onConflict: "student_id" });
      return NextResponse.json({ status: "ok" });
    }

    // wrong code
    const prevFails = blk?.blocked_until && new Date(blk.blocked_until).getTime() <= now ? 0 : blk?.fails ?? 0;
    const fails = prevFails + 1;
    if (fails >= MAX_FAILS) {
      await sb
        .from("test_access_block")
        .upsert({ student_id: String(studentId), fails: 0, blocked_until: new Date(now + BLOCK_MS).toISOString() }, { onConflict: "student_id" });
      return NextResponse.json({ status: "code_blocked" });
    }
    await sb
      .from("test_access_block")
      .upsert({ student_id: String(studentId), fails, blocked_until: null }, { onConflict: "student_id" });
    return NextResponse.json({ status: "wrong_code", left: MAX_FAILS - fails });
  }

  // ---------- list ----------
  if (!body.action || body.action === "login" || body.action === "list") {
    const { data: asms } = await sb
      .from("assessments")
      .select("id, kind, max_score, duration_minutes, start_at, end_at, opens_at, closes_at, instructions, subject_id")
      .eq("class_id", classId)
      .eq("is_published", true);
    const list = asms ?? [];
    const ids = list.map((a) => a.id);
    const subjIds = [...new Set(list.map((a) => a.subject_id))];
    const { data: subs } = subjIds.length
      ? await sb.from("subjects").select("id, name").in("id", subjIds)
      : { data: [] as { id: string; name: string }[] };
    const { data: atts } = ids.length
      ? await sb.from("attempts").select("id, assessment_id, submitted_at, score, deadline").eq("student_id", studentId).in("assessment_id", ids)
      : { data: [] as { id: string; assessment_id: string; submitted_at: string | null; score: number | null; deadline: string | null }[] };

    const allItems = list.map((a) => {
      const w = asmWindow(a);
      const att = (atts ?? []).find((t) => t.assessment_id === a.id);
      let state = "open";
      if (att?.submitted_at) state = "submitted";
      else if (att && att.deadline && new Date(att.deadline).getTime() > now) state = "in_progress";
      else if (att) state = "expired";
      else if (w.start && new Date(w.start).getTime() > now) state = "upcoming";
      else if (w.end && new Date(w.end).getTime() < now) state = "closed";
      return {
        id: a.id,
        kind: a.kind,
        subject: (subs ?? []).find((s) => s.id === a.subject_id)?.name ?? "",
        maxScore: a.max_score,
        duration: a.duration_minutes,
        start: w.start,
        end: w.end,
        state,
        score: att?.submitted_at ? att.score : null,
      };
    });
    const access = await accessState(sb, studentId, classId);
    // When locked, only a test already in progress is shown so it can be resumed
    const items = access.unlocked ? allItems : allItems.filter((i) => i.state === "in_progress");
    return NextResponse.json({
      status: "ok",
      student: { name: me.o_name, className: me.o_class_name },
      locked: !access.unlocked,
      items,
    });
  }

  // ---------- start / resume ----------
  if (body.action === "start") {
    const aid = String(body.assessmentId ?? "");
    const { data: a } = await sb
      .from("assessments")
      .select("id, max_score, duration_minutes, start_at, end_at, opens_at, closes_at, instructions, class_id, is_published")
      .eq("id", aid)
      .maybeSingle();
    if (!a || a.class_id !== classId || !a.is_published) return bad("not_allowed", 403);
    const w = asmWindow(a);

    const { data: existing } = await sb
      .from("attempts")
      .select("id, submitted_at, deadline")
      .eq("assessment_id", aid)
      .eq("student_id", studentId)
      .maybeSingle();

    let attemptId: string;
    let deadline: string;
    if (existing) {
      // A test already started can always be resumed, even if the class is locked now
      if (existing.submitted_at) return bad("already_submitted", 409);
      if (!existing.deadline || new Date(existing.deadline).getTime() <= now) return bad("expired", 409);
      attemptId = existing.id;
      deadline = existing.deadline;
    } else {
      // A NEW attempt needs the class open and the code entered
      const access = await accessState(sb, studentId, classId);
      if (!access.unlocked) return bad("test_locked", 403);
      if (w.start && new Date(w.start).getTime() > now) return bad("not_open", 409);
      if (w.end && new Date(w.end).getTime() <= now) return bad("closed", 409);
      let dl = a.duration_minutes ? now + a.duration_minutes * 60000 : Infinity;
      if (w.end) dl = Math.min(dl, new Date(w.end).getTime());
      if (!Number.isFinite(dl)) dl = now + 60 * 60000;
      deadline = new Date(dl).toISOString();
      const { data: created, error } = await sb
        .from("attempts")
        .insert({ assessment_id: aid, student_id: studentId, started_at: new Date(now).toISOString(), deadline })
        .select("id")
        .single();
      if (error || !created) {
        console.error("attempt insert failed:", error?.message);
        return bad("error", 500);
      }
      attemptId = created.id;
    }

    const questions = await loadQuestions(sb, aid);
    const { data: ans } = await sb.from("answers").select("question_id, chosen").eq("attempt_id", attemptId);
    return NextResponse.json({
      status: "ok",
      attemptId,
      deadline,
      serverNow: now,
      instructions: a.instructions,
      questions,
      answers: Object.fromEntries((ans ?? []).map((r) => [r.question_id, r.chosen])),
    });
  }

  // ---------- save / submit need an attempt that belongs to this student ----------
  const attemptId = String(body.attemptId ?? "");
  const { data: att } = await sb
    .from("attempts")
    .select("id, student_id, submitted_at, deadline")
    .eq("id", attemptId)
    .maybeSingle();
  if (!att || att.student_id !== studentId) return bad("not_allowed", 403);

  if (body.action === "save") {
    if (att.submitted_at) return bad("already_submitted", 409);
    if (att.deadline && new Date(att.deadline).getTime() + 15000 < now) return bad("expired", 409);
    const chosen = String(body.chosen ?? "").toUpperCase();
    if (!["A", "B", "C", "D"].includes(chosen)) return bad("invalid");
    const { error } = await sb
      .from("answers")
      .upsert({ attempt_id: attemptId, question_id: String(body.questionId ?? ""), chosen }, { onConflict: "attempt_id,question_id" });
    if (error) {
      console.error("save failed:", error.message);
      return bad("error", 500);
    }
    return NextResponse.json({ status: "ok" });
  }

  if (body.action === "submit") {
    const { data, error } = await sb.rpc("cbt_submit", { p_attempt: attemptId });
    if (error || !data?.[0]) {
      console.error("submit failed:", error?.message);
      return bad("error", 500);
    }
    const r = data[0];
    return NextResponse.json({ status: "ok", score: r.o_score, max: r.o_max, correct: r.o_correct, total: r.o_total });
  }

  return bad("invalid");
}