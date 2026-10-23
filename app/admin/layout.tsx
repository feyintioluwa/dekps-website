import type { ReactNode } from "react";
import AdminShell from "./AdminShell";

export const metadata = { title: "DKPS Admin Portal" };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
