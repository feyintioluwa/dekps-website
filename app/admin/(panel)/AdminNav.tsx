"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/exams", label: "CBT Exams", exact: false },
];

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="adm-nav" aria-label="Admin">
      {LINKS.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={active ? "active" : undefined}
            aria-current={active ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
      <span className="adm-nav-sep">Student portals</span>
      <Link href="/cbt" target="_blank">
        CBT portal ↗
      </Link>
      <Link href="/results" target="_blank">
        Result portal ↗
      </Link>
    </nav>
  );
}
