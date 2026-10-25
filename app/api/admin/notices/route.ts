import { NextResponse } from "next/server";
import { adminClient } from "@/lib/admin";

export async function GET(request: Request) {
  const c = adminClient(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const { sb } = c;
  const [n, cl] = await Promise.all([
    sb.from("notices").select("id, title, body, class_id, hide_after, created_at").order("created_at", { ascending: false }),
    sb.from("classes").select("id, name").order("sort_order"),
  ]);
  if (n.error) return NextResponse.json({ error: n.error.message }, { status: 500 });
  const now = Date.now();
  const notices = (n.data ?? []).map((x) => ({ ...x, expired: !!x.hide_after && new Date(x.hide_after).getTime() < now }));
  return NextResponse.json({ notices, classes: cl.data ?? [] });
}

export async function POST(request: Request) {
  const c = adminClient(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const { sb } = c;
  const b = await request.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const fail = (m: string, s = 500) => NextResponse.json({ error: m }, { status: s });

  if (b.action === "add") {
    const title = String(b.title ?? "").trim();
    const body = String(b.body ?? "").trim();
    if (!title || title.length > 120) return fail("Write a title of up to 120 characters", 400);
    if (!body || body.length > 2000) return fail("Write a message of up to 2000 characters", 400);

    let classId: string | null = null;
    if (b.classId && b.classId !== "all") {
      const { data: cls } = await sb.from("classes").select("id").eq("id", String(b.classId)).maybeSingle();
      if (!cls) return fail("That class was not found", 400);
      classId = cls.id;
    }

    let hideAfter: string | null = null;
    if (b.hideAfter) {
      const d = String(b.hideAfter);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return fail("Use a valid hide date", 400);
      hideAfter = new Date(`${d}T23:59:59+01:00`).toISOString(); // end of that day, Nigerian time
    }

    const { error } = await sb.from("notices").insert({ title, body, class_id: classId, hide_after: hideAfter });
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
  }

  if (b.action === "delete") {
    if (!b.id) return fail("Missing notice", 400);
    const { error } = await sb.from("notices").delete().eq("id", String(b.id));
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
  }

  return fail("Unknown action", 400);
}