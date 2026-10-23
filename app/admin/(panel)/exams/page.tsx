import { Suspense } from "react";
import Link from "next/link";
import { getServiceClient } from "@/lib/supabase/service";
import { fmtDateTime } from "@/lib/format";
import type { Exam } from "@/lib/cbt-types";
import Flash from "../Flash";

type Row = Exam & {
  cbt_questions: { count: number }[];
  cbt_attempts: { count: number }[];
};

type Props = { searchParams: Promise<{ ok?: string; error?: string }> };

async function ExamList({ searchParams }: Props) {
  const { ok, error } = await searchParams;
  const db = getServiceClient();

  const { data, error: dbError } = await db
    .from("cbt_exams")
    .select("*, cbt_questions(count), cbt_attempts(count)")
    .order("created_at", { ascending: false });

  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <div className="adm-page-head">
        <div>
          <h1>CBT Exams</h1>
          <p className="adm-muted">Create exams, add questions and publish them to students.</p>
        </div>
        <Link className="adm-btn" href="/admin/exams/new">
          + New exam
        </Link>
      </div>

      <Flash ok={ok} error={error} />

      {dbError && (
        <div className="adm-flash error">
          Could not load exams. Run <code>supabase/cbt_schema.sql</code> in the Supabase SQL
          Editor first.
        </div>
      )}

      <section className="adm-card">
        {rows.length === 0 && !dbError ? (
          <p className="adm-muted">No exams yet. Click “New exam” to create the first one.</p>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Exam</th>
                  <th>Class</th>
                  <th>Questions</th>
                  <th>Time</th>
                  <th>Attempts</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((exam) => (
                  <tr key={exam.id}>
                    <td>
                      <Link href={`/admin/exams/${exam.id}`}>
                        <strong>{exam.title}</strong>
                      </Link>
                      <small>
                        {exam.subject} · created {fmtDateTime(exam.created_at)}
                      </small>
                    </td>
                    <td>{exam.class_name || "All classes"}</td>
                    <td>{exam.cbt_questions?.[0]?.count ?? 0}</td>
                    <td>{exam.duration_minutes} min</td>
                    <td>{exam.cbt_attempts?.[0]?.count ?? 0}</td>
                    <td>
                      <span className={`adm-badge ${exam.is_published ? "live" : "draft"}`}>
                        {exam.is_published ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="adm-row-actions">
                      <Link href={`/admin/exams/${exam.id}`}>Manage</Link>
                      <Link href={`/admin/exams/${exam.id}/results`}>Results</Link>
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

export default function ExamsPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<p className="adm-muted">Loading...</p>}>
      <ExamList searchParams={searchParams} />
    </Suspense>
  );
}
