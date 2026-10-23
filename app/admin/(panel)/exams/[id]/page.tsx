import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServiceClient } from "@/lib/supabase/service";
import { isUuid, type Exam, type Question } from "@/lib/cbt-types";
import Flash from "../../Flash";
import ExamFields from "../ExamFields";
import QuestionFields from "../QuestionFields";
import {
  addQuestion,
  bulkAddQuestions,
  deleteExam,
  deleteQuestion,
  setPublished,
  updateExam,
  updateQuestion,
} from "../actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
};

async function ExamDetail({ params, searchParams }: Props) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  if (!isUuid(id)) notFound();

  const db = getServiceClient();
  const [examRes, questionsRes, attemptsRes] = await Promise.all([
    db.from("cbt_exams").select("*").eq("id", id).maybeSingle(),
    db.from("cbt_questions").select("*").eq("exam_id", id).order("position", { ascending: true }),
    db.from("cbt_attempts").select("id", { count: "exact", head: true }).eq("exam_id", id),
  ]);

  const exam = examRes.data as Exam | null;
  if (!exam) notFound();

  const questions = (questionsRes.data ?? []) as Question[];
  const totalMarks = questions.reduce((sum, q) => sum + q.marks, 0);
  const attemptCount = attemptsRes.count ?? 0;

  return (
    <>
      <div className="adm-page-head">
        <div>
          <Link className="adm-back" href="/admin/exams">
            ← All exams
          </Link>
          <h1>
            {exam.title}{" "}
            <span className={`adm-badge ${exam.is_published ? "live" : "draft"}`}>
              {exam.is_published ? "Published" : "Draft"}
            </span>
          </h1>
          <p className="adm-muted">
            {exam.subject} · {exam.class_name || "All classes"}
            {exam.term ? ` · ${exam.term}` : ""}
            {exam.session ? ` · ${exam.session}` : ""}
          </p>
        </div>

        <div className="adm-head-actions">
          <Link className="adm-btn adm-btn-light" href={`/admin/exams/${exam.id}/results`}>
            Results ({attemptCount})
          </Link>
          <form action={setPublished.bind(null, exam.id, !exam.is_published)}>
            <button className={`adm-btn${exam.is_published ? " adm-btn-warn" : ""}`} type="submit">
              {exam.is_published ? "Unpublish" : "Publish exam"}
            </button>
          </form>
        </div>
      </div>

      <Flash ok={ok} error={error} />

      <div className="adm-stats">
        <div className="adm-stat">
          <span>Questions</span>
          <strong>{questions.length}</strong>
        </div>
        <div className="adm-stat">
          <span>Total marks</span>
          <strong>{totalMarks}</strong>
        </div>
        <div className="adm-stat">
          <span>Duration</span>
          <strong>{exam.duration_minutes} min</strong>
        </div>
        <div className="adm-stat">
          <span>Attempts</span>
          <strong>{attemptCount}</strong>
        </div>
      </div>

      {attemptCount > 0 && (
        <div className="adm-flash warn">
          {attemptCount} student{attemptCount === 1 ? " has" : "s have"} already started this
          exam. Changing correct answers or marks now will change how new submissions are
          scored, so avoid editing live questions.
        </div>
      )}

      <section className="adm-card">
        <h2>Questions ({questions.length})</h2>

        {questions.length === 0 ? (
          <p className="adm-muted">No questions yet. Add one below, or paste many at once.</p>
        ) : (
          <div className="adm-q-list">
            {questions.map((q, i) => (
              <details className="adm-q" key={q.id}>
                <summary>
                  <span className="adm-q-num">{i + 1}</span>
                  <span className="adm-q-text">{q.question_text}</span>
                  <span className="adm-q-meta">
                    Ans {q.correct_option} · {q.marks} {q.marks === 1 ? "mark" : "marks"}
                  </span>
                </summary>

                <form action={updateQuestion.bind(null, exam.id, q.id)}>
                  <QuestionFields q={q} />
                  <div className="adm-form-actions">
                    <button className="adm-btn" type="submit">
                      Save question
                    </button>
                  </div>
                </form>

                <form action={deleteQuestion.bind(null, exam.id, q.id)} className="adm-inline-form">
                  <button className="adm-btn adm-btn-danger" type="submit">
                    Delete question
                  </button>
                </form>
              </details>
            ))}
          </div>
        )}
      </section>

      <section className="adm-card">
        <h2>Add a question</h2>
        <form action={addQuestion.bind(null, exam.id)}>
          <QuestionFields />
          <div className="adm-form-actions">
            <button className="adm-btn" type="submit">
              Add question
            </button>
          </div>
        </form>
      </section>

      <section className="adm-card">
        <h2>Add many questions at once</h2>
        <p className="adm-muted">
          One question per line. Separate the parts with <code>|</code> and finish with the
          letter of the correct answer. Options C and D are optional.
        </p>
        <pre className="adm-code">
{`What is 5 + 7? | 10 | 11 | 12 | 13 | C
The sun rises in the east. | True | False | A`}
        </pre>
        <form action={bulkAddQuestions.bind(null, exam.id)}>
          <label className="adm-field">
            <span className="adm-sr">Questions</span>
            <textarea name="bulk" rows={8} placeholder="Question | A | B | C | D | Answer" required />
          </label>
          <div className="adm-form-actions">
            <button className="adm-btn" type="submit">
              Add all questions
            </button>
          </div>
        </form>
      </section>

      <section className="adm-card">
        <details>
          <summary className="adm-summary">Exam settings</summary>
          <form action={updateExam.bind(null, exam.id)}>
            <ExamFields exam={exam} />
            <div className="adm-form-actions">
              <button className="adm-btn" type="submit">
                Save settings
              </button>
            </div>
          </form>
        </details>
      </section>

      <section className="adm-card adm-danger-zone">
        <details>
          <summary className="adm-summary">Delete this exam</summary>
          <p className="adm-muted">
            This permanently deletes the exam, all its questions and every student attempt.
          </p>
          <form action={deleteExam.bind(null, exam.id)}>
            <button className="adm-btn adm-btn-danger" type="submit">
              Yes, delete this exam
            </button>
          </form>
        </details>
      </section>
    </>
  );
}

export default function ExamPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<p className="adm-muted">Loading...</p>}>
      <ExamDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}
