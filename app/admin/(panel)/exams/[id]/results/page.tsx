import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServiceClient } from "@/lib/supabase/service";
import { isUuid, type Attempt, type Exam } from "@/lib/cbt-types";
import { fmtDateTime, fmtMinutes, percent } from "@/lib/format";
import Flash from "../../../Flash";
import { resetAttempt } from "../../actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
};

async function Results({ params, searchParams }: Props) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  if (!isUuid(id)) notFound();

  const db = getServiceClient();
  const [examRes, attemptsRes] = await Promise.all([
    db.from("cbt_exams").select("*").eq("id", id).maybeSingle(),
    db
      .from("cbt_attempts")
      .select("*")
      .eq("exam_id", id)
      .order("student_name", { ascending: true }),
  ]);

  const exam = examRes.data as Exam | null;
  if (!exam) notFound();

  const attempts = (attemptsRes.data ?? []) as Attempt[];
  const done = attempts.filter((a) => a.status === "submitted");
  const pcts = done
    .map((a) => percent(a.score, a.total_marks))
    .filter((p): p is number => p !== null);

  const average = pcts.length ? Math.round((pcts.reduce((s, p) => s + p, 0) / pcts.length) * 10) / 10 : null;
  const highest = pcts.length ? Math.max(...pcts) : null;
  const lowest = pcts.length ? Math.min(...pcts) : null;

  return (
    <>
      <div className="adm-page-head">
        <div>
          <Link className="adm-back" href={`/admin/exams/${exam.id}`}>
            ← {exam.title}
          </Link>
          <h1>Results</h1>
          <p className="adm-muted">
            {exam.subject} · {exam.class_name || "All classes"}
          </p>
        </div>
        <a className="adm-btn" href={`/admin/exams/${exam.id}/results/export`}>
          Download CSV
        </a>
      </div>

      <Flash ok={ok} error={error} />

      <div className="adm-stats">
        <div className="adm-stat">
          <span>Submitted</span>
          <strong>{done.length}</strong>
        </div>
        <div className="adm-stat">
          <span>In progress</span>
          <strong>{attempts.length - done.length}</strong>
        </div>
        <div className="adm-stat">
          <span>Average</span>
          <strong>{average === null ? "-" : `${average}%`}</strong>
        </div>
        <div className="adm-stat">
          <span>Highest</span>
          <strong>{highest === null ? "-" : `${highest}%`}</strong>
        </div>
        <div className="adm-stat">
          <span>Lowest</span>
          <strong>{lowest === null ? "-" : `${lowest}%`}</strong>
        </div>
      </div>

      <section className="adm-card">
        {attempts.length === 0 ? (
          <p className="adm-muted">No student has started this exam yet.</p>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Started</th>
                  <th>Time used</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.student_name}
                      <small>{a.login_id}</small>
                    </td>
                    <td>{a.class_name || "-"}</td>
                    <td>
                      <span className={`adm-badge ${a.status === "submitted" ? "live" : "draft"}`}>
                        {a.status === "submitted" ? "Submitted" : "In progress"}
                      </span>
                    </td>
                    <td>
                      {a.status === "submitted" ? (
                        <>
                          {a.score} / {a.total_marks}
                          <small>{percent(a.score, a.total_marks) ?? "-"}%</small>
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>{fmtDateTime(a.started_at)}</td>
                    <td>{fmtMinutes(a.started_at, a.submitted_at)}</td>
                    <td className="adm-row-actions">
                      <details className="adm-reset">
                        <summary>Reset</summary>
                        <p>Delete this attempt so {a.student_name} can retake the exam?</p>
                        <form action={resetAttempt.bind(null, exam.id, a.id)}>
                          <button className="adm-btn adm-btn-danger adm-btn-sm" type="submit">
                            Yes, reset
                          </button>
                        </form>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export default function ResultsPage({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<p className="adm-muted">Loading...</p>}>
      <Results params={params} searchParams={searchParams} />
    </Suspense>
  );
}
