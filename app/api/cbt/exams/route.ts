import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import { classMatches, readJson, verifyStudent } from "@/lib/cbt-server";

type ExamRow = {
  id: string;
  title: string;
  subject: string;
  class_name: string | null;
  duration_minutes: number;
  instructions: string | null;
  show_score: boolean;
  cbt_questions: { count: number }[];
};

export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body) return NextResponse.json({ status: "invalid" }, { status: 400 });

  let db;
  try {
    db = getServiceClient();
  } catch {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }

  const verified = await verifyStudent(db, body.loginId, body.pin);
  if (verified.status !== "ok") {
    const code = verified.status === "error" ? 500 : verified.status === "locked" ? 429 : 401;
    return NextResponse.json({ status: verified.status }, { status: code });
  }
  const { student } = verified;

  const [examsRes, attemptsRes] = await Promise.all([
    db
      .from("cbt_exams")
      .select(
        "id, title, subject, class_name, duration_minutes, instructions, show_score, cbt_questions(count)"
      )
      .eq("is_published", true)
      .order("created_at", { ascending: false }),
    db
      .from("cbt_attempts")
      .select("exam_id, status, score, total_marks")
      .eq("login_id", student.loginId),
  ]);

  if (examsRes.error || attemptsRes.error) {
    console.error("cbt exams failed:", examsRes.error?.message, attemptsRes.error?.message);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }

  const attempts = new Map(
    ((attemptsRes.data ?? []) as {
      exam_id: string;
      status: string;
      score: number | null;
      total_marks: number | null;
    }[]).map((a) => [a.exam_id, a])
  );

  const exams = ((examsRes.data ?? []) as unknown as ExamRow[])
    .filter((e) => classMatches(e.class_name, student.className))
    .map((e) => {
      const attempt = attempts.get(e.id);
      const submitted = attempt?.status === "submitted";
      return {
        id: e.id,
        title: e.title,
        subject: e.subject,
        duration: e.duration_minutes,
        instructions: e.instructions,
        questionCount: e.cbt_questions?.[0]?.count ?? 0,
        status: submitted ? "submitted" : attempt ? "in_progress" : "not_started",
        showScore: e.show_score,
        score: submitted && e.show_score ? attempt?.score ?? null : null,
        total: submitted && e.show_score ? attempt?.total_marks ?? null : null,
      };
    })
    .filter((e) => e.questionCount > 0);

  return NextResponse.json({ status: "ok", student, exams });
}
