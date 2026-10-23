import { NextResponse } from "next/server";
import { adminClient } from "@/lib/admin";

const clean = (v: unknown) => String(v ?? "").trim().replace(/\s+/g, " ");

export async function GET(request: Request) {
  const c = adminClient(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const { sb } = c;
  const classId = new URL(request.url).searchParams.get("classId");

  if (!classId) {
    const [classes, subjects] = await Promise.all([
      sb.from("classes").select("id, name").order("sort_order"),
      sb.from("subjects").select("id, name").order("name"),
    ]);
    if (classes.error) return NextResponse.json({ error: classes.error.message }, { status: 500 });
    if (subjects.error) return NextResponse.json({ error: subjects.error.message }, { status: 500 });
    return NextResponse.json({ classes: classes.data ?? [], subjects: subjects.data ?? [] });
  }

  const { data, error } = await sb
    .from("class_subjects")
    .select("subject_id, position")
    .eq("class_id", classId)
    .order("position");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  const c = adminClient(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const { sb } = c;
  const b = await request.json().catch(() => null);
  const fail = (m: string, s = 500) => NextResponse.json({ error: m }, { status: s });
  if (!b?.action) return fail("Bad request", 400);

  // Add a subject to a class (an existing one, or a brand-new name)
  if (b.action === "add") {
    const classId = String(b.classId ?? "");
    if (!classId) return fail("Choose a class", 400);
    let subjectId = String(b.subjectId ?? "");
    const newName = clean(b.newName);
    if (!subjectId && !newName) return fail("Choose a subject or type a new name", 400);

    if (!subjectId) {
      const { data: all, error: e0 } = await sb.from("subjects").select("id, name");
      if (e0) return fail(e0.message);
      const same = (all ?? []).find((s) => clean(s.name).toLowerCase() === newName.toLowerCase());
      if (same) {
        subjectId = same.id;
      } else {
        const { data: ins, error: e1 } = await sb.from("subjects").insert({ name: newName }).select("id").single();
        if (e1) return fail(e1.message);
        subjectId = ins.id;
      }
    }

    const { data: cur, error: e2 } = await sb.from("class_subjects").select("subject_id, position").eq("class_id", classId);
    if (e2) return fail(e2.message);
    if ((cur ?? []).some((x) => x.subject_id === subjectId)) return fail("This class already has that subject", 400);
    const pos = Math.max(0, ...(cur ?? []).map((x) => x.position ?? 0)) + 1;
    const { error: e3 } = await sb.from("class_subjects").insert({ class_id: classId, subject_id: subjectId, position: pos });
    if (e3) return fail(e3.message);
    return NextResponse.json({ ok: true });
  }

  // Take a subject off a class's list (saved scores are NOT deleted)
  if (b.action === "remove") {
    const classId = String(b.classId ?? "");
    const subjectId = String(b.subjectId ?? "");
    if (!classId || !subjectId) return fail("Class and subject required", 400);
    const { error } = await sb.from("class_subjects").delete().eq("class_id", classId).eq("subject_id", subjectId);
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
  }

  // Save a new order for a class: order = list of subject ids, first to last
  if (b.action === "reorder") {
    const classId = String(b.classId ?? "");
    const order: string[] = Array.isArray(b.order) ? b.order.map(String) : [];
    if (!classId || !order.length) return fail("Nothing to reorder", 400);
    for (let i = 0; i < order.length; i++) {
      const { error } = await sb
        .from("class_subjects")
        .update({ position: i + 1 })
        .eq("class_id", classId)
        .eq("subject_id", order[i]);
      if (error) return fail(error.message);
    }
    return NextResponse.json({ ok: true });
  }

  // Rename a subject everywhere it is used
  if (b.action === "rename") {
    const subjectId = String(b.subjectId ?? "");
    const name = clean(b.name);
    if (!subjectId || !name) return fail("A new name is required", 400);
    const { data: all, error: e0 } = await sb.from("subjects").select("id, name");
    if (e0) return fail(e0.message);
    const clash = (all ?? []).find((s) => s.id !== subjectId && clean(s.name).toLowerCase() === name.toLowerCase());
    if (clash) return fail(`Another subject is already called "${clash.name}". To use it, add it to the class and remove this one.`, 400);
    const { error } = await sb.from("subjects").update({ name }).eq("id", subjectId);
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
  }

  return fail("Unknown action", 400);
}