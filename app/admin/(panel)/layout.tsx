import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/admin";
import SignOutButton from "../SignOutButton";
import AdminNav from "./AdminNav";
import "../login/login.css";
import "../admin.css";

async function Guard({ children }: { children: ReactNode }) {
  const admin = await getAdmin();

  if (admin.status === "anon") redirect("/admin/login");

  if (admin.status === "forbidden") {
    return (
      <main className="staff-login">
        <div className="staff-card">
          <div className="staff-brand">
            <h1>No access</h1>
          </div>
          <p style={{ marginBottom: 20 }}>
            This account does not have admin access.
          </p>
          <SignOutButton />
        </div>
      </main>
    );
  }

  return (
    <div className="adm-app">
      <aside className="adm-sidebar">
        <div className="adm-logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/kps-logo.png" alt="School logo" />
          <div>
            <strong>DKPS</strong>
            <span>Admin Panel</span>
          </div>
        </div>
        <AdminNav />
        <div className="adm-user">
          <span>{admin.profile.full_name ?? "Admin"}</span>
          <SignOutButton className="adm-btn adm-btn-light" />
        </div>
      </aside>

      <main className="adm-content">{children}</main>
    </div>
  );
}

export default function PanelLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="adm-boot">Loading...</div>}>
      <Guard>{children}</Guard>
    </Suspense>
  );
}
