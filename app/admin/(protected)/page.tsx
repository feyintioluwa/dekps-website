import Link from "next/link";
import { createClient as createAdminClient } from "@supabase/supabase-js";

function admin() {
  return createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );
}

export default async function AdminDashboardPage() {
  const supabase = admin();

  // Fetch counts for the stats at the bottom
  const { count: studentCount } = await supabase
    .from("students")
    .select("*", { count: "exact", head: true });

  const { count: staffCount } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "teacher"); // Assuming teachers are profiles, or change this to your staff table

  const { count: classCount } = await supabase
    .from("classes")
    .select("*", { count: "exact", head: true });

  return (
    <div className="dashboard-container">
      
      {/* HEADER SECTION */}
      <div className="page-header">
        <h1>Good Morning, Admin 👋</h1>
        <p className="subtitle">
          De Kings Perfection Private School <strong>ADMIN 🟢</strong>
        </p>
        
        <div className="term-badge">
          📅 2026/2027 - FIRST TERM
        </div>
        <br />
        <button className="btn-switch">
          Switch to main version ➔
        </button>
      </div>

      {/* ACTION ROWS */}
      <div className="section-title">WHAT WOULD YOU LIKE TO DO TODAY?</div>

      <Link href="/admin/students" className="action-row">
        <div className="action-icon icon-blue">👤</div>
        <div className="action-body">
          <div className="action-title">Add Student</div>
        </div>
        <div className="action-chevron">›</div>
      </Link>

      <Link href="/admin/staff" className="action-row">
        <div className="action-icon icon-green">👥</div>
        <div className="action-body">
          <div className="action-title">Add Staff</div>
        </div>
        <div className="action-chevron">›</div>
      </Link>

      <Link href="/admin/cbt" className="action-row">
        <div className="action-icon icon-purple">💻</div>
        <div className="action-body">
          <div className="action-title">View CBT Test</div>
        </div>
        <div className="action-chevron">›</div>
      </Link>

      <Link href="/admin/publish" className="action-row">
        <div className="action-icon icon-red" style={{ background: "#fee2e2", color: "#991b1b" }}>📄</div>
        <div className="action-body">
          <div className="action-title">Publish Result</div>
        </div>
        <div className="action-chevron">›</div>
      </Link>

      {/* STATS SECTION */}
      <div className="section-title" style={{ marginTop: "40px" }}>LEARNING SPACE STATISTICS</div>

      <Link href="/admin/students" className="action-row">
        <div className="action-icon icon-pink">🎓</div>
        <div className="action-body">
          <div className="action-meta">Students</div>
          <div className="action-title">{studentCount || 0}</div>
        </div>
        <div className="action-chevron">›</div>
      </Link>

      <Link href="/admin/staff" className="action-row">
        <div className="action-icon icon-pink">👤</div>
        <div className="action-body">
          <div className="action-meta">Teachers</div>
          <div className="action-title">{staffCount || 0}</div>
        </div>
        <div className="action-chevron">›</div>
      </Link>

      <Link href="/admin/classes" className="action-row">
        <div className="action-icon icon-pink">📚</div>
        <div className="action-body">
          <div className="action-meta">Classes</div>
          <div className="action-title">{classCount || 0}</div>
        </div>
        <div className="action-chevron">›</div>
      </Link>

    </div>
  );
}