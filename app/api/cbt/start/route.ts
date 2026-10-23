import { NextResponse } from "next/server";
import { readDB } from "@/lib/cbt/db";

export async function POST(request: Request) {
  let body: { token?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  const token = String(body.token ?? "").trim().toUpperCase();
  if (!token) {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  const db = await readDB();
  const student = db.students.find((s) => s.token.toUpperCase() === token);

  if (!student) {
    return NextResponse.json({ status: "notfound" });
  }

  const exam = db.exams.find((e) => e.published);
  if (!exam || exam.questions.length === 0) {
    return NextResponse.json({ status: "noexam" });
  }

  const already = db.submissions.find(
    (s) => s.studentId === student.id && s.examId === exam.id
  );
  if (already) {
    return NextResponse.json({ status: "already", submission: already });
  }

  // Never send correct answers to the client.
  const questions = exam.questions.map((q) => ({
    id: q.id,
    subject: q.subject,
    text: q.text,
    choices: q.choices,
    marks: q.marks,
  }));

  return NextResponse.json({
    status: "ok",
    student: { id: student.id, name: student.name, className: student.className },
    exam: {
      id: exam.id,
      title: exam.title,
      session: exam.session,
      term: exam.term,
      durationMinutes: exam.durationMinutes,
      questionCount: questions.length,
    },
    questions,
  });
}
