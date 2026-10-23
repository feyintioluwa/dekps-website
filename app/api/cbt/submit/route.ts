import { NextResponse } from "next/server";
import { readDB, writeDB, gradeFor, newId } from "@/lib/cbt/db";

export async function POST(request: Request) {
  let body: {
    token?: unknown;
    examId?: unknown;
    answers?: unknown;
    autoSubmitted?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  const token = String(body.token ?? "").trim().toUpperCase();
  const examId = String(body.examId ?? "").trim();
  const answers = (body.answers ?? {}) as Record<string, string>;
  const autoSubmitted = Boolean(body.autoSubmitted);

  if (!token || !examId) {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  const db = await readDB();
  const student = db.students.find((s) => s.token.toUpperCase() === token);
  const exam = db.exams.find((e) => e.id === examId && e.published);

  if (!student || !exam) {
    return NextResponse.json({ status: "notfound" }, { status: 404 });
  }

  if (db.submissions.some((s) => s.studentId === student.id && s.examId === exam.id)) {
    return NextResponse.json({ status: "already" });
  }

  let score = 0;
  let totalMarks = 0;
  for (const q of exam.questions) {
    totalMarks += q.marks;
    const given = answers[q.id];
    if (given && String(given).toLowerCase() === q.answer.toLowerCase()) {
      score += q.marks;
    }
  }

  const percentage =
    totalMarks > 0 ? Math.round((score / totalMarks) * 10000) / 100 : 0;

  const submission = {
    id: newId("sub"),
    examId: exam.id,
    examTitle: exam.title,
    studentId: student.id,
    studentName: student.name,
    className: student.className,
    submittedAt: new Date().toISOString(),
    autoSubmitted,
    score,
    totalMarks,
    percentage,
    grade: gradeFor(percentage),
    published: false,
    answers,
  };

  db.submissions.push(submission);
  await writeDB(db);

  return NextResponse.json({ status: "ok", submission });
}
