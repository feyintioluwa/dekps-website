import { NextResponse } from "next/server";
import { getTeacher, teacherDenied } from "@/lib/teacher";

type Named = { id: string; name: string };

export async function GET() {
  const t = await getTeacher();
  if (t.status !== "ok") return teacherDenied(t.status);

  const { db, teacher, classTeacherIds, subjectLinks, allowedClassIds } = t;

  if (allowedClassIds.length === 0) {
    return NextResponse.json({ teacher: { name: teacher.name, email: teacher.email }, classes: [] });
  }

  const [classes, subjects, classSubjects, students] = await Promise.all([
    db.from("classes").select("id, name, sort_order").in("id", allowedClassIds).order("sort_order"),
    db.from("subjects").select("id, name").order("name"),
    // a class teacher sees every subject their class takes
    classTeacherIds.length
      ? db.from("class_subjects").select("class_id, subject_id").in("class_id", classTeacherIds)
      : Promise.resolve({ data: [] as { class_id: string; subject_id: string }[], error: null }),
    db.from("students").select("class_id").in("class_id", allowedClassIds).eq("is_active", true),
  ]);

  if (classes.error || subjects.error || classSubjects.error || students.error) {
    console.error("teacher/me failed");
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  const subjectName = new Map(((subjects.data ?? []) as Named[]).map((s) => [s.id, s.name]));
  const counts = new Map<string, number>();
  for (const s of (students.data ?? []) as { class_id: string }[]) {
    counts.set(s.class_id, (counts.get(s.class_id) ?? 0) + 1);
  }

  const result = ((classes.data ?? []) as Named[]).map((c) => {
    const isClassTeacher = classTeacherIds.includes(c.id);

    const ids = new Set<string>(
      isClassTeacher
        ? ((classSubjects.data ?? []) as { class_id: string; subject_id: string }[])
            .filter((r) => r.class_id === c.id)
            .map((r) => r.subject_id)
        : []
    );
    for (const l of subjectLinks) if (l.class_id === c.id) ids.add(l.subject_id);

    return {
      id: c.id,
      name: c.name,
      isClassTeacher,
      studentCount: counts.get(c.id) ?? 0,
      subjects: [...ids]
        .map((id) => ({ id, name: subjectName.get(id) ?? "Subject" }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });

  return NextResponse.json({
    teacher: { name: teacher.name, email: teacher.email },
    classes: result,
  });
}