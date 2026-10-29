import { NextResponse } from "next/server";
import { adminClient } from "@/lib/admin";

// The page and Excel use "ca"; the scores table stores that kind as "test1".
const LIMIT: Record<string, number> = { ca: 40, exam: 60 };

export async function GET(request: Request) {
  const c = adminClient(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const { sb } = c;
  const u = new URL(request.url);
  const classId = u.searchParams.get("classId");
  const termId = u.searchParams.get("termId");

  // ---------- Backup: every score of one term, with names ----------
  if (u.searchParams.get("export") === "1") {
    if (!termId) return NextResponse.json({ error: "Choose a term" }, { status: 400 });

    const scores: { student_id: string; subject_id: string; class_id: string; kind: string; score: number; source: string | null; updated_at: string | null }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("scores")
        .select("student_id, subject_id, class_id, kind, score, source, updated_at")
        .eq("term_id", termId).order("id").range(from, from + 999);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      scores.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }

    const students: { id: string; login_id: string; name: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("students").select("id, login_id, name").order("id").range(from, from + 999);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      students.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }

    const [classes, subjects] = await Promise.all([
      sb.from("classes").select("id, name, sort_order"),
      sb.from("subjects").select("id, name"),
    ]);
    const stu = new Map(students.map((s) => [s.id, s]));
    const cls = new Map((classes.data ?? []).map((x) => [x.id, x]));
    const sub = new Map((subjects.data ?? []).map((x) => [x.id, x.name as string]));

    const rows = scores
      .map((x) => ({
        order: cls.get(x.class_id)?.sort_order ?? 0,
        cls: (cls.get(x.class_id)?.name as string) ?? "",
        loginId: stu.get(x.student_id)?.login_id ?? "",
        name: stu.get(x.student_id)?.name ?? "",
        subject: sub.get(x.subject_id) ?? "",
        type: x.kind === "test1" ? "CA" : "Exam",
        score: x.score,
        source: x.source ?? "",
        updated: x.updated_at ?? "",
      }))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name) || a.subject.localeCompare(b.subject) || a.type.localeCompare(b.type))
      .map((x) => ({ cls: x.cls, loginId: x.loginId, name: x.name, subject: x.subject, type: x.type, score: x.score, source: x.source, updated: x.updated }));
    return NextResponse.json({ rows });
  }

  if (!classId) {
    const [classes, terms] = await Promise.all([
      sb.from("classes").select("id, name").order("sort_order"),
      sb.from("terms").select("*"),
    ]);
    return NextResponse.json({ classes: classes.data ?? [], terms: terms.error ? null : terms.data });
  }

  const { data: students } = await sb.from("students").select("id, login_id, name").eq("class_id", classId).eq("is_active", true).order("login_id");
  const { data: cs } = await sb.from("class_subjects").select("subject_id, position").eq("class_id", classId).order("position");
  const subjIds = (cs ?? []).map((x) => x.subject_id);
  const { data: subs } = subjIds.length ? await sb.from("subjects").select("id, name").in("id", subjIds) : { data: [] as { id: string; name: string }[] };
  const subjects = (cs ?? []).map((x) => subs?.find((s) => s.id === x.subject_id)).filter(Boolean);
  const sids = (students ?? []).map((s) => s.id);
  const { data: ss } = sids.length ? await sb.from("student_subjects").select("student_id, subject_id").in("student_id", sids) : { data: [] };
  const { data: scores } = termId && sids.length
    ? await sb.from("scores").select("student_id, subject_id, kind, score").eq("term_id", termId).in("student_id", sids)
    : { data: [] };
  // Show test1 as "ca" so the template and page keep working
  const shown = (scores ?? []).map((x) => ({ ...x, kind: x.kind === "test1" ? "ca" : x.kind }));
  return NextResponse.json({ students, subjects, studentSubjects: ss ?? [], scores: shown });
}

export async function POST(request: Request) {
  const c = adminClient(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const { sb } = c;
  const b = await request.json().catch(() => null);
  const fail = (m: string, s = 500) => NextResponse.json({ error: m }, { status: s });
  if (!b?.termId || !b?.classId) return fail("Choose a term and class", 400);

  if (b.action === "save") {
    const rows = (b.rows ?? []) as { loginId: string; scores: { subjectId: string; kind: string; score: number }[] }[];
    const { data: studs } = await sb.from("students").select("id, login_id").eq("class_id", b.classId);
    const map = new Map((studs ?? []).map((s) => [s.login_id, s.id]));
    const out: { student_id: string; subject_id: string; kind: string; score: number }[] = [];
    const unknown: string[] = [];
    const tooHigh: string[] = [];
    for (const r of rows) {
      const sid = map.get(r.loginId);
      if (!sid) { unknown.push(r.loginId); continue; }
      for (const s of r.scores) {
        if (!["ca", "exam"].includes(s.kind) || !Number.isInteger(s.score) || s.score < 0) continue;
        if (s.score > LIMIT[s.kind]) { tooHigh.push(`${r.loginId} ${s.kind === "ca" ? "CA" : "Exam"} ${s.score} (max ${LIMIT[s.kind]})`); continue; }
        out.push({ student_id: sid, subject_id: s.subjectId, kind: s.kind === "ca" ? "test1" : "exam", score: s.score });
      }
    }
    if (tooHigh.length) {
      return fail(`Nothing saved. Scores above the limit: ${tooHigh.slice(0, 8).join("; ")}${tooHigh.length > 8 ? ` … and ${tooHigh.length - 8} more` : ""}`, 400);
    }
    let saved = 0;
    for (let i = 0; i < out.length; i += 400) {
      const { data, error } = await sb.rpc("admin_save_scores", { p_term: b.termId, p_class: b.classId, p_rows: out.slice(i, i + 400) });
      if (error) return fail(error.message);
      saved += Number(data);
    }
    return NextResponse.json({ ok: true, saved, unknown });
  }

  if (b.action === "publish") {
    if (!b.termLabel || !b.session) return fail("Enter the term name and session", 400);
    const { data, error } = await sb.rpc("admin_publish_results", {
      p_term: b.termId, p_class: b.classId, p_term_label: b.termLabel, p_session: b.session,
    });
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true, published: data });
  }

  if (b.action === "remarks") {
    const { data, error } = await sb.rpc("admin_fill_remarks", { p_term: b.termId, p_class: b.classId });
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true, filled: data });
  }

  return fail("Unknown action", 400);
}