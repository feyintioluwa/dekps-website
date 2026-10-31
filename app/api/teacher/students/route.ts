import { NextResponse } from "next/server";
import { getTeacher, teacherDenied } from "@/lib/teacher";

// Student list for ONE class the teacher is allowed to open. No PINs are ever returned.
export async function GET(request: Request) {
  const t = await getTeacher();
  if (t.status !== "ok") return teacherDenied(t.status);

  const classId = new URL(request.url).searchParams.get("classId") ?? "";
  if (!t.allowedClassIds.includes(classId)) {
    return NextResponse.json({ error: "You do not have access to that class." }, { status: 403 });
  }

  const { data, error } = await t.db
    .from("students")
    .select("id, login_id, name")
    .eq("class_id", classId)
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("teacher/students failed:", error.message);
    return NextResponse.json({ error: "Could not load the students." }, { status: 500 });
  }

  return NextResponse.json({ students: data ?? [] });
}