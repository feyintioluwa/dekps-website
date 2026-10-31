import { createClient as createAdminClient } from "@supabase/supabase-js";
import AddStudentForm from "./AddStudentForm";

function admin() {
  return createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );
}

export default async function StudentsPage() {
  const supabase = admin();

  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, sort_order")
    .order("sort_order", { ascending: true });

  return (
    <div style={{ background: "#fff", padding: "32px", borderRadius: "12px", border: "1px solid #e5e7eb" }}>
      <div style={{ marginBottom: "24px", borderBottom: "1px solid #e5e7eb", paddingBottom: "16px" }}>
        <h1 style={{ fontSize: "24px", margin: "0 0 8px 0" }}>Add New Student</h1>
        <p style={{ color: "#6b7280", margin: 0 }}>
          Enter the details below to register a student for the new session.
        </p>
      </div>

      <AddStudentForm classes={classes || []} />
    </div>
  );
}