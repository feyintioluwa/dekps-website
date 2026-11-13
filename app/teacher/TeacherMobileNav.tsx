"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export const RECENT_TOOLS: Record<string, string> = {
  "/teacher/assignments": "Assignments",
  "/teacher/cbt": "Tests & Exams",
  "/teacher/broadsheet": "Teacher Broadsheet",
  "/teacher/scores": "Scores",
  "/teacher/score-history": "Score Editing History",
};

const items = [
  { href: "/teacher", label: "Home", icon: "⌂" },
  { href: "/teacher/assignments", label: "Tasks", icon: "☷" },
  { href: "/teacher/scores", label: "Scores", icon: "▤" },
  { href: "/teacher#notifications", label: "Alerts", icon: "♧" },
] as const;

export default function TeacherMobileNav() {
  const pathname = usePathname();
  const [authenticated, setAuthenticated] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showBadges, setShowBadges] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setMoreOpen(false);
    // Never show a stale authenticated navigation while checking a new page/session.
    setAuthenticated(false);
    setAccount(null);
    fetch("/api/teacher/me", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return null;
        const data: { teacher?: { email?: string } } = await response.json();
        return data.teacher?.email?.trim().toLowerCase() || null;
      })
      .then((email) => {
        if (!controller.signal.aborted) {
          setAccount(email);
          setAuthenticated(!!email);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setAuthenticated(false);
      });
    return () => controller.abort();
  }, [pathname]);

  useEffect(() => {
    if (!account) { setShowBadges(true); return; }
    const refresh = () => {
      try { setShowBadges(localStorage.getItem(`dkps:teacher:badges:${account}`) !== "off"); }
      catch { setShowBadges(true); }
    };
    refresh();
    window.addEventListener("dkps:teacher:settings-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("dkps:teacher:settings-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [account]);

  // Read-only count from the same notifications API used by the dashboard.
  // Recheck on route changes, focus, and when returning to the tab.
  useEffect(() => {
    if (!authenticated) {
      setUnreadCount(0);
      return;
    }
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const response = await fetch("/api/teacher/notifications", {
          credentials: "same-origin", cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) {
          if (!controller.signal.aborted) setUnreadCount(0);
          return;
        }
        const data: { items?: { read?: boolean }[] } = await response.json();
        if (!controller.signal.aborted) {
          setUnreadCount((data.items ?? []).filter((item) => !item.read).length);
        }
      } catch {
        // An unavailable endpoint must not interfere with teacher navigation.
      }
    };
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    void refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [authenticated, pathname]);

  // Remember only the tool path, never scores or student data.
  useEffect(() => {
    if (!authenticated || !account) return;
    const tool = Object.keys(RECENT_TOOLS).find((path) => pathname === path || pathname.startsWith(path + "/"));
    if (!tool) return;
    try {
      localStorage.setItem(`dkps:teacher:last-tool:${account}`, tool);
    } catch { /* storage can be disabled */ }
  }, [authenticated, account, pathname]);

  if (!authenticated) return null;

  const isActive = (href: string) => href === "/teacher"
    ? pathname === "/teacher"
    : pathname === href || pathname.startsWith(href + "/");
  const moreActive = ["/teacher/cbt", "/teacher/broadsheet", "/teacher/score-history", "/teacher/classes", "/teacher/profile"].some(
    (href) => pathname === href || pathname.startsWith(href + "/")
  );

  return (
    <>
      <div className="teacher-mobile-nav-spacer" aria-hidden="true" />
      {moreOpen && (
        <div className="teacher-mobile-more" id="teacher-mobile-more">
          <a href="/teacher/cbt">Tests &amp; Exams</a>
          <a href="/teacher/broadsheet">Broadsheet</a>
          <a href="/teacher/score-history">Score History</a>
          <a href="/teacher/classes">My Classes</a>
          <a href="/teacher/profile">Profile &amp; Settings</a>
        </div>
      )}
      <nav className="teacher-mobile-nav" aria-label="Teacher mobile navigation">
        {items.map((item) => (
          <a key={item.label} href={item.href} className={isActive(item.href) ? "active" : ""} aria-current={isActive(item.href) ? "page" : undefined}>
            <span className="teacher-mobile-nav-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
            {item.label === "Alerts" && showBadges && unreadCount > 0 && (
              <span className="teacher-mobile-nav-badge" aria-label={`${unreadCount} unread notifications`}>
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </a>
        ))}
        <button type="button" className={moreOpen || moreActive ? "active" : ""} aria-expanded={moreOpen} aria-controls="teacher-mobile-more" onClick={() => setMoreOpen((open) => !open)}>
          <span className="teacher-mobile-nav-icon" aria-hidden="true">•••</span>
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
