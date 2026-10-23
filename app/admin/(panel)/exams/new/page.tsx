import { Suspense } from "react";
import Link from "next/link";
import Flash from "../../Flash";
import ExamFields from "../ExamFields";
import { createExam } from "../actions";

type Props = { searchParams: Promise<{ ok?: string; error?: string }> };

async function NewExamForm({ searchParams }: Props) {
  const { ok, error } = await searchParams;

  return (
    <>
      <div className="adm-page-head">
        <div>
          <Link className="adm-back" href="/admin/exams">
            ← All exams
          </Link>
          <h1>New exam</h1>
        </div>
      </div>

      <Flash ok={ok} error={error} />

      <form action={createExam} className="adm-card">
        <ExamFields />
        <div className="adm-form-actions">
          <button className="adm-btn" type="submit">
            Create exam
          </button>
        </div>
      </form>
    </>
  );
}

export default function NewExamPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<p className="adm-muted">Loading...</p>}>
      <NewExamForm searchParams={searchParams} />
    </Suspense>
  );
}
