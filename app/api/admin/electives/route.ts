import { NextResponse } from "next/server";
import { adminClient } from "@/lib/admin";

export async function GET(request: Request) {
  const c = adminClient(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const { sb } = c;
  const classId = new URL(request.url).searchParams.get("classId");
  if (!classId) {
    const { data } = await sb.from("classes").select("id, name").order("sort_order");
    return NextResponse.json({ classes: data ?? [] });
  }
  const { data: students } = await sb.from("students").select("id, login_id, name, stream").eq("class_id", classId).eq("is_active", true).order("name");
  const { data: cs } = await sb.from("class_subjects").select("subject_id, position").eq("class_id", classId).order("position");
  const ids = (cs ?? []).map((x) => x.subject_id);
  const { data: subs } = ids.length ? await sb.from("subjects").select("id, name").in("id", ids) : { data: [] as { id: string; name: string }[] };
  const sids = (students ?? []).map((s) => s.id);
  const { data: ss } = sids.length ? await sb.from("student_subjects").select("student_id, subject_id").in("student_id", sids) : { data: [] };
  return NextResponse.json({
    students: students ?? [],
    subjects: (cs ?? []).map((x) => subs?.find((s) => s.id === x.subject_id)).filter(Boolean),
    studentSubjects: ss ?? [],
  });
}

export async function POST(request: Request) {
  const c = adminClient(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const { sb } = c;
  const b = await request.json().catch(() => null);
  const studentIds: string[] = b?.studentIds ?? [];
  const subjectIds: string[] = b?.subjectIds ?? [];
  const stream = b?.stream ? String(b.stream) : null;
  if (!studentIds.length) return NextResponse.json({ error: "Select students" }, { status: 400 });
  if (b?.clear !== true && !subjectIds.length) return NextResponse.json({ error: "Select subjects" }, { status: 400 });

  const u = await sb.from("students").update({ stream }).in("id", studentIds);
  if (u.error) return NextResponse.json({ error: u.error.message }, { status: 500 });
  const d = await sb.from("student_subjects").delete().in("student_id", studentIds);
  if (d.error) return NextResponse.json({ error: d.error.message }, { status: 500 });
  if (b?.clear !== true) {
    const rows = studentIds.flatMap((sid) => subjectIds.map((subject_id) => ({ student_id: sid, subject_id })));
    const i = await sb.from("student_subjects").insert(rows);
    if (i.error) return NextResponse.json({ error: i.error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
