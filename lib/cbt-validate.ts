import { OPTION_KEYS, type OptionKey } from "./cbt-types";

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({
  ok: false,
  error,
});

function text(fd: FormData, key: string, max: number): string {
  return String(fd.get(key) ?? "")
    .trim()
    .slice(0, max);
}

/* ------------------------------ Exams ------------------------------ */

export type ExamInput = {
  title: string;
  subject: string;
  class_name: string | null;
  term: string | null;
  session: string | null;
  duration_minutes: number;
  instructions: string | null;
  shuffle_questions: boolean;
  show_score: boolean;
};

export function parseExamForm(fd: FormData): Parsed<ExamInput> {
  const title = text(fd, "title", 150);
  const subject = text(fd, "subject", 100);
  const duration = Number.parseInt(text(fd, "duration_minutes", 4), 10);

  if (!title) return fail("Please enter an exam title.");
  if (!subject) return fail("Please enter the subject.");
  if (!Number.isInteger(duration) || duration < 1 || duration > 600) {
    return fail("Duration must be between 1 and 600 minutes.");
  }

  return {
    ok: true,
    value: {
      title,
      subject,
      class_name: text(fd, "class_name", 50) || null,
      term: text(fd, "term", 50) || null,
      session: text(fd, "session", 20) || null,
      duration_minutes: duration,
      instructions: text(fd, "instructions", 3000) || null,
      shuffle_questions: fd.get("shuffle_questions") === "on",
      show_score: fd.get("show_score") === "on",
    },
  };
}

/* ---------------------------- Questions ---------------------------- */

export type QuestionInput = {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string | null;
  option_d: string | null;
  correct_option: OptionKey;
  marks: number;
};

function buildQuestion(
  question: string,
  options: string[],
  answer: string,
  marks: number
): Parsed<QuestionInput> {
  if (!question) return fail("The question text is empty.");
  if (options.length < 2) return fail("A question needs at least options A and B.");
  if (options.some((o) => !o)) {
    return fail("Fill options in order (A, B, then C, then D) without gaps.");
  }

  const key = answer.toUpperCase() as OptionKey;
  if (!OPTION_KEYS.slice(0, options.length).includes(key)) {
    return fail(`The correct answer must be one of: ${OPTION_KEYS.slice(0, options.length).join(", ")}.`);
  }

  return {
    ok: true,
    value: {
      question_text: question,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2] ?? null,
      option_d: options[3] ?? null,
      correct_option: key,
      marks,
    },
  };
}

export function parseQuestionForm(fd: FormData): Parsed<QuestionInput> {
  const marks = Number.parseInt(text(fd, "marks", 3) || "1", 10);
  if (!Number.isInteger(marks) || marks < 1 || marks > 100) {
    return fail("Marks must be a whole number from 1 to 100.");
  }

  // Trim trailing empty options (C / D are optional), keep gaps so we can flag them.
  const raw = [
    text(fd, "option_a", 300),
    text(fd, "option_b", 300),
    text(fd, "option_c", 300),
    text(fd, "option_d", 300),
  ];
  while (raw.length > 2 && raw[raw.length - 1] === "") raw.pop();

  return buildQuestion(
    text(fd, "question_text", 1500),
    raw,
    text(fd, "correct_option", 1),
    marks
  );
}

/**
 * Bulk format - one question per line, fields separated by "|":
 *   Question | Option A | Option B | Option C | Option D | Answer letter
 * Options C and D are optional (e.g. True/False questions).
 */
export function parseBulk(
  input: string
): { ok: true; questions: QuestionInput[] } | { ok: false; error: string } {
  const lines = input
    .split(/\r?\n/)
    .map((l, i) => ({ line: l.trim(), number: i + 1 }))
    .filter((l) => l.line.length > 0);

  if (lines.length === 0) return fail("Paste at least one question.");
  if (lines.length > 200) return fail("Please add at most 200 questions at a time.");

  const questions: QuestionInput[] = [];

  for (const { line, number } of lines) {
    const parts = line.split("|").map((p) => p.trim());
    if (parts.length < 4 || parts.length > 6) {
      return fail(
        `Line ${number}: expected Question | A | B | [C] | [D] | Answer (found ${parts.length} parts).`
      );
    }

    const result = buildQuestion(
      parts[0].slice(0, 1500),
      parts.slice(1, -1).map((p) => p.slice(0, 300)),
      parts[parts.length - 1],
      1
    );
    if (!result.ok) return fail(`Line ${number}: ${result.error}`);
    questions.push(result.value);
  }

  return { ok: true, questions };
}
