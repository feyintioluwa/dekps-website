import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "../SignOutButton";
import "./admin.css";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const admin = createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return (
      <main className="staff-login">
        <div className="staff-card">
          <div className="staff-brand">
            <h1>No access</h1>
          </div>
          <p>This account does not have admin access.</p>
          <SignOutButton />
        </div>
      </main>
    );
  }

  // Get initials for the top right avatar
  const initials = profile.full_name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand">
          <img src="/assets/kps-logo.png" alt="School logo" />
          <strong>De Kings</strong>
        </div>

        <nav className="admin-nav">
          <Link href="/admin" className="active">🏠 Home</Link>
          <Link href="/admin/scores">📝 Score Entry</Link>
          <Link href="/admin/results">📄 Result Portal</Link>
          <Link href="/admin/cbt">💻 CBT</Link>
        </nav>

        <div className="who">
          <strong>{profile.full_name}</strong>
          <span>ADMIN</span>
          <SignOutButton />
        </div>
      </aside>

      <main className="admin-content">
        {/* Top Bar for the icons */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginBottom: "24px" }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#fff", border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#6b7280" }}>
            🌙
          </div>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#fff", border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#6b7280" }}>
            ?
          </div>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#f3f4f6", border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "12px", color: "#374151" }}>
            {initials}
          </div>
        </div>

        {children}
      </main>
    </div>
  );
}