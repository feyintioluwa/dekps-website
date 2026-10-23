import { NextResponse } from "next/server";
import { readDB, writeDB, gradeFor, newId, type Question } from "@/lib/cbt/db";
import { isAdmin, unauthorized } from "@/lib/cbt/admin";

// GET: fetch everything (admin only)
export async function GET(request: Request) {
  if (!isAdmin(request)) return unauthorized();
  const db = await readDB();
  return NextResponse.json({ status: "ok", db });
}

// POST: mutate based on action (admin only)
export async function POST(request: Request) {
  if (!isAdmin(request)) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const db = await readDB();

  switch (action) {
    case "saveExam": {
      const exam = body.exam as Record<string, unknown> | undefined;
      if (!exam || typeof exam.id !== "string") {
        return NextResponse.json({ status: "invalid" }, { status: 400 });
      }
      const idx = db.exams.findIndex((e) => e.id === exam.id);
      const normalized = {
        id: exam.id,
        title: String(exam.title ?? "Untitled Exam"),
        session: String(exam.session ?? ""),
        term: String(exam.term ?? ""),
        durationMinutes: Number(exam.durationMinutes ?? 30),
        published: Boolean(exam.published),
        questions: Array.isArray(exam.questions)
          ? (exam.questions as Question[])
          : [],
      };
      if (idx >= 0) db.exams[idx] = normalized;
      else db.exams.push(normalized);
      break;
    }

    case "deleteExam": {
      const id = String(body.id ?? "");
      db.exams = db.exams.filter((e) => e.id !== id);
      break;
    }

    case "addStudent": {
      const s = body.student as Record<string, unknown> | undefined;
      if (!s) return NextResponse.json({ status: "invalid" }, { status: 400 });
      db.students.push({
        id: String(s.id ?? "").trim(),
        name: String(s.name ?? "").trim(),
        className: String(s.className ?? "").trim(),
        token: String(s.token ?? "").trim() || `CBT-${Math.floor(1000 + Math.random() * 9000)}`,
      });
      break;
    }

    case "deleteStudent": {
      const id = String(body.id ?? "");
      db.students = db.students.filter((s) => s.id !== id);
      break;
    }

    case "deleteSubmission": {
      const id = String(body.id ?? "");
      db.submissions = db.submissions.filter((s) => s.id !== id);
      break;
    }

    default:
      return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  await writeDB(db);
  return NextResponse.json({ status: "ok", db });
}
