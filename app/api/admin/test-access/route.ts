import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import { adminClient } from "@/lib/admin";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const makeCode = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

export async function GET(request: Request) {
  const a = adminClient(request);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  const { data: classes, error } = await a.sb.from("classes").select("id, name").order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { data: rows } = await a.sb.from("class_test_access").select("class_id, is_open, code, opened_at");
  const list = (classes ?? []).map((c) => {
    const r = (rows ?? []).find((x) => x.class_id === String(c.id));
    return { id: String(c.id), name: c.name, isOpen: !!r?.is_open, code: r?.is_open ? r.code : null, openedAt: r?.opened_at ?? null };
  });
  return NextResponse.json({ classes: list });
}

export async function POST(request: Request) {
  const a = adminClient(request);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  let body: { classId?: string; open?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid" }, { status: 400 }); }
  const classId = String(body.classId ?? "");
  if (!classId) return NextResponse.json({ error: "invalid" }, { status: 400 });
    const open = body.open === true;
  const row: { class_id: string; is_open: boolean; code: string | null; opened_at: string | null } = open
    ? { class_id: classId, is_open: true, code: makeCode(), opened_at: new Date().toISOString() }
    : { class_id: classId, is_open: false, code: null, opened_at: null };
  const { error } = await a.sb.from("class_test_access").upsert(row, { onConflict: "class_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, code: row.code });
}