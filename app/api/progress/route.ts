import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const bad = (status: string, code = 400) => NextResponse.json({ status }, { status: code });
const ORDER = ["First Term", "Second Term", "Third Term"];
type Sub = { subject?: string; ca?: number | null; exam?: number | null; total?: number | null };

const gradeOf = (n: number) => (n >= 70 ? "A" : n >= 60 ? "B" : n >= 50 ? "C" : n >= 45 ? "D" : n >= 40 ? "E" : "F");

export async function POST(request: Request) {
  let body: { loginId?: string; pin?: string };
  try { body = await request.json(); } catch { return bad("invalid"); }
  const loginId = String(body.loginId ?? "").trim();
  const pin = String(body.pin ?? "").trim();
  if (!loginId || loginId.length > 50 || !/^\d{4}$/.test(pin)) return bad("invalid");

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return bad("error", 500);
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // Same student check as the dashboard (active students only, lockout after repeated wrong PINs)
  const { data: auth, error: aerr } = await sb.rpc("cbt_login", { p_login: loginId, p_pin: pin });
  if (aerr) { console.error("cbt_login failed:", aerr.message); return bad("error", 500); }
  const me = auth?.[0];
  if (!me || me.o_status !== "ok") return NextResponse.json({ status: me?.o_status ?? "invalid" });
  const studentId: string = me.o_student_id;

  // Published results for this login ID and the linked previous one
  const ids = [loginId];
  const { data: stu } = await sb.from("students").select("previous_login_id").eq("login_id", loginId).maybeSingle();
  if (stu?.previous_login_id) ids.push(stu.previous_login_id);
  const { data: res } = await sb.from("student_results")
    .select("term, session, average, grade, subjects, created_at")
    .in("login_id", ids).order("created_at", { ascending: false });

  // One row per term and session (the newest), oldest term first
  const seen = new Set<string>();
  const rows = (res ?? []).filter((x) => {
    const k = `${x.session}|${x.term}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  rows.sort((a, b) => (a.session === b.session ? ORDER.indexOf(a.term) - ORDER.indexOf(b.term) : String(a.session).localeCompare(String(b.session))));

  const terms = rows.map((x) => ({
    term: x.term, session: x.session,
    average: x.average != null ? Number(x.average) : null,
    grade: x.grade ?? null,
  }));

  // Subjects of the latest term, strongest and weakest (published results only)
  let latest: null | {
    term: string; session: string;
    subjects: { subject: string; ca: number | null; exam: number | null; total: number; grade: string }[];
    strong: { subject: string; ca: number | null; exam: number | null; total: number; grade: string }[];
    weak: { subject: string; ca: number | null; exam: number | null; total: number; grade: string }[];
  } = null;
  const last = rows[rows.length - 1];
  if (last) {
    const list = ((last.subjects ?? []) as Sub[])
      .filter((s) => s.subject && s.total != null && Number.isFinite(Number(s.total)))
      .map((s) => ({
        subject: String(s.subject), ca: s.ca ?? null, exam: s.exam ?? null,
        total: Number(s.total), grade: gradeOf(Number(s.total)),
      }));
    const sorted = [...list].sort((a, b) => b.total - a.total);
    const k = Math.min(3, Math.floor(sorted.length / 2));
    latest = {
      term: last.term, session: last.session,
      subjects: list,
      strong: sorted.slice(0, k),
      weak: k > 0 ? sorted.slice(-k).reverse() : [],
    };
  }

  // Marked assignments, newest first
  const { data: subs } = await sb.from("assignment_submissions")
    .select("assignment_id, score, submitted_at")
    .eq("student_id", studentId).not("score", "is", null)
    .order("submitted_at", { ascending: false }).limit(20);
  const aids = (subs ?? []).map((s) => s.assignment_id);
  const { data: asgs } = aids.length
    ? await sb.from("assignments").select("id, title, subject_id, max_score").in("id", aids)
    : { data: [] as { id: string; title: string; subject_id: string; max_score: number }[] };
  const sids = [...new Set((asgs ?? []).map((a) => a.subject_id))];
  const { data: subjects } = sids.length
    ? await sb.from("subjects").select("id, name").in("id", sids)
    : { data: [] as { id: string; name: string }[] };
  const assignments = (subs ?? []).flatMap((s) => {
    const a = (asgs ?? []).find((x) => x.id === s.assignment_id);
    if (!a) return [];
    return [{
      subject: (subjects ?? []).find((x) => x.id === a.subject_id)?.name ?? "",
      title: a.title, score: Number(s.score), max: Number(a.max_score),
    }];
  });

  return NextResponse.json({ status: "ok", terms, latest, assignments });
}