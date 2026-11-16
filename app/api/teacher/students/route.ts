import { NextResponse } from "next/server";
import { getTeacher, teacherDenied } from "@/lib/teacher";

function eligibleClass(name: string) {
  const n = name.trim().toLowerCase().replace(/[–—-]/g, " ").replace(/\s+/g, " ");
  if (/\b(jss|junior secondary|sss|senior secondary)\b/.test(n)) return false;
  return /\b(cr[eè]che|creche|nursery|kindergarten|kg)\b/.test(n)
    || /\b(basic|primary)\s*([1-6])\b/.test(n);
}

export async function GET(request: Request) {
  const t = await getTeacher();
  if (t.status !== "ok") return teacherDenied(t.status);
  const classId = new URL(request.url).searchParams.get("classId") ?? "";
  if (!t.allowedClassIds.includes(classId))
    return NextResponse.json({ error: "You do not have access to that class." }, { status: 403 });

  const [{ data, error }, classResult] = await Promise.all([
    t.db.from("students").select("id,login_id,name,display_order")
      .eq("class_id", classId).eq("is_active", true)
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true }),
    t.db.from("classes").select("name").eq("id", classId).maybeSingle(),
  ]);
  if (error || classResult.error || !classResult.data) {
    console.error("teacher/students failed:", error?.message ?? classResult.error?.message);
    return NextResponse.json({ error: "Could not load the students." }, { status: 500 });
  }
  return NextResponse.json({
    students: data ?? [],
    canArrange: t.classTeacherIds.includes(classId) && eligibleClass(classResult.data.name),
  });
}

export async function POST(request: Request) {
  const t = await getTeacher();
  if (t.status !== "ok") return teacherDenied(t.status);
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "Invalid arrangement." }, { status: 400 });
  const { classId, studentIds } = body as { classId?: unknown; studentIds?: unknown };
  if (typeof classId !== "string" || !Array.isArray(studentIds) ||
      !studentIds.every((id) => typeof id === "string") ||
      new Set(studentIds).size !== studentIds.length)
    return NextResponse.json({ error: "Invalid arrangement." }, { status: 400 });
  if (!t.classTeacherIds.includes(classId))
    return NextResponse.json({ error: "Only the assigned class teacher can arrange students." }, { status: 403 });

  const { data: schoolClass, error: classError } = await t.db.from("classes")
    .select("name").eq("id", classId).maybeSingle();
  if (classError || !schoolClass)
    return NextResponse.json({ error: "Class not found." }, { status: 404 });
  if (!eligibleClass(schoolClass.name))
    return NextResponse.json({ error: "Student arrangement is not available for this class." }, { status: 403 });

  const { data: current, error: currentError } = await t.db.from("students")
    .select("id").eq("class_id", classId).eq("is_active", true);
  if (currentError)
    return NextResponse.json({ error: "Could not verify the class list." }, { status: 500 });
  const expected = new Set((current ?? []).map((s) => s.id));
  if (expected.size !== studentIds.length || !studentIds.every((id) => expected.has(id)))
    return NextResponse.json({ error: "The class list has changed. Reload and try again." }, { status: 409 });

  // SQL function updates the whole class in one database transaction.
  const { error } = await t.db.rpc("stage15_save_student_order", {
    p_class_id: classId,
    p_student_ids: studentIds,
  });
  if (error) {
    console.error("teacher/students arrange failed:", error.message);
    return NextResponse.json({ error: "Could not save student arrangement. Check the Stage 15 SQL migration." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
