import { getAdmin } from "@/lib/admin";
import { isUuid, type Attempt, type Exam } from "@/lib/cbt-types";
import { percent } from "@/lib/format";

/** Stops spreadsheet apps from running a cell as a formula. */
function cell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await getAdmin();
  if (admin.status !== "ok") {
    return new Response("Not authorised", { status: admin.status === "anon" ? 401 : 403 });
  }

  const { id } = await context.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });

  const [examRes, attemptsRes] = await Promise.all([
    admin.db.from("cbt_exams").select("*").eq("id", id).maybeSingle(),
    admin.db.from("cbt_attempts").select("*").eq("exam_id", id).order("student_name", { ascending: true }),
  ]);

  const exam = examRes.data as Exam | null;
  if (!exam) return new Response("Not found", { status: 404 });

  const attempts = (attemptsRes.data ?? []) as Attempt[];

  const header = ["Student", "Login ID", "Class", "Status", "Score", "Total marks", "Percent", "Started", "Submitted"];
  const lines = [header.map(cell).join(",")];

  for (const a of attempts) {
    lines.push(
      [
        a.student_name,
        a.login_id,
        a.class_name,
        a.status === "submitted" ? "Submitted" : "In progress",
        a.score,
        a.total_marks,
        percent(a.score, a.total_marks),
        a.started_at,
        a.submitted_at,
      ]
        .map(cell)
        .join(",")
    );
  }

  const slug =
    exam.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "exam";

  return new Response("\uFEFF" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-results.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
