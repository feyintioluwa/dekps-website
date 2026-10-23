import { promises as fs } from "fs";
import path from "path";

export type Question = {
  id: string;
  subject: string;
  text: string;
  choices: { id: string; text: string }[]; // a, b, c, d
  answer: string; // correct choice id
  marks: number;
};

export type Exam = {
  id: string;
  title: string;
  session: string;
  term: string;
  durationMinutes: number;
  published: boolean;
  questions: Question[];
};

export type Student = {
  id: string; // exam number e.g. DKPS/001
  name: string;
  className: string;
  token: string; // CBT access token e.g. CBT-1001
};

export type Submission = {
  id: string;
  examId: string;
  examTitle: string;
  studentId: string;
  studentName: string;
  className: string;
  submittedAt: string;
  score: number;
  totalMarks: number;
  percentage: number;
  grade: string;
  answers: Record<string, string>;
};

export type DB = {
  exams: Exam[];
  students: Student[];
  submissions: Submission[];
};

const DB_PATH =
  process.env.CBT_DB_PATH ||
  path.join(process.cwd(), "data", "cbt-db.json");

function seedDB(): DB {
  return {
    exams: [
      {
        id: "exam-001",
        title: "First Term General Paper",
        session: "2026/2027",
        term: "First Term",
        durationMinutes: 15,
        published: true,
        questions: [
          {
            id: "q-001",
            subject: "Mathematics",
            text: "What is 15% of 200?",
            choices: [
              { id: "a", text: "15" },
              { id: "b", text: "20" },
              { id: "c", text: "30" },
              { id: "d", text: "40" },
            ],
            answer: "c",
            marks: 1,
          },
          {
            id: "q-002",
            subject: "English Studies",
            text: "Which of these words is correctly spelt?",
            choices: [
              { id: "a", text: "Recieve" },
              { id: "b", text: "Receive" },
              { id: "c", text: "Receeve" },
              { id: "d", text: "Riceive" },
            ],
            answer: "b",
            marks: 1,
          },
          {
            id: "q-003",
            subject: "Basic Science",
            text: "Which planet is known as the Red Planet?",
            choices: [
              { id: "a", text: "Venus" },
              { id: "b", text: "Mars" },
              { id: "c", text: "Jupiter" },
              { id: "d", text: "Saturn" },
            ],
            answer: "b",
            marks: 1,
          },
          {
            id: "q-004",
            subject: "Social Studies",
            text: "What is the capital of Ogun State?",
            choices: [
              { id: "a", text: "Lagos" },
              { id: "b", text: "Ikeja" },
              { id: "c", text: "Abeokuta" },
              { id: "d", text: "Ibadan" },
            ],
            answer: "c",
            marks: 1,
          },
          {
            id: "q-005",
            subject: "Mathematics",
            text: "Simplify: 2³ × 2²",
            choices: [
              { id: "a", text: "2⁵" },
              { id: "b", text: "2⁶" },
              { id: "c", text: "4⁵" },
              { id: "d", text: "2⁹" },
            ],
            answer: "a",
            marks: 1,
          },
        ],
      },
    ],
    students: [
      { id: "DKPS/001", name: "Ade Okafor", className: "Primary 5", token: "CBT-1001" },
      { id: "DKPS/002", name: "Bola Adeniyi", className: "Primary 5", token: "CBT-1002" },
      { id: "DKPS/003", name: "Chidi Nwosu", className: "Primary 5", token: "CBT-1003" },
    ],
    submissions: [],
  };
}

export async function readDB(): Promise<DB> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf-8");
    return JSON.parse(raw) as DB;
  } catch {
    const seeded = seedDB();
    await writeDB(seeded);
    return seeded;
  }
}

export async function writeDB(db: DB): Promise<void> {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

export function gradeFor(percentage: number): string {
  if (percentage >= 70) return "A";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  if (percentage >= 45) return "D";
  if (percentage >= 40) return "E";
  return "F";
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}
