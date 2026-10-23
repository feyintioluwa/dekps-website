"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { isUuid } from "@/lib/cbt-types";
import { parseBulk, parseExamForm, parseQuestionForm } from "@/lib/cbt-validate";

// NOTE: server actions are public endpoints. Every action below calls
// requireAdmin() first - do not remove it.

function go(path: string, kind: "ok" | "error", message: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}

function refresh(examId?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/exams");
  if (examId) {
    revalidatePath(`/admin/exams/${examId}`);
    revalidatePath(`/admin/exams/${examId}/results`);
  }
}

/* ------------------------------- exams ------------------------------- */

export async function createExam(formData: FormData): Promise<void> {
  const { db, user } = await requireAdmin();

  const parsed = parseExamForm(formData);
  if (!parsed.ok) go("/admin/exams/new", "error", parsed.error);

  const { data, error } = await db
    .from("cbt_exams")
    .insert({ ...parsed.value, created_by: user.id })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createExam failed:", error?.message);
    go(
      "/admin/exams/new",
      "error",
      "Could not create the exam. Make sure supabase/cbt_schema.sql has been run."
    );
  }

  refresh();
  go(`/admin/exams/${data.id}`, "ok", "Exam created. Now add the questions.");
}

export async function updateExam(examId: string, formData: FormData): Promise<void> {
  const { db } = await requireAdmin();
  if (!isUuid(examId)) go("/admin/exams", "error", "Exam not found.");

  const path = `/admin/exams/${examId}`;
  const parsed = parseExamForm(formData);
  if (!parsed.ok) go(path, "error", parsed.error);

  const { error } = await db
    .from("cbt_exams")
    .update({ ...parsed.value, updated_at: new Date().toISOString() })
    .eq("id", examId);

  if (error) {
    console.error("updateExam failed:", error.message);
    go(path, "error", "Could not save the changes.");
  }

  refresh(examId);
  go(path, "ok", "Exam settings saved.");
}

export async function setPublished(examId: string, publish: boolean): Promise<void> {
  const { db } = await requireAdmin();
  if (!isUuid(examId)) go("/admin/exams", "error", "Exam not found.");

  const path = `/admin/exams/${examId}`;

  if (publish) {
    const { count } = await db
      .from("cbt_questions")
      .select("id", { count: "exact", head: true })
      .eq("exam_id", examId);
    if (!count) go(path, "error", "Add at least one question before publishing.");
  }

  const { error } = await db
    .from("cbt_exams")
    .update({ is_published: publish, updated_at: new Date().toISOString() })
    .eq("id", examId);

  if (error) {
    console.error("setPublished failed:", error.message);
    go(path, "error", "Could not update the exam.");
  }

  refresh(examId);
  go(
    path,
    "ok",
    publish ? "Exam published. Students in the class can now see it." : "Exam unpublished. Students can no longer see it."
  );
}

export async function deleteExam(examId: string): Promise<void> {
  const { db } = await requireAdmin();
  if (!isUuid(examId)) go("/admin/exams", "error", "Exam not found.");

  const { error } = await db.from("cbt_exams").delete().eq("id", examId);
  if (error) {
    console.error("deleteExam failed:", error.message);
    go(`/admin/exams/${examId}`, "error", "Could not delete the exam.");
  }

  refresh();
  go("/admin/exams", "ok", "Exam deleted.");
}

/* ----------------------------- questions ----------------------------- */

async function nextPosition(
  db: Awaited<ReturnType<typeof requireAdmin>>["db"],
  examId: string
): Promise<number> {
  const { data } = await db
    .from("cbt_questions")
    .select("position")
    .eq("exam_id", examId)
    .order("position", { ascending: false })
    .limit(1);
  const last = (data?.[0] as { position?: number } | undefined)?.position ?? 0;
  return last + 1;
}

export async function addQuestion(examId: string, formData: FormData): Promise<void> {
  const { db } = await requireAdmin();
  if (!isUuid(examId)) go("/admin/exams", "error", "Exam not found.");

  const path = `/admin/exams/${examId}`;
  const parsed = parseQuestionForm(formData);
  if (!parsed.ok) go(path, "error", parsed.error);

  const { error } = await db.from("cbt_questions").insert({
    ...parsed.value,
    exam_id: examId,
    position: await nextPosition(db, examId),
  });

  if (error) {
    console.error("addQuestion failed:", error.message);
    go(path, "error", "Could not add the question.");
  }

  refresh(examId);
  go(path, "ok", "Question added.");
}

export async function bulkAddQuestions(examId: string, formData: FormData): Promise<void> {
  const { db } = await requireAdmin();
  if (!isUuid(examId)) go("/admin/exams", "error", "Exam not found.");

  const path = `/admin/exams/${examId}`;
  const parsed = parseBulk(String(formData.get("bulk") ?? ""));
  if (!parsed.ok) go(path, "error", parsed.error);

  const start = await nextPosition(db, examId);
  const rows = parsed.questions.map((q, i) => ({
    ...q,
    exam_id: examId,
    position: start + i,
  }));

  const { error } = await db.from("cbt_questions").insert(rows);
  if (error) {
    console.error("bulkAddQuestions failed:", error.message);
    go(path, "error", "Could not add the questions. Nothing was saved.");
  }

  refresh(examId);
  go(path, "ok", `${rows.length} question${rows.length === 1 ? "" : "s"} added.`);
}

export async function updateQuestion(
  examId: string,
  questionId: string,
  formData: FormData
): Promise<void> {
  const { db } = await requireAdmin();
  if (!isUuid(examId) || !isUuid(questionId)) go("/admin/exams", "error", "Question not found.");

  const path = `/admin/exams/${examId}`;
  const parsed = parseQuestionForm(formData);
  if (!parsed.ok) go(path, "error", parsed.error);

  const { error } = await db
    .from("cbt_questions")
    .update(parsed.value)
    .eq("id", questionId)
    .eq("exam_id", examId);

  if (error) {
    console.error("updateQuestion failed:", error.message);
    go(path, "error", "Could not save the question.");
  }

  refresh(examId);
  go(path, "ok", "Question updated.");
}

export async function deleteQuestion(examId: string, questionId: string): Promise<void> {
  const { db } = await requireAdmin();
  if (!isUuid(examId) || !isUuid(questionId)) go("/admin/exams", "error", "Question not found.");

  const path = `/admin/exams/${examId}`;
  const { error } = await db
    .from("cbt_questions")
    .delete()
    .eq("id", questionId)
    .eq("exam_id", examId);

  if (error) {
    console.error("deleteQuestion failed:", error.message);
    go(path, "error", "Could not delete the question.");
  }

  refresh(examId);
  go(path, "ok", "Question deleted.");
}

/* ------------------------------ attempts ------------------------------ */

/** Removes a student's attempt so they can take the exam again. */
export async function resetAttempt(examId: string, attemptId: string): Promise<void> {
  const { db } = await requireAdmin();
  if (!isUuid(examId) || !isUuid(attemptId)) go("/admin/exams", "error", "Attempt not found.");

  const path = `/admin/exams/${examId}/results`;
  const { error } = await db
    .from("cbt_attempts")
    .delete()
    .eq("id", attemptId)
    .eq("exam_id", examId);

  if (error) {
    console.error("resetAttempt failed:", error.message);
    go(path, "error", "Could not reset the attempt.");
  }

  refresh(examId);
  go(path, "ok", "Attempt removed. The student can take the exam again.");
}
