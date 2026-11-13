import { NextResponse } from "next/server";
import { getTeacher, teacherDenied } from "@/lib/teacher";

const BUCKET = "teacher-avatars";
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const noStore = { "Cache-Control": "private, no-store" };

export async function GET() {
  const t = await getTeacher();
  if (t.status !== "ok") return teacherDenied(t.status);
  const { data, error } = await t.db.from("teacher_profile_photos").select("storage_path").eq("teacher_id", t.teacher.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load profile photo." }, { status: 500, headers: noStore });
  if (!data) return NextResponse.json({ url: null }, { headers: noStore });
  const signed = await t.db.storage.from(BUCKET).createSignedUrl(data.storage_path, 60 * 10);
  if (signed.error) return NextResponse.json({ error: "Could not load profile photo." }, { status: 500, headers: noStore });
  return NextResponse.json({ url: signed.data.signedUrl }, { headers: noStore });
}

export async function POST(request: Request) {
  const t = await getTeacher();
  if (t.status !== "ok") return teacherDenied(t.status);
  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image." }, { status: 400 });
  if (!TYPES[file.type] || !file.size || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Use a JPG, PNG or WebP image under 2 MB." }, { status: 400 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const valid = file.type === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    : file.type === "image/png" ? [137,80,78,71,13,10,26,10].every((b, i) => bytes[i] === b)
    : bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!valid) return NextResponse.json({ error: "This file is not a valid image." }, { status: 400 });
  const path = `${t.teacher.id}/${crypto.randomUUID()}.${TYPES[file.type]}`;
  const uploaded = await t.db.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploaded.error) return NextResponse.json({ error: "Could not upload photo. Check storage setup." }, { status: 500 });
  const previous = await t.db.from("teacher_profile_photos").select("storage_path").eq("teacher_id", t.teacher.id).maybeSingle();
  const saved = await t.db.from("teacher_profile_photos").upsert({ teacher_id: t.teacher.id, storage_path: path, updated_at: new Date().toISOString() }, { onConflict: "teacher_id" });
  if (saved.error) {
    await t.db.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: "Could not save photo. Apply the supplied SQL migration." }, { status: 500 });
  }
  if (previous.data?.storage_path) await t.db.storage.from(BUCKET).remove([previous.data.storage_path]);
  return NextResponse.json({ ok: true }, { headers: noStore });
}

export async function DELETE() {
  const t = await getTeacher();
  if (t.status !== "ok") return teacherDenied(t.status);
  const previous = await t.db.from("teacher_profile_photos").select("storage_path").eq("teacher_id", t.teacher.id).maybeSingle();
  if (previous.error) return NextResponse.json({ error: "Could not remove photo." }, { status: 500 });
  const deleted = await t.db.from("teacher_profile_photos").delete().eq("teacher_id", t.teacher.id);
  if (deleted.error) return NextResponse.json({ error: "Could not remove photo." }, { status: 500 });
  if (previous.data?.storage_path) await t.db.storage.from(BUCKET).remove([previous.data.storage_path]);
  return NextResponse.json({ ok: true }, { headers: noStore });
}
