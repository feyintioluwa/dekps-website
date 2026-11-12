
import { NextResponse } from "next/server";
import { getTeacher, teacherDenied, type TeacherCtx } from "@/lib/teacher";

type Pair = { class_id: string; subject_id: string };
type HistoryRow = {
  id: number;
  term_id: string;
  student_id: string;
  class_id: string;
  subject_id: string;
  kind: string;
  old_score: number | null;
  new_score: number;
  source: string | null;
  action: string;
  editor_teacher_id: string | null;
  changed_at: string;
};

async function allowedPairs(t: TeacherCtx): Promise<Pair[]> {
  const pairs = new Map<string, Pair>();
  for (const link of t.subjectLinks) {
    pairs.set(`${link.class_id}|${link.subject_id}`, link);
  }
  if (t.classTeacherIds.length) {
    const { data, error } = await t.db
      .from("class_subjects")
      .select("class_id, subject_id")
      .in("class_id", t.classTeacherIds);
    if (error) throw new Error("Could not load authorized subjects");
    for (const link of (data ?? []) as Pair[]) {
      pairs.set(`${link.class_id}|${link.subject_id}`, link);
    }
  }
  return [...pairs.values()];
}

export async function GET(request: Request) {
  const t = await getTeacher();
  if (t.status !== "ok") return teacherDenied(t.status);

  try {
    const pairs = await allowedPairs(t);
    if (!pairs.length) return NextResponse.json({ items: [], terms: [], classes: [], subjects: [], hasMore: false });

    const params = new URL(request.url).searchParams;
    const termId = params.get("termId") || "";
    const classId = params.get("classId") || "";
    const subjectId = params.get("subjectId") || "";
    const page = Number(params.get("page") ?? "0");
    if (!Number.isSafeInteger(page) || page < 0 || page > 10000) {
      return NextResponse.json({ error: "Invalid page" }, { status: 400 });
    }

    const permitted = pairs.filter((p) =>
      (!classId || p.class_id === classId) &&
      (!subjectId || p.subject_id === subjectId)
    );
    if (!permitted.length) {
      return NextResponse.json({ items: [], terms: [], hasMore: false });
    }

    // These UUIDs come from the database-backed authorization lookup, never user input.
    const allowedOr = permitted
      .map((p) => `and(class_id.eq.${p.class_id},subject_id.eq.${p.subject_id})`)
      .join(",");

    const pageSize = 50;
    let query = t.db
      .from("score_edit_history")
      .select("id,term_id,student_id,class_id,subject_id,kind,old_score,new_score,source,action,editor_teacher_id,changed_at")
      .or(allowedOr)
      .order("changed_at", { ascending: false })
      .order("id", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize);
    if (termId) query = query.eq("term_id", termId);
    const { data, error } = await query;
    if (error) throw error;
    const records = (data ?? []) as HistoryRow[];
    const visible = records.slice(0, pageSize);

    const ids = <T,>(values: T[]) => [...new Set(values)];
    const studentIds = ids(visible.map((x) => x.student_id));
    const classIds = ids(visible.map((x) => x.class_id));
    const subjectIds = ids(visible.map((x) => x.subject_id));
    const teacherIds = ids(visible.map((x) => x.editor_teacher_id).filter((x): x is string => !!x));
    const termIds = ids(visible.map((x) => x.term_id));

    const [students, classes, subjects, teachers, terms] = await Promise.all([
      studentIds.length ? t.db.from("students").select("id,name,login_id").in("id", studentIds) : Promise.resolve({ data: [], error: null }),
      classIds.length ? t.db.from("classes").select("id,name").in("id", classIds) : Promise.resolve({ data: [], error: null }),
      subjectIds.length ? t.db.from("subjects").select("id,name").in("id", subjectIds) : Promise.resolve({ data: [], error: null }),
      teacherIds.length ? t.db.from("teachers").select("id,name").in("id", teacherIds) : Promise.resolve({ data: [], error: null }),
      termIds.length ? t.db.from("terms").select("id,term,session").in("id", termIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if ([students, classes, subjects, teachers, terms].some((r) => r.error)) {
      throw new Error("Could not resolve score history details");
    }

    const lookup = (rows: { id: string; name?: string; term?: string; session?: string; login_id?: string }[]) =>
      new Map(rows.map((row) => [row.id, row]));
    const sm = lookup(students.data ?? []);
    const cm = lookup(classes.data ?? []);
    const subm = lookup(subjects.data ?? []);
    const tm = lookup(teachers.data ?? []);
    const trm = lookup(terms.data ?? []);

    const items = visible.map((x) => {
      const term = trm.get(x.term_id);
      return {
        ...x,
        student_name: sm.get(x.student_id)?.name ?? "Unknown student",
        student_login_id: sm.get(x.student_id)?.login_id ?? "",
        class_name: cm.get(x.class_id)?.name ?? "Unknown class",
        subject_name: subm.get(x.subject_id)?.name ?? "Unknown subject",
        editor_name: x.editor_teacher_id
          ? (tm.get(x.editor_teacher_id)?.name ?? "Unknown teacher")
          : (x.source === "teacher" ? "Teacher (not recorded)" : "Admin / system"),
        term_label: term ? `${term.term} — ${term.session}` : "Unknown term",
      };
    });

    // Filter choices come from the teacher's authorized class/subject pairs.
    const authorizedClassIds = ids(pairs.map((p) => p.class_id));
    const authorizedSubjectIds = ids(pairs.map((p) => p.subject_id));
    const [allTermsResult, allowedClassesResult, allowedSubjectsResult] = await Promise.all([
      t.db.from("terms").select("id,term,session"),
      t.db.from("classes").select("id,name").in("id", authorizedClassIds),
      t.db.from("subjects").select("id,name").in("id", authorizedSubjectIds),
    ]);
    if (allTermsResult.error || allowedClassesResult.error || allowedSubjectsResult.error) {
      throw new Error("Could not load history filters");
    }

    return NextResponse.json({
      items,
      terms: (allTermsResult.data ?? []).map((term) => ({ id: term.id, label: `${term.term} — ${term.session}` })),
      classes: allowedClassesResult.data ?? [],
      subjects: allowedSubjectsResult.data ?? [],
      hasMore: records.length > pageSize,
    });
  } catch (error) {
    console.error("Teacher score history GET failed:", error);
    return NextResponse.json({ error: "Could not load score history." }, { status: 500 });
  }
}
