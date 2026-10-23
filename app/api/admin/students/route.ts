import { NextResponse } from "next/server";
import { adminClient } from "@/lib/admin";

function client(request: Request) {
  return adminClient(request);
}

export async function GET(request: Request) {
  const c = client(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const { data, error } = await c.supabase
    .from("classes")
    .select("id, name, id_prefix")
    .order("sort_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ classes: data });
}

export async function POST(request: Request) {
  const c = client(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const body = await request.json().catch(() => null);

  // Link a new ID to last session's ID
  if (body?.action === "link") {
    const loginId = String(body.loginId ?? "").trim();
    const prev = String(body.previousLoginId ?? "").trim() || null;
    if (!loginId) return NextResponse.json({ error: "Login ID required" }, { status: 400 });
    const { data, error } = await c.supabase
      .from("students")
      .update({ previous_login_id: prev })
      .eq("login_id", loginId)
      .select("login_id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.length) return NextResponse.json({ error: "Login ID not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  // List the students of one class
  if (body?.action === "list") {
    const { data, error } = await c.supabase
      .from("students")
      .select("id, login_id, name, is_active, previous_login_id")
      .eq("class_id", String(body.classId ?? ""))
      .order("login_id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ students: data ?? [] });
  }

  // Reset one student's PIN (returns the new PIN once)
  if (body?.action === "resetPin") {
    const loginId = String(body.loginId ?? "").trim();
    if (!loginId) return NextResponse.json({ error: "Login ID required" }, { status: 400 });
    const { data, error } = await c.supabase.rpc("admin_reset_pin", { p_login: loginId });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, pin: data });
  }

  // Activate or deactivate (never deletes anything)
  if (body?.action === "setActive") {
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "Student required" }, { status: 400 });
    const { error } = await c.supabase
      .from("students")
      .update({ is_active: !!body.value })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // Correct a student's name (also on already published results)
  if (body?.action === "rename") {
    const id = String(body.id ?? "");
    const name = String(body.name ?? "").trim().toUpperCase();
    if (!id || !name) return NextResponse.json({ error: "Name required" }, { status: 400 });
    const { data, error } = await c.supabase
      .from("students")
      .update({ name })
      .eq("id", id)
      .select("login_id");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const loginId = data?.[0]?.login_id;
    if (loginId) await c.supabase.from("student_results").update({ name }).eq("login_id", loginId);
    return NextResponse.json({ ok: true });
  }

  // Move a student to another class: new Login ID, same PIN, old ID linked
  if (body?.action === "moveClass") {
    const studentId = String(body.studentId ?? "");
    const toClassId = String(body.classId ?? "");
    if (!studentId || !toClassId)
      return NextResponse.json({ error: "Student and new class required" }, { status: 400 });
    const { data, error } = await c.supabase.rpc("admin_move_student", {
      p_student: studentId,
      p_class: toClassId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, loginId: data });
  }

  const classId = String(body?.classId ?? "");
  const names: string[] = Array.isArray(body?.names)
      ? body.names.map((n: unknown) => String(n).trim().toUpperCase()).filter(Boolean)
    : [];
  if (!classId || names.length === 0 || names.length > 100)
    return NextResponse.json({ error: "Choose a class and add 1-100 names" }, { status: 400 });

  const { data, error } = await c.supabase.rpc("admin_bulk_create_students", {
    p_class_id: classId,
    p_names: names,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    students: (data ?? []).map((r: { o_name: string; o_login_id: string; o_pin: string }) => ({
      name: r.o_name,
      loginId: r.o_login_id,
      pin: r.o_pin,
    })),
  });
}