import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type FileRef = { path: string; name: string; type: string };
type Body = {
  action?: string;
  loginId?: string;
  pin?: string;
  assignmentId?: string;
  answer?: string;
  files?: FileRef[];
  contentType?: string;
};

const bad = (status: string, code = 400) => NextResponse.json({ status }, { status: code });
const ALLOWED: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };
const MAX_FILES = 3;

export async function POST(request: Request) {
  let body: Body;
  try { body = await request.json(); } catch { return bad("invalid"); }
  const loginId = String(body.loginId ?? "").trim();
  const pin = String(body.pin ?? "").trim();
  if (!loginId || loginId.length > 50 || !/^\d{4}$/.test(pin)) return bad("invalid");

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return bad("error", 500);
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // Same student login check as the tests (active students only, 5 fails / 15 min lockout)
  const { data: auth, error: aerr } = await sb.rpc("cbt_login", { p_login: loginId, p_pin: pin });
  if (aerr) { console.error("cbt_login failed:", aerr.message); return bad("error", 500); }
  const me = auth?.[0];
  if (!me || me.o_status !== "ok") return NextResponse.json({ status: me?.o_status ?? "invalid" });
  const studentId: string = me.o_student_id;
  const classId: string = me.o_class_id;
  const now = Date.now();

  // ---------- list ----------
  if (!body.action || body.action === "login" || body.action === "list") {
    const { data: asgs } = await sb.from("assignments")
      .select("id, subject_id, title, instructions, max_score, due_at")
      .eq("class_id", classId).eq("is_published", true)
      .order("created_at", { ascending: false });
    const list = asgs ?? [];
    const ids = list.map((a) => a.id);
    const subjIds = [...new Set(list.map((a) => a.subject_id))];
    const { data: subjects } = subjIds.length
      ? await sb.from("subjects").select("id, name").in("id", subjIds)
      : { data: [] as { id: string; name: string }[] };
    const { data: subs } = ids.length
      ? await sb.from("assignment_submissions")
          .select("assignment_id, answer, files, submitted_at, score, comment")
          .eq("student_id", studentId).in("assignment_id", ids)
      : { data: [] };

    const items = list.map((a) => {
      const s = (subs ?? []).find((x) => x.assignment_id === a.id);
      const past = !!a.due_at && new Date(a.due_at).getTime() < now;
      let state = "open";
      if (s && s.score !== null && s.score !== undefined) state = "marked";
      else if (past) state = "closed";
      else if (s) state = "submitted";
      const marked = state === "marked";
      return {
        id: a.id,
        subject: (subjects ?? []).find((x) => x.id === a.subject_id)?.name ?? "",
        title: a.title,
        instructions: a.instructions,
        maxScore: a.max_score,
        dueAt: a.due_at,
        state,
        answer: s?.answer ?? null,
        files: ((s?.files ?? []) as FileRef[]).map((f) => ({ name: f.name, type: f.type })),
        submittedAt: s?.submitted_at ?? null,
        score: marked ? s?.score ?? null : null,
        comment: marked ? s?.comment ?? null : null,
      };
    });
    return NextResponse.json({ status: "ok", student: { name: me.o_name, className: me.o_class_name }, items });
  }

  // ---------- everything below needs a published assignment of this student's class ----------
  const aid = String(body.assignmentId ?? "");
  const { data: a } = await sb.from("assignments")
    .select("id, class_id, is_published, due_at").eq("id", aid).maybeSingle();
  if (!a || a.class_id !== classId || !a.is_published) return bad("not_allowed", 403);
  if (a.due_at && new Date(a.due_at).getTime() < now) return bad("closed", 409);

  const { data: existing } = await sb.from("assignment_submissions")
    .select("id, score, files").eq("assignment_id", aid).eq("student_id", studentId).maybeSingle();
  if (existing && existing.score !== null && existing.score !== undefined) return bad("already_marked", 409);

  // ---------- upload_url: a short-lived link so the browser can send ONE file straight to storage ----------
  if (body.action === "upload_url") {
    const type = String(body.contentType ?? "");
    const ext = ALLOWED[type];
    if (!ext) return bad("bad_type");
    const path = `${aid}/${studentId}/${now}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { data, error } = await sb.storage.from("assignments").createSignedUploadUrl(path);
    if (error || !data) { console.error("signed upload url failed:", error?.message); return bad("error", 500); }
    return NextResponse.json({ status: "ok", path, uploadUrl: data.signedUrl });
  }

  // ---------- submit ----------
  if (body.action === "submit") {
    const answer = String(body.answer ?? "").trim().slice(0, 10000);
    const sent = Array.isArray(body.files) ? body.files : [];
    if (sent.length > MAX_FILES) return bad("too_many");
    const files: FileRef[] = [];
    for (const f of sent) {
      const path = String(f?.path ?? "");
      const type = String(f?.type ?? "");
      // Only files uploaded by this student for this assignment
      if (!path.startsWith(`${aid}/${studentId}/`) || !ALLOWED[type]) return bad("invalid");
      files.push({ path, name: String(f?.name ?? "file").slice(0, 100), type });
    }
    const finalFiles = files.length ? files : ((existing?.files ?? []) as FileRef[]);
    if (!answer && !finalFiles.length) return bad("empty");

    const { error } = await sb.from("assignment_submissions").upsert(
      { assignment_id: aid, student_id: studentId, answer: answer || null, files: finalFiles, submitted_at: new Date(now).toISOString() },
      { onConflict: "assignment_id,student_id" }
    );
    if (error) { console.error("assignment submit failed:", error.message); return bad("error", 500); }
    return NextResponse.json({ status: "ok" });
  }

  return bad("invalid");
}