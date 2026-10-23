import type { getServiceClient } from "@/lib/supabase/service";
import { OPTION_KEYS, isUuid, type Attempt } from "@/lib/cbt-types";

type Db = ReturnType<typeof getServiceClient>;

/** Extra seconds allowed after the timer ends, to cover slow networks. */
export const GRACE_MS = 30_000;

export type VerifiedStudent = {
  loginId: string;
  name: string;
  className: string;
};

export type VerifyResult =
  | { status: "ok"; student: VerifiedStudent }
  | { status: "invalid" | "locked" | "error" };

/**
 * Students sign in to the CBT with the same Login ID + 4-digit PIN they use
 * for the result portal. We reuse the existing `get_result` RPC, so the
 * brute-force lockout that already protects results protects the CBT too.
 */
export async function verifyStudent(
  db: Db,
  loginIdRaw: unknown,
  pinRaw: unknown
): Promise<VerifyResult> {
  const loginId = String(loginIdRaw ?? "").trim();
  const pin = String(pinRaw ?? "").trim();

  if (!loginId || loginId.length > 50 || !/^\d{4}$/.test(pin)) {
    return { status: "invalid" };
  }

  const { data, error } = await db.rpc("get_result", {
    p_login_id: loginId,
    p_pin: pin,
  });

  if (error) {
    console.error("get_result failed:", error.message);
    return { status: "error" };
  }

  const result = data as {
    status?: string;
    student?: { login_id?: string; name?: string; class?: string };
  } | null;

  if (result?.status === "locked") return { status: "locked" };
  if (result?.status !== "ok" || !result.student) return { status: "invalid" };

  return {
    status: "ok",
    student: {
      loginId: String(result.student.login_id ?? loginId),
      name: String(result.student.name ?? ""),
      className: String(result.student.class ?? ""),
    },
  };
}

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/** An exam with no class set is open to everyone. */
export function classMatches(examClass: string | null, studentClass: string) {
  const wanted = norm(examClass);
  return wanted === "" || wanted === norm(studentClass);
}

export function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Keep only answers for questions that are really in this attempt. */
export function cleanAnswers(
  raw: unknown,
  allowedIds: string[]
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;

  const allowed = new Set(allowedIds);
  for (const [qid, value] of Object.entries(raw as Record<string, unknown>)) {
    if (
      allowed.has(qid) &&
      typeof value === "string" &&
      (OPTION_KEYS as string[]).includes(value)
    ) {
      out[qid] = value;
    }
  }
  return out;
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function validAttemptId(value: unknown): string | null {
  return isUuid(value) ? value : null;
}

/** Scores the answers, saves the result and locks the attempt. Safe to call twice. */
export async function finalizeAttempt(
  db: Db,
  attempt: Pick<Attempt, "id" | "exam_id" | "question_order">,
  answers: Record<string, string>
): Promise<{ score: number; total: number }> {
  const { data } = await db
    .from("cbt_questions")
    .select("id, correct_option, marks")
    .eq("exam_id", attempt.exam_id);

  const questions = (data ?? []) as {
    id: string;
    correct_option: string;
    marks: number;
  }[];

  let score = 0;
  let total = 0;
  for (const q of questions) {
    total += q.marks;
    if (answers[q.id] === q.correct_option) score += q.marks;
  }

  const { data: updated } = await db
    .from("cbt_attempts")
    .update({
      answers,
      score,
      total_marks: total,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", attempt.id)
    .eq("status", "in_progress")
    .select("id");

  // Another request already submitted it - return the stored result instead.
  if (!updated || updated.length === 0) {
    const { data: existingData } = await db
      .from("cbt_attempts")
      .select("score, total_marks")
      .eq("id", attempt.id)
      .single();
    const existing = existingData as { score: number | null; total_marks: number | null } | null;
    return { score: existing?.score ?? 0, total: existing?.total_marks ?? total };
  }

  return { score, total };
}
