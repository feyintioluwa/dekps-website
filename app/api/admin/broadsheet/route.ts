import { NextResponse } from "next/server";
import { adminClient } from "@/lib/admin";

export async function GET(request: Request) {
  const c = adminClient(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const { sb } = c;
  const u = new URL(request.url);
  const classId = u.searchParams.get("classId");
  const termId = u.searchParams.get("termId");

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
  return NextResponse.json({ students, subjects, studentSubjects: ss ?? [], scores: scores ?? [] });
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
    for (const r of rows) {
      const sid = map.get(r.loginId);
      if (!sid) { unknown.push(r.loginId); continue; }
      for (const s of r.scores) {
        if (!["ca", "exam"].includes(s.kind) || !Number.isInteger(s.score) || s.score < 0 || s.score > 100) continue;
        out.push({ student_id: sid, subject_id: s.subjectId, kind: s.kind, score: s.score });
      }
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
  return fail("Unknown action", 400);
}
