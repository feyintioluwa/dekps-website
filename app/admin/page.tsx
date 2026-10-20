import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./SignOutButton";
import "./login/login.css";

async function Guard() {
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

  return (
    <main className="staff-login">
      <div className="staff-card">
        <div className="staff-brand">
          <img src="/assets/kps-logo.png" alt="School Logo" />
          <h1>ADMIN DASHBOARD</h1>
          <span>{profile.role.toUpperCase()}</span>
        </div>
        <p style={{ textAlign: "center", marginBottom: 24 }}>
          Welcome, {profile.full_name}.
        </p>
        <SignOutButton />
      </div>
    </main>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <Guard />
    </Suspense>
  );
}