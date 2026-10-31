import { NextResponse } from "next/server";
import { getTeacher, teacherDenied, type TeacherCtx } from "@/lib/teacher";

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

type Pair = { class_id: string; subject_id: string };
type Asg = {
  id: string; term_id: string; class_id: string; subject_id: string; title: string;
  instructions: string | null; max_score: number; due_at: string | null; is_published: boolean;
};

const pk = (c: string, s: string) => `${c}|${s}`;

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

export async function GET() {
  const t = await getTeacher();
  if (t.status !== "ok") return teacherDenied(t.status);
  const { db } = t;

  const pairs = await allowedPairs(t);
  const classIds = [...new Set(pairs.map((p) => p.class_id))];
  const subjectIds = [...new Set(pairs.map((p) => p.subject_id))];
  if (!classIds.length) {
    return NextResponse.json({ classes: [], subjects: [], classSubjects: [], terms: [], assignments: [], stats: {}, classSize: {} });
  }
  const ok = new Set(pairs.map((p) => pk(p.class_id, p.subject_id)));

  const [classes, subjects, terms, assignments] = await Promise.all([
    db.from("classes").select("id, name").in("id", classIds).order("sort_order"),
    db.from("subjects").select("id, name").in("id", subjectIds).order("name"),
    db.from("terms").select("*"),
    db.from("assignments")
      .select("id, term_id, class_id, subject_id, title, instructions, max_score, due_at, is_published, created_at")
      .in("class_id", classIds).in("subject_id", subjectIds)
      .order("created_at", { ascending: false }).limit(300),
  ]);

  // only the teacher's own class + subject combinations
  const list = ((assignments.data ?? []) as Asg[]).filter((a) => ok.has(pk(a.class_id, a.subject_id)));
  const ids = list.map((a) => a.id);

  const stats: Record<string, { submitted: number; marked: number }> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const rows = await allRows<{ assignment_id: string; score: number | null }>((a, b) =>
      db.from("assignment_submissions").select("assignment_id, score").in("assignment_id", chunk).range(a, b));
    for (const r of rows) {
      const s = (stats[r.assignment_id] ??= { submitted: 0, marked: 0 });
      s.submitted++;
      if (r.score !== null && r.score !== undefined) s.marked++;
    }
  }
  const studs = await allRows<{ class_id: string }>((a, b) =>
    db.from("students").select("class_id").in("class_id", classIds).eq("is_active", true).range(a, b));
  const classSize: Record<string, number> = {};
  for (const s of studs) classSize[s.class_id] = (classSize[s.class_id] ?? 0) + 1;

  return NextResponse.json({
    classes: classes.data ?? [],
    subjects: subjects.data ?? [],
    classSubjects: pairs,
    terms: terms.error ? null : terms.data,
    assignments: list,
    stats,
    classSize,
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

  // Loads an assignment ONLY if it is one of this teacher's own class + subject combinations
  async function own(id: unknown): Promise<Asg | null> {
    const aid = String(id ?? "");
    if (!aid) return null;
    const { data } = await sb.from("assignments")
      .select("id, term_id, class_id, subject_id, title, instructions, max_score, due_at, is_published")
      .eq("id", aid).maybeSingle();
    const a = data as Asg | null;
    return a && ok.has(pk(a.class_id, a.subject_id)) ? a : null;
  }
  const classNames = async (ids: string[]) => {
    if (!ids.length) return [] as string[];
    const { data } = await sb.from("classes").select("id, name").in("id", ids);
    return (data ?? []).map((x) => x.name as string);
  };

  // One assignment (a separate copy) for every ticked class this teacher teaches the subject in
  if (b.action === "createMany") {
    const title = String(b.title ?? "").trim().slice(0, 200);
    if (!title) return fail("Enter a title", 400);
    const classIds = ((b.classIds ?? []) as string[]).map(String);
    const subjectId = String(b.subjectId ?? "");
    if (!b.termId || !subjectId || !classIds.length) return fail("Choose a term, at least one class and a subject", 400);
    const max = Number(b.maxScore);
    const maxScore = Number.isInteger(max) && max >= 1 && max <= 100 ? max : 10;
    if (b.dueAt && Number.isNaN(new Date(b.dueAt).getTime())) return fail("That deadline is not a valid date", 400);

    const good = classIds.filter((id) => ok.has(pk(id, subjectId)));
    const skipIds = classIds.filter((id) => !ok.has(pk(id, subjectId)));
    if (!good.length) return fail("You do not teach that subject in the ticked classes", 400);

    const rows = good.map((class_id) => ({
      term_id: b.termId, class_id, subject_id: subjectId,
      title, instructions: String(b.instructions ?? "").trim().slice(0, 10000) || null,
      max_score: maxScore, due_at: b.dueAt || null, is_published: false,
    }));
    const { data, error } = await sb.from("assignments").insert(rows).select("id");
    if (error) { console.error("teacher createMany failed:", error.message); return fail("Could not create the assignment."); }
    return NextResponse.json({ ok: true, ids: (data ?? []).map((r) => r.id), skipped: await classNames(skipIds) });
  }

  // Copy an assignment to other classes the teacher teaches the same subject in (as drafts)
  if (b.action === "copy") {
    const a = await own(b.assignmentId);
    if (!a) return fail("Assignment not found", 404);
    const classIds = ((b.classIds ?? []) as string[]).map(String);
    const targets = classIds.filter((x) => x !== a.class_id);
    if (!targets.length) return fail("Choose a different class", 400);
    const takes = targets.filter((x) => ok.has(pk(x, a.subject_id)));
    const notTaking = targets.filter((x) => !ok.has(pk(x, a.subject_id)));
    const { data: dup } = await sb.from("assignments").select("class_id")
      .eq("term_id", a.term_id).eq("subject_id", a.subject_id).eq("title", a.title).in("class_id", takes.length ? takes : ["00000000-0000-0000-0000-000000000000"]);
    const has = new Set((dup ?? []).map((r) => String(r.class_id)));
    const good = takes.filter((x) => !has.has(x));
    const already = takes.filter((x) => has.has(x));
    let created = 0;
    if (good.length) {
      const rows = good.map((class_id) => ({
        term_id: a.term_id, class_id, subject_id: a.subject_id, title: a.title,
        instructions: a.instructions, max_score: a.max_score, due_at: a.due_at, is_published: false,
      }));
      const { data, error } = await sb.from("assignments").insert(rows).select("id");
      if (error) { console.error("teacher copy failed:", error.message); return fail("Could not copy the assignment."); }
      created = (data ?? []).length;
    }
    return NextResponse.json({ ok: true, created, notTaking: await classNames(notTaking), already: await classNames(already) });
  }

  // Change the title, instructions, deadline (and marks, only before anyone has submitted)
  if (b.action === "update") {
    const a = await own(b.assignmentId);
    if (!a) return fail("Assignment not found", 404);
    const title = String(b.title ?? "").trim().slice(0, 200);
    if (!title) return fail("Enter a title", 400);
    const max = Number(b.maxScore);
    const maxScore = Number.isInteger(max) && max >= 1 && max <= 100 ? max : a.max_score;
    if (maxScore !== a.max_score) {
      const { count } = await sb.from("assignment_submissions").select("id", { count: "exact", head: true }).eq("assignment_id", a.id);
      if (count) return fail("Students have already submitted, so the marks it is out of cannot be changed.", 400);
    }
    if (b.dueAt && Number.isNaN(new Date(b.dueAt).getTime())) return fail("That deadline is not a valid date", 400);
    const { error } = await sb.from("assignments").update({
      title, instructions: String(b.instructions ?? "").trim().slice(0, 10000) || null,
      max_score: maxScore, due_at: b.dueAt || null,
    }).eq("id", a.id);
    if (error) { console.error("teacher update failed:", error.message); return fail("Could not save the changes."); }
    return NextResponse.json({ ok: true });
  }

  // Close now = deadline set to this moment (students can no longer submit)
  if (b.action === "closeNow") {
    const a = await own(b.assignmentId);
    if (!a) return fail("Assignment not found", 404);
    const { error } = await sb.from("assignments").update({ due_at: new Date().toISOString() }).eq("id", a.id);
    if (error) return fail("Could not close the assignment.");
    return NextResponse.json({ ok: true });
  }

  if (b.action === "publish") {
    const a = await own(b.assignmentId);
    if (!a) return fail("Assignment not found", 404);
    const { error } = await sb.from("assignments").update({ is_published: !!b.value }).eq("id", a.id);
    if (error) return fail("Could not update the assignment.");
    return NextResponse.json({ ok: true });
  }

  if (b.action === "submissions") {
    const a = await own(b.assignmentId);
    if (!a) return fail("Assignment not found", 404);
    const { data: studs } = await sb.from("students").select("id, name, login_id")
      .eq("class_id", a.class_id).eq("is_active", true).order("login_id");
    const { data: subs } = await sb.from("assignment_submissions")
      .select("student_id, answer, files, submitted_at, score, comment").eq("assignment_id", a.id);
    const rows = await Promise.all((studs ?? []).map(async (s) => {
      const x = (subs ?? []).find((y) => y.student_id === s.id);
      const refs = ((x?.files ?? []) as { path: string; name: string; type: string }[]);
      // Private files: give the teacher a temporary link (1 hour) for each one
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
    const a = await own(b.assignmentId);
    if (!a) return fail("Assignment not found", 404);
    const blank = b.score === "" || b.score === null || b.score === undefined;
    const score = blank ? null : Number(b.score);
    if (score !== null && (!Number.isInteger(score) || score < 0 || score > a.max_score)) {
      return fail(`Mark must be a whole number from 0 to ${a.max_score}`, 400);
    }
    const { data, error } = await sb.from("assignment_submissions")
      .update({
        score,
        comment: String(b.comment ?? "").trim().slice(0, 1000) || null,
        marked_at: score === null ? null : new Date().toISOString(),
      })
      .eq("assignment_id", a.id).eq("student_id", String(b.studentId ?? ""))
      .select("id");
    if (error) { console.error("teacher mark failed:", error.message); return fail("Could not save the mark."); }
    if (!data?.length) return fail("This student has not submitted yet", 400);
    return NextResponse.json({ ok: true });
  }

  // Safe delete only: not published, and no student has submitted
  if (b.action === "delete") {
    const a = await own(b.assignmentId);
    if (!a) return fail("Assignment not found", 404);
    if (a.is_published) return fail("Unpublish this assignment first, then delete it.", 400);
    const { count, error: e1 } = await sb.from("assignment_submissions")
      .select("id", { count: "exact", head: true }).eq("assignment_id", a.id);
    if (e1) return fail("Could not check the submissions.");
    if (count) return fail("Students have already submitted this assignment, so it cannot be deleted. Unpublish it instead.", 400);
    const { error } = await sb.from("assignments").delete().eq("id", a.id);
    if (error) return fail("Could not delete the assignment.");
    return NextResponse.json({ ok: true });
  }

  return fail("Unknown action", 400);
}
