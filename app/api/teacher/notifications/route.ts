import { NextResponse } from "next/server";
import { getTeacher, teacherDenied } from "@/lib/teacher";

type Row = { id: string; assignment_id: string; student_id: string; submitted_at: string; read_at: string | null };

// GET  = this teacher's notifications (newest first)
// POST = { action: "read", id } or { action: "readAll" }
export async function GET() {
  const t = await getTeacher();
  if (t.status !== "ok") return teacherDenied(t.status);
  const { db, teacher, classTeacherIds, subjectLinks } = t;

  const { data, error } = await db.from("teacher_notifications")
    .select("id, assignment_id, student_id, submitted_at, read_at")
    .eq("teacher_id", teacher.id)
    .order("submitted_at", { ascending: false }).limit(100);
  if (error) {
    console.error("notifications failed:", error.message);
    return NextResponse.json({ items: [] });
  }
  const rows = (data ?? []) as Row[];
  if (!rows.length) return NextResponse.json({ items: [] });

  const { data: asgs } = await db.from("assignments").select("id, title, class_id, subject_id")
    .in("id", [...new Set(rows.map((r) => r.assignment_id))]);
  const asg = new Map((asgs ?? []).map((a) => [a.id as string, a]));

  const [studs, classes, subjects] = await Promise.all([
    db.from("students").select("id, name").in("id", [...new Set(rows.map((r) => r.student_id))]),
    db.from("classes").select("id, name").in("id", [...new Set((asgs ?? []).map((a) => a.class_id as string))]),
    db.from("subjects").select("id, name").in("id", [...new Set((asgs ?? []).map((a) => a.subject_id as string))]),
  ]);
  const sName = new Map((studs.data ?? []).map((s) => [s.id as string, s.name as string]));
  const cName = new Map((classes.data ?? []).map((c) => [c.id as string, c.name as string]));
  const jName = new Map((subjects.data ?? []).map((s) => [s.id as string, s.name as string]));

  // Only show what this teacher may still open
  const mine = new Set(subjectLinks.map((l) => `${l.class_id}|${l.subject_id}`));
  const items = rows.flatMap((r) => {
    const a = asg.get(r.assignment_id);
    if (!a) return [];
    if (!mine.has(`${a.class_id}|${a.subject_id}`) && !classTeacherIds.includes(a.class_id as string)) return [];
    return [{
      id: r.id,
      assignmentId: r.assignment_id,
      student: sName.get(r.student_id) ?? "A student",
      className: cName.get(a.class_id as string) ?? "",
      subject: jName.get(a.subject_id as string) ?? "",
      title: a.title as string,
      submittedAt: r.submitted_at,
      read: !!r.read_at,
    }];
  });
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const t = await getTeacher();
  if (t.status !== "ok") return teacherDenied(t.status);
  const { db, teacher } = t;
  const b = await request.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  // Always limited to this teacher's own rows
  if (b.action === "read" && b.id) {
    const { error } = await db.from("teacher_notifications")
      .update({ read_at: new Date().toISOString() }).eq("id", String(b.id)).eq("teacher_id", teacher.id).is("read_at", null);
    if (error) return NextResponse.json({ error: "Could not update." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (b.action === "readAll") {
    const { error } = await db.from("teacher_notifications")
      .update({ read_at: new Date().toISOString() }).eq("teacher_id", teacher.id).is("read_at", null);
    if (error) return NextResponse.json({ error: "Could not update." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
