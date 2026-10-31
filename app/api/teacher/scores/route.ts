import { NextResponse } from "next/server";
import { getTeacher, teacherDenied, type TeacherCtx } from "@/lib/teacher";

// The page and Excel use "ca" and "exam"; the scores table stores CA as "test1".
const LIMIT: Record<string, number> = { ca: 40, exam: 60 };
const KIND: Record<string, string> = { ca: "test1", exam: "exam" };
const NOBODY = "00000000-0000-0000-0000-000000000000";

type Term = { id: string; term: string; session: string; is_active: boolean | null; is_locked: boolean | null };

async function allRows<T>(q: (from: number, to: number) => PromiseLike<{ data: unknown[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await q(from, from + 999);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

// Scores can only be entered for the CURRENT term
async function currentTerm(t: TeacherCtx): Promise<Term | null> {
  const { data } = await t.db.from("terms").select("id, term, session, is_active, is_locked").eq("is_active", true).limit(1);
  return ((data ?? [])[0] as Term | undefined) ?? null;
}

/**
 * Which subjects this teacher may fill, per class:
 *  - the class teacher of a class: every subject of that class
 *  - a class that HAS a class teacher: nobody else may fill it (blocked)
 *  - a class with no class teacher: the subject teacher's own subjects
 */
async function fillable(t: TeacherCtx): Promise<{ map: Map<string, string[]>; blocked: Set<string> }> {
  const { db } = t;
  const classIds = t.allowedClassIds;
  const map = new Map<string, string[]>();
  const blocked = new Set<string>();
  if (!classIds.length) return { map, blocked };

  const { data: tcs } = await db.from("teacher_classes").select("teacher_id, class_id").in("class_id", classIds);
  const tcRows = (tcs ?? []) as { teacher_id: string; class_id: string }[];
  const tIds = [...new Set(tcRows.map((r) => r.teacher_id))];
  const { data: act } = tIds.length
    ? await db.from("teachers").select("id").in("id", tIds).eq("is_active", true)
    : { data: [] as { id: string }[] };
  const activeSet = new Set(((act ?? []) as { id: string }[]).map((x) => x.id));
  const hasClassTeacher = new Set(tcRows.filter((r) => activeSet.has(r.teacher_id)).map((r) => r.class_id));

  const { data: cs } = await db.from("class_subjects").select("class_id, subject_id").in("class_id", classIds);
  const csRows = (cs ?? []) as { class_id: string; subject_id: string }[];

  for (const cid of classIds) {
    if (t.classTeacherIds.includes(cid)) {
      map.set(cid, csRows.filter((r) => r.class_id === cid).map((r) => r.subject_id));
    } else if (hasClassTeacher.has(cid)) {
      blocked.add(cid);
      map.set(cid, []);
    } else {
      map.set(cid, [...new Set(t.subjectLinks.filter((l) => l.class_id === cid).map((l) => l.subject_id))]);
    }
  }
  return { map, blocked };
}

export async function GET(request: Request) {
  const t = await getTeacher();
  if (t.status !== "ok") return teacherDenied(t.status);
  const { db } = t;

  const term = await currentTerm(t);
  const termInfo = term ? { id: term.id, label: `${term.term} — ${term.session}`, locked: !!term.is_locked } : null;
  const { map, blocked } = await fillable(t);
  const classId = new URL(request.url).searchParams.get("classId");

  // ---------- list: the classes and subjects this teacher may fill ----------
  if (!classId) {
    if (!t.allowedClassIds.length) return NextResponse.json({ term: termInfo, classes: [] });
    const allSubjectIds = [...new Set([...map.values()].flat())];
    const [classes, subjects] = await Promise.all([
      db.from("classes").select("id, name").in("id", t.allowedClassIds).order("sort_order"),
      allSubjectIds.length ? db.from("subjects").select("id, name").in("id", allSubjectIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const sname = new Map(((subjects.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
    return NextResponse.json({
      term: termInfo,
      classes: ((classes.data ?? []) as { id: string; name: string }[]).map((c) => ({
        id: c.id,
        name: c.name,
        canFill: !blocked.has(c.id) && (map.get(c.id) ?? []).length > 0,
        note: blocked.has(c.id) ? "The class teacher fills the scores for this class." : "",
        subjects: (map.get(c.id) ?? []).map((id) => ({ id, name: sname.get(id) ?? "Subject" })).sort((a, b) => a.name.localeCompare(b.name)),
      })),
    });
  }

  // ---------- one class: everything the page needs to build the broadsheet ----------
  if (!t.allowedClassIds.includes(classId)) return NextResponse.json({ error: "You do not teach that class." }, { status: 403 });
  if (blocked.has(classId)) return NextResponse.json({ error: "The class teacher fills the scores for this class." }, { status: 403 });
  const allow = new Set(map.get(classId) ?? []);
  if (!allow.size) return NextResponse.json({ error: "You have no subjects to fill in this class." }, { status: 403 });
  if (!term) return NextResponse.json({ error: "No term is open for scores right now." }, { status: 400 });

  const { data: students } = await db.from("students").select("id, login_id, name")
    .eq("class_id", classId).eq("is_active", true).order("login_id");
  const { data: cs } = await db.from("class_subjects").select("subject_id, position").eq("class_id", classId).order("position");
  const orderedIds = ((cs ?? []) as { subject_id: string }[]).map((x) => x.subject_id).filter((id) => allow.has(id));
  const { data: subs } = orderedIds.length ? await db.from("subjects").select("id, name").in("id", orderedIds) : { data: [] as { id: string; name: string }[] };
  const subjects = orderedIds.map((id) => ((subs ?? []) as { id: string; name: string }[]).find((s) => s.id === id)).filter(Boolean);

  const sids = ((students ?? []) as { id: string }[]).map((s) => s.id);
  const { data: ss } = sids.length ? await db.from("student_subjects").select("student_id, subject_id").in("student_id", sids) : { data: [] };
  const scores = sids.length
    ? await allRows<{ student_id: string; subject_id: string; kind: string; score: number }>((a, b) =>
        db.from("scores").select("student_id, subject_id, kind, score").eq("term_id", term.id).in("student_id", sids).in("subject_id", orderedIds).range(a, b))
    : [];
  return NextResponse.json({
    term: termInfo,
    students: students ?? [],
    subjects,
    studentSubjects: ss ?? [],
    scores: scores.map((x) => ({ ...x, kind: x.kind === "test1" ? "ca" : x.kind })),
  });
}

type Prepared =
  | { error: string; status: number }
  | {
      term: Term;
      classId: string;
      out: { student_id: string; subject_id: string; kind: string; score: number }[];
      unknown: string[];
      changes: number;
      fromOthers: number;
      examples: string[];
    };

// Checks a whole upload for one class. Nothing is written here.
async function prepare(t: TeacherCtx, b: Record<string, unknown>): Promise<Prepared> {
  const { db } = t;
  const classId = String(b.classId ?? "");
  const term = await currentTerm(t);
  if (!term) return { error: "No term is open for scores right now.", status: 400 };
  if (term.is_locked) return { error: "This term is locked, so scores cannot be changed.", status: 400 };
  if (!classId || !t.allowedClassIds.includes(classId)) return { error: "You do not teach that class.", status: 403 };

  const { map, blocked } = await fillable(t);
  if (blocked.has(classId)) return { error: "The class teacher fills the scores for this class.", status: 403 };
  const allow = new Set(map.get(classId) ?? []);
  if (!allow.size) return { error: "You have no subjects to fill in this class.", status: 403 };

  const rows = (Array.isArray(b.rows) ? b.rows : []) as { loginId?: unknown; scores?: unknown }[];
  if (!rows.length) return { error: "The file has no scores to save.", status: 400 };
  if (rows.length > 300) return { error: "That is too many students for one class.", status: 400 };

  const { data: studs } = await db.from("students").select("id, login_id, name").eq("class_id", classId).eq("is_active", true);
  const byLogin = new Map(((studs ?? []) as { id: string; login_id: string; name: string }[]).map((s) => [s.login_id, s]));
  const sname = new Map<string, string>();

  const out: { student_id: string; subject_id: string; kind: string; score: number }[] = [];
  const seen = new Set<string>();
  const unknown: string[] = [];
  const notYours = new Set<string>();
  const tooHigh: string[] = [];

  for (const r of rows) {
    const st = byLogin.get(String(r.loginId ?? ""));
    if (!st) { unknown.push(String(r.loginId ?? "")); continue; }
    sname.set(st.id, st.name);
    const list = (Array.isArray(r.scores) ? r.scores : []) as { subjectId?: unknown; kind?: unknown; score?: unknown }[];
    if (list.length > 100) return { error: "Too many scores for one student.", status: 400 };
    for (const s of list) {
      const kind = String(s.kind ?? "");
      const subjectId = String(s.subjectId ?? "");
      const score = Number(s.score);
      if (!(kind in LIMIT) || !Number.isInteger(score) || score < 0) continue;
      if (!allow.has(subjectId)) { notYours.add(subjectId); continue; }
      if (score > LIMIT[kind]) { tooHigh.push(`${st.login_id} ${kind === "ca" ? "CA" : "Exam"} ${score} (max ${LIMIT[kind]})`); continue; }
      const key = `${st.id}|${subjectId}|${kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ student_id: st.id, subject_id: subjectId, kind: KIND[kind], score });
    }
  }

  if (notYours.size) {
    const { data } = await db.from("subjects").select("id, name").in("id", [...notYours]);
    const names = ((data ?? []) as { name: string }[]).map((x) => x.name).join(", ") || "other subjects";
    return { error: `Nothing saved. You cannot fill: ${names}.`, status: 403 };
  }
  if (tooHigh.length) {
    return { error: `Nothing saved. Scores above the limit: ${tooHigh.slice(0, 8).join("; ")}${tooHigh.length > 8 ? ` … and ${tooHigh.length - 8} more` : ""}`, status: 400 };
  }

  // Which of these scores would CHANGE a score that is already saved?
  let changes = 0, fromOthers = 0;
  const examples: string[] = [];
  const ids = [...new Set(out.map((o) => o.student_id))];
  if (ids.length) {
    const subjNames = new Map<string, string>();
    const { data: sj } = await db.from("subjects").select("id, name").in("id", [...allow]);
    for (const x of (sj ?? []) as { id: string; name: string }[]) subjNames.set(x.id, x.name);
    const existing = await allRows<{ student_id: string; subject_id: string; kind: string; score: number; source: string | null }>((a, z) =>
      db.from("scores").select("student_id, subject_id, kind, score, source").eq("term_id", term.id).in("student_id", ids).in("subject_id", [...allow]).range(a, z));
    const had = new Map(existing.map((e) => [`${e.student_id}|${e.subject_id}|${e.kind}`, e]));
    for (const o of out) {
      const e = had.get(`${o.student_id}|${o.subject_id}|${o.kind}`);
      if (e && e.score !== o.score) {
        changes++;
        if (e.source !== "teacher") fromOthers++;
        if (examples.length < 5) {
          examples.push(`${sname.get(o.student_id) ?? ""} · ${subjNames.get(o.subject_id) ?? ""} ${o.kind === "test1" ? "CA" : "Exam"}: ${e.score} → ${o.score}`);
        }
      }
    }
  }
  return { term, classId, out, unknown, changes, fromOthers, examples };
}

export async function POST(request: Request) {
  const t = await getTeacher();
  if (t.status !== "ok") return teacherDenied(t.status);
  const b = await request.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const fail = (m: string, s = 500) => NextResponse.json({ error: m }, { status: s });

  if (b.action !== "check" && b.action !== "save") return fail("Unknown action", 400);

  const p = await prepare(t, b);
  if ("error" in p) return fail(p.error, p.status);

  // Check only: tell the page what would happen, save nothing
  if (b.action === "check") {
    return NextResponse.json({
      ok: true, toSave: p.out.length, changes: p.changes, fromOthers: p.fromOthers, examples: p.examples, unknown: p.unknown,
    });
  }

  // Save: if it would change existing scores, the teacher must have confirmed
  if (p.changes > 0 && !b.confirm) {
    return NextResponse.json(
      { error: "This would change scores that are already saved. Please confirm.", needsConfirm: true, changes: p.changes, fromOthers: p.fromOthers, examples: p.examples },
      { status: 409 }
    );
  }
  let saved = 0;
  for (let i = 0; i < p.out.length; i += 400) {
    const { data, error } = await t.db.rpc("teacher_save_scores", { p_term: p.term.id, p_class: p.classId, p_rows: p.out.slice(i, i + 400) });
    if (error) {
      console.error("teacher_save_scores failed:", error.message);
      return fail(error.message.includes("current term") || error.message.includes("locked") ? error.message : "Could not save the scores.");
    }
    saved += Number(data);
  }
  return NextResponse.json({ ok: true, saved, unknown: p.unknown });
}