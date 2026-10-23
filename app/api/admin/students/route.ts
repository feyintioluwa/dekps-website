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

  const classId = String(body?.classId ?? "");
  const names: string[] = Array.isArray(body?.names)
    ? body.names.map((n: unknown) => String(n).trim()).filter(Boolean)
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
