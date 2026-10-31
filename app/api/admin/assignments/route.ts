import { NextResponse } from "next/server";
import { adminClient } from "@/lib/admin";

// Reads every row of a query in pages of 1000 (the database returns at most 1000 per request)
async function allRows<T>(q: (from: number, to: number) => PromiseLike<{ data: unknown[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await q(from, from + 999);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

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
      .order("created_at", { ascending: false }).limit(200),
    sb.from("class_subjects").select("class_id, subject_id"),
  ]);

  // How many students handed in and how many are marked, for every assignment in the list
  const list = assignments.data ?? [];
  const ids = list.map((a) => a.id as string);
  const stats: Record<string, { submitted: number; marked: number }> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const rows = await allRows<{ assignment_id: string; score: number | null }>((a, b) =>
      sb.from("assignment_submissions").select("assignment_id, score").in("assignment_id", chunk).range(a, b));
    for (const r of rows) {
      const s = (stats[r.assignment_id] ??= { submitted: 0, marked: 0 });
      s.submitted++;
      if (r.score !== null && r.score !== undefined) s.marked++;
    }
  }
  // Active students in each class
  const studs = await allRows<{ class_id: string }>((a, b) =>
    sb.from("students").select("class_id").eq("is_active", true).range(a, b));
  const classSize: Record<string, number> = {};
  for (const s of studs) classSize[s.class_id] = (classSize[s.class_id] ?? 0) + 1;

  return NextResponse.json({
    classes: classes.data ?? [],
    subjects: subjects.data ?? [],
    classSubjects: classSubjects.data ?? [],
    terms: terms.error ? null : terms.data,
    assignments: list,
    stats,
    classSize,
  });
}

