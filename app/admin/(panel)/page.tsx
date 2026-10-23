import { Suspense } from "react";
import Link from "next/link";
import { getServiceClient } from "@/lib/supabase/service";
import { fmtDateTime, percent } from "@/lib/format";

type Recent = {
  id: string;
  exam_id: string;
  student_name: string;
  login_id: string;
  score: number | null;
  total_marks: number | null;
  submitted_at: string | null;
  cbt_exams: { title: string } | { title: string }[] | null;
};

const examTitle = (r: Recent) =>
  Array.isArray(r.cbt_exams) ? r.cbt_exams[0]?.title : r.cbt_exams?.title;

async function Overview() {
  const db = getServiceClient();
  const head = { count: "exact" as const, head: true };

  const [exams, published, questions, submitted, running, recent] = await Promise.all([
    db.from("cbt_exams").select("id", head),
    db.from("cbt_exams").select("id", head).eq("is_published", true),
    db.from("cbt_questions").select("id", head),
    db.from("cbt_attempts").select("id", head).eq("status", "submitted"),
    db.from("cbt_attempts").select("id", head).eq("status", "in_progress"),
    db
      .from("cbt_attempts")
      .select("id, exam_id, student_name, login_id, score, total_marks, submitted_at, cbt_exams(title)")
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false })
      .limit(8),
  ]);

  const tablesMissing = Boolean(exams.error);
  const rows = (recent.data ?? []) as unknown as Recent[];

  const stats = [
    { label: "Exams", value: exams.count ?? 0 },
    { label: "Published", value: published.count ?? 0 },
    { label: "Questions", value: questions.count ?? 0 },
    { label: "Submitted", value: submitted.count ?? 0 },
    { label: "In progress", value: running.count ?? 0 },
  ];

  return (
    <>
      <div className="adm-page-head">
        <div>
          <h1>Overview</h1>
          <p className="adm-muted">Manage CBT exams and see how students are doing.</p>
        </div>
        <Link className="adm-btn" href="/admin/exams/new">
          + New exam
        </Link>
      </div>

      {tablesMissing && (
        <div className="adm-flash error">
          The CBT tables were not found. Run <code>supabase/cbt_schema.sql</code> in the
          Supabase SQL Editor, then refresh this page.
        </div>
      )}

      <div className="adm-stats">
        {stats.map((s) => (
          <div className="adm-stat" key={s.label}>
            <span>{s.label}</span>
            <strong>{s.value}</strong>
          </div>
        ))}
      </div>

      <section className="adm-card">
        <h2>Recent submissions</h2>
        {rows.length === 0 ? (
          <p className="adm-muted">No exams have been submitted yet.</p>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Exam</th>
                  <th>Score</th>
                  <th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.student_name}
                      <small>{r.login_id}</small>
                    </td>
                    <td>
                      <Link href={`/admin/exams/${r.exam_id}/results`}>{examTitle(r) ?? "-"}</Link>
                    </td>
                    <td>
                      {r.score ?? "-"} / {r.total_marks ?? "-"}
                      <small>{percent(r.score, r.total_marks) ?? "-"}%</small>
                    </td>
                    <td>{fmtDateTime(r.submitted_at)}</td>
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

export default function AdminHome() {
  return (
    <Suspense fallback={<p className="adm-muted">Loading...</p>}>
      <Overview />
    </Suspense>
  );
}
