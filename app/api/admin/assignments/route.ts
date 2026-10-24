import { NextResponse } from "next/server";
import { adminClient } from "@/lib/admin";

export async function GET(request: Request) {
  const c = adminClient(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const { sb } = c;
  const [classes, subjects, terms, assignments, classSubjects] = await Promise.all([
    sb.from("classes").select("id, name").order("sort_order"),
    sb.from("subjects").select("id, name").order("name"),
    sb.from("terms").select("*"),
    sb.from("assignments")
      .select("id, term_id, class_id, subject_id, title, instructions, max_score, due_at, is_published, created_at")
      .order("created_at", { ascending: false }).limit(100),
    sb.from("class_subjects").select("class_id, subject_id"),
  ]);
  return NextResponse.json({
    classes: classes.data ?? [],
    subjects: subjects.data ?? [],
    classSubjects: classSubjects.data ?? [],
    terms: terms.error ? null : terms.data,
    assignments: assignments.data ?? [],
  });
}

export async function POST(request: Request) {
  const c = adminClient(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const { sb } = c;
  const b = await request.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const fail = (m: string, s = 500) => NextResponse.json({ error: m }, { status: s });

  if (b.action === "create") {
    const title = String(b.title ?? "").trim();
    if (!title) return fail("Enter a title", 400);
    if (!b.termId || !b.classId || !b.subjectId) return fail("Choose term, class and subject", 400);
    const max = Number(b.maxScore);
    const maxScore = Number.isInteger(max) && max >= 1 && max <= 100 ? max : 10;
    const { data, error } = await sb.from("assignments").insert({
      term_id: b.termId, class_id: b.classId, subject_id: b.subjectId,
      title, instructions: String(b.instructions ?? "").trim() || null,
      max_score: maxScore, due_at: b.dueAt || null, is_published: false,
    }).select("id").single();
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (b.action === "publish") {
    if (!b.assignmentId) return fail("Choose an assignment", 400);
    const { error } = await sb.from("assignments").update({ is_published: !!b.value }).eq("id", b.assignmentId);
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
  }

  if (b.action === "submissions") {
    const { data: a } = await sb.from("assignments").select("id, class_id, max_score").eq("id", b.assignmentId).single();
    if (!a) return fail("Assignment not found", 404);
    const { data: studs } = await sb.from("students").select("id, name, login_id")
      .eq("class_id", a.class_id).eq("is_active", true).order("login_id");
    const { data: subs } = await sb.from("assignment_submissions")
      .select("student_id, answer, files, submitted_at, score, comment").eq("assignment_id", b.assignmentId);
    const rows = await Promise.all((studs ?? []).map(async (s) => {
      const x = (subs ?? []).find((y) => y.student_id === s.id);
      const refs = ((x?.files ?? []) as { path: string; name: string; type: string }[]);
      // Private files: give the admin a temporary link (1 hour) for each one
      const files = await Promise.all(refs.map(async (f) => {
        const { data: u } = await sb.storage.from("assignments").createSignedUrl(f.path, 3600);
        return { name: f.name, type: f.type, url: u?.signedUrl ?? "" };
      }));
      return {
        studentId: s.id, name: s.name, loginId: s.login_id,
        answer: x?.answer ?? null, files, submittedAt: x?.submitted_at ?? null,
        score: x?.score ?? null, comment: x?.comment ?? null,
      };
    }));
    return NextResponse.json({ maxScore: a.max_score, rows });
  }

  if (b.action === "mark") {
    const { data: a } = await sb.from("assignments").select("id, max_score").eq("id", b.assignmentId).single();
    if (!a) return fail("Assignment not found", 404);
    const blank = b.score === "" || b.score === null || b.score === undefined;
    const score = blank ? null : Number(b.score);
    if (score !== null && (!Number.isInteger(score) || score < 0 || score > a.max_score)) {
      return fail(`Mark must be a whole number from 0 to ${a.max_score}`, 400);
    }
    const { data, error } = await sb.from("assignment_submissions")
      .update({
        score,
        comment: String(b.comment ?? "").trim() || null,
        marked_at: score === null ? null : new Date().toISOString(),
      })
      .eq("assignment_id", b.assignmentId).eq("student_id", b.studentId)
      .select("id");
    if (error) return fail(error.message);
    if (!data?.length) return fail("This student has not submitted yet", 400);
    return NextResponse.json({ ok: true });
  }
    if (b.action === "delete") {
    const id = String(b.assignmentId ?? "");
    if (!id) return fail("Choose an assignment", 400);
    const { data: a } = await sb.from("assignments").select("id, is_published").eq("id", id).maybeSingle();
    if (!a) return fail("Assignment not found", 404);
    if (a.is_published) return fail("Unpublish this assignment first, then delete it.", 400);
    const { count, error: e1 } = await sb
      .from("assignment_submissions")
      .select("id", { count: "exact", head: true })
      .eq("assignment_id", id);
    if (e1) return fail(e1.message);
    if (count) return fail("Students have already submitted this assignment, so it cannot be deleted. Unpublish it instead.", 400);
    const { error } = await sb.from("assignments").delete().eq("id", id);
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
  }
  return fail("Unknown action", 400);
}