export async function POST(request: Request) {
  const c = adminClient(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const { sb } = c;
  const b = await request.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const fail = (m: string, s = 500) => NextResponse.json({ error: m }, { status: s });

  // One assignment (a separate copy) for every ticked class that takes the subject
  if (b.action === "createMany") {
    const title = String(b.title ?? "").trim();
    if (!title) return fail("Enter a title", 400);
    const classIds = ((b.classIds ?? []) as string[]).map(String);
    if (!b.termId || !b.subjectId || !classIds.length) return fail("Choose a term, at least one class and a subject", 400);
    const max = Number(b.maxScore);
    const maxScore = Number.isInteger(max) && max >= 1 && max <= 100 ? max : 10;
    const { data: lk } = await sb.from("class_subjects").select("class_id").eq("subject_id", b.subjectId).in("class_id", classIds);
    const ok = new Set((lk ?? []).map((r) => String(r.class_id)));
    const good = classIds.filter((id) => ok.has(id));
    const skipIds = classIds.filter((id) => !ok.has(id));
    if (!good.length) return fail("None of the ticked classes take that subject", 400);
    const rows = good.map((class_id) => ({
      term_id: b.termId, class_id, subject_id: b.subjectId,
      title, instructions: String(b.instructions ?? "").trim() || null,
      max_score: maxScore, due_at: b.dueAt || null, is_published: false,
    }));
    const { data, error } = await sb.from("assignments").insert(rows).select("id");
    if (error) return fail(error.message);
    const { data: cl } = skipIds.length
      ? await sb.from("classes").select("id, name").in("id", skipIds)
      : { data: [] as { id: string; name: string }[] };
    return NextResponse.json({ ok: true, ids: (data ?? []).map((r) => r.id), skipped: (cl ?? []).map((x) => x.name) });
  }

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

  // Copy an existing assignment to other classes (as drafts). Student answers are never copied.
  if (b.action === "copy") {
    const id = String(b.assignmentId ?? "");
    const classIds = ((b.classIds ?? []) as string[]).map(String);
    if (!id || !classIds.length) return fail("Choose at least one class", 400);
    const { data: a } = await sb.from("assignments")
      .select("term_id, class_id, subject_id, title, instructions, max_score, due_at").eq("id", id).maybeSingle();
    if (!a) return fail("Assignment not found", 404);
    const targets = classIds.filter((x) => x !== a.class_id);
    if (!targets.length) return fail("Choose a different class", 400);
    const { data: lk } = await sb.from("class_subjects").select("class_id").eq("subject_id", a.subject_id).in("class_id", targets);
    const takes = new Set((lk ?? []).map((r) => String(r.class_id)));
    const { data: dup } = await sb.from("assignments").select("class_id")
      .eq("term_id", a.term_id).eq("subject_id", a.subject_id).eq("title", a.title).in("class_id", targets);
    const has = new Set((dup ?? []).map((r) => String(r.class_id)));
    const good = targets.filter((x) => takes.has(x) && !has.has(x));
    const notTaking = targets.filter((x) => !takes.has(x));
    const already = targets.filter((x) => takes.has(x) && has.has(x));
    let created = 0;
    if (good.length) {
      const rows = good.map((class_id) => ({
        term_id: a.term_id, class_id, subject_id: a.subject_id, title: a.title,
        instructions: a.instructions, max_score: a.max_score, due_at: a.due_at, is_published: false,
      }));
      const { data, error } = await sb.from("assignments").insert(rows).select("id");
      if (error) return fail(error.message);
      created = (data ?? []).length;
    }
    const names = async (ids: string[]) => {
      if (!ids.length) return [] as string[];
      const { data } = await sb.from("classes").select("id, name").in("id", ids);
      return (data ?? []).map((x) => x.name as string);
    };
    return NextResponse.json({ ok: true, created, notTaking: await names(notTaking), already: await names(already) });
  }

  // Change the title, instructions, deadline (and marks, only before anyone has submitted)
  if (b.action === "update") {
    const id = String(b.assignmentId ?? "");
    const title = String(b.title ?? "").trim();
    if (!id) return fail("Choose an assignment", 400);
    if (!title) return fail("Enter a title", 400);
    const { data: a } = await sb.from("assignments").select("id, max_score").eq("id", id).maybeSingle();
    if (!a) return fail("Assignment not found", 404);
    const max = Number(b.maxScore);
    const maxScore = Number.isInteger(max) && max >= 1 && max <= 100 ? max : a.max_score;
    if (maxScore !== a.max_score) {
      const { count } = await sb.from("assignment_submissions").select("id", { count: "exact", head: true }).eq("assignment_id", id);
      if (count) return fail("Students have already submitted, so the marks it is out of cannot be changed.", 400);
    }
    if (b.dueAt && Number.isNaN(new Date(b.dueAt).getTime())) return fail("That deadline is not a valid date", 400);
    const { error } = await sb.from("assignments").update({
      title, instructions: String(b.instructions ?? "").trim() || null,
      max_score: maxScore, due_at: b.dueAt || null,
    }).eq("id", id);
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
  }

  // Close now = deadline set to this moment (students can no longer submit)
  if (b.action === "closeNow") {
    const id = String(b.assignmentId ?? "");
    if (!id) return fail("Choose an assignment", 400);
    const { error } = await sb.from("assignments").update({ due_at: new Date().toISOString() }).eq("id", id);
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
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

  if (b.action === "deleteAll") {
    const id = String(b.assignmentId ?? "");
    if (!id) return fail("Choose an assignment", 400);
    const { data: a } = await sb.from("assignments").select("id, title, is_published").eq("id", id).maybeSingle();
    if (!a) return fail("Assignment not found", 404);
    if (a.is_published) return fail("Unpublish this assignment first, then delete it.", 400);
    if (String(b.confirmTitle ?? "").trim() !== String(a.title ?? "").trim()) {
      return fail("The title you typed does not match, so nothing was deleted.", 400);
    }
    const { data: subs, error: e1 } = await sb.from("assignment_submissions").select("files").eq("assignment_id", id);
    if (e1) return fail(e1.message);
    const paths = (subs ?? [])
      .flatMap((s) => ((s.files ?? []) as { path: string }[]).map((f) => f.path))
      .filter(Boolean);
    if (paths.length) {
      const { error: e2 } = await sb.storage.from("assignments").remove(paths);
      if (e2) return fail("Could not remove the uploaded files, so nothing was deleted: " + e2.message);
    }
    const { error: e3 } = await sb.from("assignment_submissions").delete().eq("assignment_id", id);
    if (e3) return fail(e3.message);
    const { error: e4 } = await sb.from("assignments").delete().eq("id", id);
    if (e4) return fail(e4.message);
    return NextResponse.json({ ok: true, removedFiles: paths.length });
  }

  return fail("Unknown action", 400);
}