"use client";

import Image from "next/image";
import Link from "next/link";

type TeacherHeaderProps = {
  teacher?: { name: string; email: string } | null;
  onSignOut?: () => void | Promise<void>;
  backHref?: string;
  backLabel?: string;
};

export default function TeacherHeader({
  teacher,
  onSignOut,
  backHref,
  backLabel = "Back to dashboard",
}: TeacherHeaderProps) {
  return (
    <header className="tch-header">
      <div className="tch-header-in">
        <div className="tch-brand">
          <Image src="/assets/kps-logo.png" alt="School logo" width={46} height={46} priority />
          <div>
            <strong>DE KINGS PERFECTION PRIVATE SCHOOL</strong>
            <small>TEACHER PORTAL</small>
          </div>
        </div>
        {backHref ? (
          <Link href={backHref} style={{ color: "#fff", textDecoration: "none", fontWeight: 700, fontSize: ".85rem", whiteSpace: "nowrap" }}>{backLabel}</Link>
        ) : teacher && onSignOut ? (
          <div className="tch-me">
            <span><b>{teacher.name}</b><small>{teacher.email}</small></span>
            <button type="button" className="tch-btn tch-light" onClick={onSignOut}>Log out</button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
