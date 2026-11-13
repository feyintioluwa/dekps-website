import type { ReactNode } from "react";
import TeacherMobileNav from "./TeacherMobileNav";
import "./teacher-mobile-nav.css";

export default function TeacherLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <TeacherMobileNav />
    </>
  );
}
