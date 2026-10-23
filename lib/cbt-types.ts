export type OptionKey = "A" | "B" | "C" | "D";
export const OPTION_KEYS: OptionKey[] = ["A", "B", "C", "D"];

export type Exam = {
  id: string;
  title: string;
  subject: string;
  class_name: string | null;
  term: string | null;
  session: string | null;
  duration_minutes: number;
  instructions: string | null;
  shuffle_questions: boolean;
  show_score: boolean;
  is_published: boolean;
  created_at: string;
};

export type Question = {
  id: string;
  exam_id: string;
  position: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string | null;
  option_d: string | null;
  correct_option: OptionKey;
  marks: number;
};

export type Attempt = {
  id: string;
  exam_id: string;
  login_id: string;
  student_name: string;
  class_name: string | null;
  started_at: string;
  expires_at: string;
  submitted_at: string | null;
  question_order: string[];
  answers: Record<string, string>;
  score: number | null;
  total_marks: number | null;
  status: "in_progress" | "submitted";
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
