import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import SubjectEditor from "./SubjectEditor";

function admin() {
  return createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );
}

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = admin();

  const { data: student } = await supabase
    .from("students")
    .select("id, login_id, name, stream, is_active, created_at, class_id, classes(name)")
    .eq("id", id)
    .single();

  if (!student) notFound();

  const cls = Array.isArray(student.classes) ? student.classes[0] : student.classes;

  const { data: classSubjects } = await supabase
    .from("class_subjects")
    .select("subject_id, position, subjects(id, name)")
    .eq("class_id", student.class_id)
    .order("position");

  const { data: assignments } = await supabase
    .from("student_subjects")
    .select("subject_id")
    .eq("student_id", student.id);

  const assignedIds = new Set((assignments ?? []).map((a) => a.subject_id));

  const offered = (classSubjects ?? []).map((cs) => {
    const subj = Array.isArray(cs.subjects) ? cs.subjects[0] : cs.subjects;
    return {
      id: cs.subject_id,
      name: subj?.name ?? "(unnamed)",
      position: cs.position,
      assigned: assignedIds.has(cs.subject_id),
    };
  });

  return (
    <div>
      <p style={{ marginBottom: 12 }}>
        <Link href="/admin/students" style={{ color: "#7a0f1a" }}>← Back to students</Link>
      </p>

      <h1>{student.name}</h1>
      <p className="subtitle">Student detail and subject assignment.</p>

      <div className="admin-card">
        <h2>Identity</h2>
        <div className="identity-grid">
          <div className="identity-item">
            <span className="label">Login ID</span>
            <span className="value"><code>{student.login_id}</code></span>
          </div>
          <div className="identity-item">
            <span className="label">Class</span>
            <span className="value">{cls?.name ?? "—"}</span>
          </div>
          <div className="identity-item">
            <span className="label">Stream</span>
            <span className="value">{student.stream ?? "—"}</span>
          </div>
          <div className="identity-item">
            <span className="label">Status</span>
            <span className="value">{student.is_active ? "Active" : "Inactive"}</span>
          </div>
          <div className="identity-item">
            <span className="label">Created</span>
            <span className="value">
              {new Date(student.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {student.stream ? (
        <div className="admin-card">
          <SubjectEditor studentId={student.id} subjects={offered} />
        </div>
      ) : (
        <div className="admin-card">
          <h2>Subjects</h2>
          <p style={{ fontSize: 14, color: "#6b5b4e", marginBottom: 12 }}>
            Non-SSS students automatically take all subjects offered by their class.
            Subject assignment is only editable for SSS students.
          </p>
          <ul style={{ paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>
            {offered.map((s) => (
              <li key={s.id}>{s.name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}