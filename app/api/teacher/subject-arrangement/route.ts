import { NextResponse } from "next/server";
import { getTeacher, teacherDenied } from "@/lib/teacher";

const primary = (name: string) => {
  const n = name.trim().toLowerCase();
  return !/\b(jss|sss|junior secondary|senior secondary)\b/.test(n) &&
    (/\b(cr[eè]che|nursery|kindergarten|kg)\b/.test(n) || /\b(basic|primary)\s*[1-6]\b/.test(n));
};

export async function GET(request: Request) {
  const t = await getTeacher();
  if (t.status !== "ok") return teacherDenied(t.status);
  const classId = new URL(request.url).searchParams.get("classId") ?? "";
  if (!t.allowedClassIds.includes(classId)) return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const [cls, links, subjects] = await Promise.all([
    t.db.from("classes").select("name").eq("id", classId).single(),
    t.db.from("class_subjects").select("subject_id, position").eq("class_id", classId).order("position"),
    t.db.from("subjects").select("id, name"),
  ]);
  if (cls.error || links.error || subjects.error) return NextResponse.json({ error: "Could not load subjects." }, { status: 500 });
  const shared = primary(cls.data.name);
  const canArrange = shared ? t.classTeacherIds.includes(classId) : true;
  const allowed = new Set(t.subjectLinks.filter(x => x.class_id === classId).map(x => x.subject_id));
  const rows = (links.data ?? []).filter(x => shared || allowed.has(x.subject_id));
  const names = new Map((subjects.data ?? []).map(x => [x.id, x.name]));
  let ordered = rows.map(x => ({ id: x.subject_id, name: names.get(x.subject_id) ?? "Subject" }));
  if (!shared && ordered.length) {
    const { data, error } = await t.db.from("teacher_subject_order")
      .select("subject_id, position").eq("teacher_id", t.teacher.id).eq("class_id", classId);
    if (error) return NextResponse.json({ error: "Subject arrangement database migration is required." }, { status: 500 });
    const positions = new Map((data ?? []).map(x => [x.subject_id, x.position]));
    const fallback = new Map(ordered.map((x, i) => [x.id, i]));
    ordered = [...ordered].sort((a, b) => (positions.get(a.id) ?? 100000 + (fallback.get(a.id) ?? 0)) - (positions.get(b.id) ?? 100000 + (fallback.get(b.id) ?? 0)));
  }
  return NextResponse.json({ subjects: ordered, canArrange, scope: shared ? "class" : "personal", className: cls.data.name });
}

export async function POST(request: Request) {
  const t = await getTeacher();
  if (t.status !== "ok") return teacherDenied(t.status);
  const body = await request.json().catch(() => null) as { classId?: unknown; order?: unknown } | null;
  if (!body || typeof body.classId !== "string" || !Array.isArray(body.order) ||
      !body.order.every(x => typeof x === "string") || new Set(body.order).size !== body.order.length)
    return NextResponse.json({ error: "Invalid subject order." }, { status: 400 });
  const classId = body.classId;
  if (!t.allowedClassIds.includes(classId)) return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const [cls, links] = await Promise.all([
    t.db.from("classes").select("name").eq("id", classId).single(),
    t.db.from("class_subjects").select("subject_id").eq("class_id", classId),
  ]);
  if (cls.error || links.error) return NextResponse.json({ error: "Could not verify subjects." }, { status: 500 });
  const shared = primary(cls.data.name);
  if (shared && !t.classTeacherIds.includes(classId))
    return NextResponse.json({ error: "Only the class teacher can arrange this class's subjects." }, { status: 403 });
  const allowed = new Set(t.subjectLinks.filter(x => x.class_id === classId).map(x => x.subject_id));
  const expected = (links.data ?? []).map(x => x.subject_id).filter(id => shared || allowed.has(id));
  const given = body.order as string[];
  if (expected.length !== given.length || !given.every(id => expected.includes(id)))
    return NextResponse.json({ error: "The subject list has changed. Reload and try again." }, { status: 409 });
  const { error } = shared
    ? await t.db.rpc("dkps_save_class_subject_order", { p_class_id: classId, p_subject_ids: given })
    : await t.db.rpc("dkps_save_teacher_subject_order", { p_teacher_id: t.teacher.id, p_class_id: classId, p_subject_ids: given });
  if (error) {
    console.error("subject arrangement failed", error.message);
    return NextResponse.json({ error: "Could not save subject order. Verify the subject-arrangement SQL migration." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
