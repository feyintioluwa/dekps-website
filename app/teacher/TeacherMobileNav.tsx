"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export const RECENT_TOOLS: Record<string, string> = {
  "/teacher/assignments": "Assignments",
  "/teacher/cbt": "Tests & Exams",
  "/teacher/broadsheet": "Teacher Broadsheet",
  "/teacher/scores": "Scores",
  "/teacher/score-history": "Score Editing History",
  "/teacher/published-corrections": "Published Result Corrections",
};
const items = [
  { href: "/teacher", label: "Home", icon: "⌂" },
  { href: "/teacher/assignments", label: "Tasks", icon: "☷" },
  { href: "/teacher/scores", label: "Scores", icon: "▤" },
  { href: "/teacher/classes", label: "Classes", icon: "♙" },
] as const;
export default function TeacherMobileNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [checkedPath, setCheckedPath] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/teacher/me", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) return null;
        const data: { teacher?: { email?: string } } = await response.json();
        return data.teacher?.email?.trim().toLowerCase() || null;
      })
      .then(email => { if (!controller.signal.aborted) { setAccount(email); setAuthenticated(!!email); setCheckedPath(pathname); } })
      .catch(() => { if (!controller.signal.aborted) { setAuthenticated(false); setCheckedPath(pathname); } });
    return () => controller.abort();
  }, [pathname]);
  useEffect(() => {
    if (!authenticated || !account) return;
    const tool = Object.keys(RECENT_TOOLS).find(path => pathname === path || pathname.startsWith(path + "/"));
    if (!tool) return;
    try { localStorage.setItem(`dkps:teacher:last-tool:${account}`, tool); } catch { /* storage blocked */ }
  }, [authenticated, account, pathname]);
  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const response = await fetch("/api/teacher/session", { method: "DELETE", credentials: "same-origin" });
      if (!response.ok) throw new Error("Could not log out. Please try again.");
      setMoreOpen(false); setAuthenticated(false); setAccount(null); router.replace("/teacher"); router.refresh();
    } catch (error) { window.alert(error instanceof Error ? error.message : "Could not log out."); setSigningOut(false); }
  }
  if (!authenticated || checkedPath !== pathname) return null;
  const isActive = (href: string) => href === "/teacher" ? pathname === "/teacher" : pathname === href || pathname.startsWith(href + "/");
  const moreActive = ["/teacher/cbt", "/teacher/broadsheet", "/teacher/score-history", "/teacher/published-corrections", "/teacher/profile"].some(href => pathname === href || pathname.startsWith(href + "/"));
  return (<>
    <div className="teacher-mobile-nav-spacer" aria-hidden="true" />
    {moreOpen && <div className="teacher-mobile-more" id="teacher-mobile-more">
      <a href="/teacher/cbt">Tests &amp; Exams</a><a href="/teacher/broadsheet">Broadsheet</a>
      <a href="/teacher/score-history">Score History</a><a href="/teacher/published-corrections">Result Corrections</a>
      <a href="/teacher/classes">My Classes</a><a href="/teacher/profile">Profile &amp; Settings</a>
      <button type="button" className="teacher-mobile-more-logout" disabled={signingOut} onClick={() => void signOut()}>{signingOut ? "Logging out…" : "Log out"}</button>
    </div>}
    <nav className="teacher-mobile-nav" aria-label="Teacher mobile navigation">
      {items.map(item => <a key={item.label} href={item.href} className={isActive(item.href) ? "active" : ""} aria-current={isActive(item.href) ? "page" : undefined}>
        <span className="teacher-mobile-nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
      </a>)}
      <button type="button" className={moreOpen || moreActive ? "active" : ""} aria-expanded={moreOpen} aria-controls="teacher-mobile-more" onClick={() => setMoreOpen(open => !open)}>
        <span className="teacher-mobile-nav-icon" aria-hidden="true">•••</span><span>More</span>
      </button>
    </nav>
  </>);
}
