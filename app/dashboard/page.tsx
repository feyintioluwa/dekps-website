"use client";
import { FormEvent, MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import "../cbt/cbt.css";
import "./dashboard.css";
import "./tabs.css";
type Creds = { loginId: string; pin: string };
type Soon = { kind: "test" | "exam" | "assignment"; subject: string; title: string; at: string; label: "opens" | "closes" | "due" };
type Data = {
  student: { name: string; className: string; loginId?: string };
  prefect?: { role: string; session: string } | null;
  term?: { term: string; session: string } | null;
  subjects?: string[];
  soon?: Soon[];
  notices?: { id: string; title: string; body: string; postedAt: string }[];
  tests: { count: number; items: { subject: string; kind: string; end: string | null }[] };
  assignments: { todoCount: number; markedCount: number; items: { title: string; subject: string; dueAt: string | null }[] };
  results: { count: number; latest: string | null; grade?: string | null; average?: number | null; teacherRemark?: string | null };
};
type SubScore = { subject: string; ca: number | null; exam: number | null; total: number; grade: string };
type Progress = {
  terms: { term: string; session: string; average: number | null; grade: string | null }[];
  latest: { term: string; session: string; subjects: SubScore[]; strong: SubScore[]; weak: SubScore[] } | null;
  assignments: { subject: string; title: string; score: number; max: number }[];
};
type Tab = "home" | "assignments" | "tests" | "results" | "progress";
const STORE = "dkpsStudent";
const nowMs = () => Date.now();
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : "");
// Gold: head boy / head girl and their assistants. Blue: senior prefect. Green: every other role.
const badgeStyle = (role: string) => {
  const r = role.toLowerCase();
  if (r.includes("head boy") || r.includes("head girl")) return { bg: "#fbe3b0", edge: "#e0b45a", fg: "#6b4a00" };
  if (r.includes("senior")) return { bg: "#dbeafe", edge: "#9dc0ee", fg: "#1f4e8c" };
  return { bg: "#d4f0d4", edge: "#8fcf8f", fg: "#17621f" };
};
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const linkBtn = { display: "inline-block", textDecoration: "none", marginTop: 10 } as const;
const kindName = { test: "Test", exam: "Exam", assignment: "Assignment" } as const;
const whenWord = { opens: "opens", closes: "closes", due: "due" } as const;
// "in 2 days", "in 5 hours", "in less than an hour", or "now"
function countdown(at: string): { text: string; soon: boolean } {
  const ms = new Date(at).getTime() - nowMs();
  if (ms <= 0) return { text: "now", soon: true };
  const h = ms / 3600000;
  if (h < 1) return { text: "in less than an hour", soon: true };
  if (h < 24) { const n = Math.floor(h); return { text: `in ${n} hour${n === 1 ? "" : "s"}`, soon: true }; }
  const d = Math.floor(h / 24);
  return { text: `in ${d} day${d === 1 ? "" : "s"}`, soon: d < 2 };
}
const byDue = (a: { dueAt: string | null }, b: { dueAt: string | null }) =>
  (a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER) - (b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER);
// Green = good (60% and above), amber = average (45% to 59%), red = low (below 45%)
function tone(score: number, max: number) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  if (pct >= 60) return { c: "#1a8f4c", bg: "#e8f6ee" };
  if (pct >= 45) return { c: "#c98a00", bg: "#fff6dc" };
  return { c: "#c62828", bg: "#fdeaea" };
}
function Icon({ name }: { name: Tab }) {
  const p = {
    width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
  };
  if (name === "home") return <svg {...p}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>;
  if (name === "assignments") return <svg {...p}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9z" /><path d="M9 12h6M9 16h4" /></svg>;
  if (name === "tests") return <svg {...p}><path d="M4 20l1-4L16 5l3 3L8 19z" /><path d="M14 7l3 3" /></svg>;
  if (name === "results") return <svg {...p}><path d="M12 3l9 5-9 5-9-5z" /><path d="M7 11v5c0 1.5 2.5 3 5 3s5-1.5 5-3v-5" /></svg>;
  return <svg {...p}><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></svg>;
}
export default function Dashboard() {
  const [loginId, setLoginId] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [access, setAccess] = useState<{ locked: boolean; classOpen: boolean } | null>(null);
  const [code, setCode] = useState("");
  const [codeMsg, setCodeMsg] = useState("");
  const [tab, setTab] = useState<Tab>("home");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [pLoading, setPLoading] = useState(false);
  const [pErr, setPErr] = useState("");
  const sessionVersion = useRef(0);
  const activeStudent = useRef<string | null>(null);
  const current = useCallback((version: number, id: string) =>
    sessionVersion.current === version && activeStudent.current === id &&
    (() => { try { return JSON.parse(sessionStorage.getItem(STORE) || "null")?.loginId === id; } catch { return false; } })(), []);
  const reset = useCallback(() => {
    setData(null); setAccess(null); setProgress(null); setPLoading(false);
    setPErr(""); setCode(""); setCodeMsg(""); setTab("home");
  }, []);
  const load = useCallback(async (c: Creds) => {
    const res = await fetch("/api/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify(c),
    });
    return res.json();
  }, []);
  const loadAccess = useCallback(async (c: Creds) => {
    const version = sessionVersion.current;
    try {
      const res = await fetch("/api/cbt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        cache: "no-store", body: JSON.stringify({ ...c, action: "access" }),
      });
      const d = await res.json();
      if (current(version, c.loginId) && d.status === "ok")
        setAccess({ locked: !!d.locked, classOpen: !!d.classOpen });
    } catch { /* Access stays unavailable. */ }
  }, [current]);
  const loadProgress = useCallback(async () => {
    let c: Creds | null = null;
    try { c = JSON.parse(sessionStorage.getItem(STORE) || "null"); } catch { /* invalid */ }
    if (!c || activeStudent.current !== c.loginId) { setPErr("Please sign in again."); return; }
    const version = sessionVersion.current;
    setPLoading(true); setPErr("");
    try {
      const res = await fetch("/api/progress", {
        method: "POST", headers: { "Content-Type": "application/json" },
        cache: "no-store", body: JSON.stringify(c),
      });
      const d = await res.json();
      if (!current(version, c.loginId)) return;
      if (d.status === "ok") setProgress(d);
      else setPErr("Could not load your progress. Try again.");
    } catch { if (current(version, c.loginId)) setPErr("Could not reach the server."); }
    finally { if (current(version, c.loginId)) setPLoading(false); }
  }, [current]);
  function go(t: Tab) {
    setTab(t);
    window.scrollTo({ top: 0 });
    if (t === "progress" && !progress && !pLoading) loadProgress();
  }
  async function unlock(e: FormEvent) {
    e.preventDefault(); setCodeMsg("");
    let c: Creds | null = null;
    try { c = JSON.parse(sessionStorage.getItem(STORE) || "null"); } catch { /* invalid */ }
    if (!c || activeStudent.current !== c.loginId) { setCodeMsg("Please sign in again."); return; }
    const version = sessionVersion.current;
    setBusy(true);
    try {
      const res = await fetch("/api/cbt", {
        method: "POST", headers: { "Content-Type": "application/json" },
        cache: "no-store", body: JSON.stringify({ ...c, action: "unlock", code }),
      });
      const d = await res.json();
      if (!current(version, c.loginId)) return;
      if (d.status === "ok") { setCode(""); await loadAccess(c); }
      else if (d.status === "code_blocked") setCodeMsg("Too many wrong codes. Please wait 15 minutes.");
      else if (d.status === "class_locked") setCodeMsg("Tests are not open yet. Ask your teacher.");
      else if (d.status === "wrong_code") setCodeMsg(`Wrong code. ${d.left} tries left.`);
      else setCodeMsg("Something went wrong. Try again.");
    } catch { if (current(version, c.loginId)) setCodeMsg("Could not reach the server."); }
    finally { if (current(version, c.loginId)) setBusy(false); }
  }
  const errText = (s: string) =>
    ({
      locked: "Too many wrong attempts. Please wait 15 minutes.",
      invalid: "Invalid Login ID or PIN.",
    } as Record<string, string>)[s] ?? "Something went wrong. Try again.";
  useEffect(() => {
    sessionStorage.removeItem("dkpsVia");
    const version = ++sessionVersion.current;
    let cancelled = false;
    activeStudent.current = null;
    const run = async () => {
      let c: Creds | null = null;
      try { c = JSON.parse(sessionStorage.getItem(STORE) || "null"); } catch { /* invalid */ }
      if (c?.loginId && c?.pin) {
        try {
          const d = await load(c);
          if (cancelled || sessionVersion.current !== version) return;
          if (d.status === "ok" && JSON.parse(sessionStorage.getItem(STORE) || "null")?.loginId === c.loginId) {
            activeStudent.current = c.loginId;
            reset(); setData(d); setChecking(false); void loadAccess(c);
            return;
          }
        } catch { if (cancelled || sessionVersion.current !== version) return; }
      }
      if (cancelled || sessionVersion.current !== version) return;
      sessionStorage.removeItem(STORE);
      activeStudent.current = null; reset(); setChecking(false);
    };
    void run();
    return () => { cancelled = true; sessionVersion.current++; };
  }, [load, loadAccess, reset]);
  async function login(e: FormEvent) {
    e.preventDefault(); setMsg("");
    const c = { loginId: loginId.trim(), pin: pin.trim() };
    if (!c.loginId || !/^\d{4}$/.test(c.pin)) { setMsg("Enter your Login ID and 4-digit PIN."); return; }
    const version = ++sessionVersion.current;
    activeStudent.current = null; reset(); setBusy(true);
    sessionStorage.removeItem(STORE);
    try {
      const d = await load(c);
      if (sessionVersion.current !== version) return;
      if (d.status !== "ok") { setMsg(errText(d.status)); return; }
      sessionStorage.setItem(STORE, JSON.stringify(c));
      activeStudent.current = c.loginId;
      setData(d); setTab("home"); setChecking(false); void loadAccess(c);
    } catch { if (sessionVersion.current === version) setMsg("Could not reach the server."); }
    finally { if (sessionVersion.current === version) setBusy(false); }
  }
  function logout() {
    sessionVersion.current++;
    activeStudent.current = null;
    sessionStorage.removeItem(STORE);
    sessionStorage.removeItem("dkpsVia");
    reset(); setLoginId(""); setPin(""); setShowPin(false);
    setMsg(""); setBusy(false); setChecking(false);
  }
  // Opening Tests or Assignments: check the sign-in is still saved first
  function openPage(e: MouseEvent, to: string) {
    if (!sessionStorage.getItem(STORE)) {
      e.preventDefault();
      sessionStorage.removeItem("dkpsVia");
      setData(null); setPin("");
      setMsg("Please sign in again.");
      return;
    }
    sessionStorage.setItem("dkpsVia", to);
  }
  const header = data ? (
    <div className="cbt-top dash-top dash-top-signed">
      <div className="dash-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/kps-logo.png" alt="DKPS logo" className="dash-logo" />
        <div className="dash-brand-copy">
          <strong>Student Portal</strong>
          <small>De Kings Perfection Private School</small>
        </div>
      </div>
      <div className="dash-who">
        <span className="dash-header-avatar">{initials(data.student.name)}</span>
        <span className="dash-who-copy">
          <strong>{data.student.name}</strong>
          <small>{data.student.className}</small>
        </span>
      </div>
    </div>
  ) : (
    <div className="cbt-top dash-top">
      <Link href="/" className="dash-back" aria-label="Back to home" title="Home">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </Link>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/kps-logo.png" alt="De Kings Perfection Private School" className="dash-logo" style={{ marginLeft: "auto" }} />
    </div>
  );
  if (!data) {
    return (
      <main className="cbt dkps-login-page">
        <div className="dkps-login-shell">
          <aside className="dkps-login-story" aria-label="About the student portal">
            <div className="dkps-login-school">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/kps-logo.png" alt="DKPS logo" />
              <div><strong>DKPS</strong><small>DE KINGS PERFECTION PRIVATE SCHOOL</small></div>
            </div>
            <div className="dkps-login-story-main">
              <span className="dkps-login-kicker">YOUR STUDENT LEARNING SPACE</span>
              <h1>Your learning journey starts here.</h1>
              <p>Assignments, tests, results and academic progress — all in one secure place.</p>
            </div>
            <div className="dkps-login-photo" role="img" aria-label="Students learning together in a classroom">
              <div className="dkps-login-photo-caption">ACADEMIC <span>•</span> AND <span>•</span> MORAL <span>•</span> EXCELLENCE</div>
            </div>
          </aside>
          <section className="dkps-login-panel" aria-label="Student sign in">
            <div className="dkps-login-mobile-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/kps-logo.png" alt="DKPS logo" />
              <div><strong>DKPS Student Portal</strong><small>ACADEMIC • AND • MORAL • EXCELLENCE</small></div>
            </div>
            <div className="dkps-login-content">
              {checking ? (
                <div className="dkps-login-loading" role="status">Checking your session…</div>
              ) : (
                <>
                  <span className="dkps-login-label">STUDENT PORTAL</span>
                  <h2>Welcome Back!</h2>
                  <p className="dkps-login-intro">Sign in to continue your learning journey.</p>
                  <form className="dkps-login-form" onSubmit={login}>
                    <label htmlFor="dkps-login-id">Student Login ID</label>
                    <div className="dkps-login-field">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/></svg>
                      <input id="dkps-login-id" name="loginId" placeholder="Enter your student ID" value={loginId} onChange={(e) => setLoginId(e.target.value.toUpperCase())} autoComplete="username" autoCapitalize="characters" spellCheck={false} required />
                    </div>
                    <label htmlFor="dkps-login-pin">4-digit PIN</label>
                    <div className="dkps-login-field">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                      <input id="dkps-login-pin" name="pin" placeholder="Enter your 4-digit PIN" type={showPin ? "text" : "password"} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} autoComplete="current-password" required />
                      <button type="button" className="dkps-login-visibility" onClick={() => setShowPin((v) => !v)} aria-label={showPin ? "Hide PIN" : "Show PIN"} aria-pressed={showPin}>
                        {showPin ? "Hide" : "Show"}
                      </button>
                    </div>
                    {msg && <div className="dkps-login-error" role="alert">{msg}</div>}
                    <button className="dkps-login-submit" type="submit" disabled={busy}>{busy ? "Checking…" : "Sign In"}<span aria-hidden="true">→</span></button>
                  </form>
                  <p className="dkps-login-help">Having trouble signing in? Contact school administration.</p>
                  <div className="dkps-login-divider" />
                  <Link className="dkps-login-back" href="/">← <span>Back to School Website</span></Link>
                </>
              )}
            </div>
          </section>
        </div>
      </main>
    );
  }
  const r = data.results;
  const testsOpen = access && !access.locked;
  const todo = [...data.assignments.items].sort(byDue);
  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "home", label: "Home" },
    { id: "assignments", label: "Assignments", badge: data.assignments.todoCount },
    { id: "tests", label: "Tests", badge: testsOpen ? data.tests.count : 0 },
    { id: "results", label: "Results" },
    { id: "progress", label: "Progress" },
  ];
  type Attn = { key: string; tone: "urgent" | "warn" | "good"; title: string; sub: string; label: string; to: Tab };
  const attention: Attn[] = [];
  if (data.tests.count > 0) {
    attention.push(
      testsOpen
        ? { key: "t", tone: "warn", title: `Tests & exams open now (${data.tests.count})`, sub: "Open the Tests tab to start", label: "Start", to: "tests" }
        : { key: "t", tone: "warn", title: "Tests & exams are locked", sub: "Enter the code from your teacher", label: "Enter code", to: "tests" }
    );
  }
  todo.slice(0, 3).forEach((a, i) => {
    const c = a.dueAt ? countdown(a.dueAt) : null;
    attention.push({
      key: `a${i}`,
      tone: c?.soon ? "urgent" : "warn",
      title: `${a.subject}: ${a.title}`,
      sub: c ? `Due ${c.text}` : "No deadline",
      label: "Open",
      to: "assignments",
    });
  });
  if (r.count > 0) {
    attention.push({ key: "r", tone: "good", title: "Your results are ready", sub: r.latest ?? "", label: "View", to: "results" });
  }
  return (
    <div className="cbt">
      {header}
      <div className="cbt-wrap dt-wrap">
        <nav className="dt-tabs" aria-label="Dashboard sections">
          <div className="dt-nav-title">LEARNING SPACE</div>
          {tabs.map((t) => (
            <button key={t.id} className={`dt-tab${tab === t.id ? " on" : ""}`} onClick={() => go(t.id)} aria-current={tab === t.id ? "page" : undefined}>
              <span className="dt-ic">
                <Icon name={t.id} />
                {t.badge ? <span className="dt-badge">{t.badge}</span> : null}
              </span>
              <span className="dt-lb">{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="dt-body">
          {/* ---------------- HOME ---------------- */}
          {tab === "home" && (
            <>
              <section className="dt-welcome">
                <div className="dt-welcome-copy">
                  <span className="dt-welcome-eyebrow">
                    {data.term ? `${data.term.session} · ${data.term.term}` : "STUDENT LEARNING DASHBOARD"}
                  </span>
                  <h1>Welcome back, {data.student.name.split(/\\\s+/)[0]}!</h1>
                  <p>Here's your learning overview. Stay on top of your schoolwork.</p>
                  <div className="dt-welcome-badges">
                    <span className="dt-welcome-class">{data.student.className}</span>
                    {data.prefect && (
                      <span className="dt-prefect" style={{
                        background: badgeStyle(data.prefect.role).bg,
                        borderColor: badgeStyle(data.prefect.role).edge,
                        color: badgeStyle(data.prefect.role).fg,
                      }}>{data.prefect.role}</span>
                    )}
                  </div>
                </div>
                <div className="dt-welcome-avatar" aria-hidden="true">{initials(data.student.name)}</div>
              </section>
              <div className="dt-overview" aria-label="Learning overview">
                <button className="dt-overview-card" onClick={() => go("assignments")}>
                  <span className="dt-overview-label">Assignments</span>
                  <strong>{data.assignments.todoCount}</strong>
                  <small>To complete · {data.assignments.markedCount} marked</small>
                </button>
                <button className="dt-overview-card" onClick={() => go("tests")}>
                  <span className="dt-overview-label">Tests &amp; exams</span>
                  <strong>{testsOpen ? data.tests.count : "—"}</strong>
                  <small>{testsOpen ? "Available now" : "Check access"}</small>
                </button>
                <button className="dt-overview-card" onClick={() => go("results")}>
                  <span className="dt-overview-label">Results</span>
                  <strong>{r.count}</strong>
                  <small>Published results</small>
                </button>
                <button className="dt-overview-card" onClick={() => go("progress")}>
                  <span className="dt-overview-label">Progress</span>
                  <strong>{r.average != null && r.count > 0 ? `${r.average.toFixed(1)}%` : "View"}</strong>
                  <small>{r.average != null && r.count > 0 ? "Latest average" : "Learning history"}</small>
                </button>
              </div>
              {data.student.loginId && (
                <p className="dt-student-id">Student login ID: <strong>{data.student.loginId}</strong></p>
              )}
              <h3 className="dt-h">What needs your attention</h3>
              <div className="dt-todo">
                {attention.length > 0 ? (
                  attention.map((a) => (
                    <div key={a.key} className={`dt-item ${a.tone}`}>
                      <div className="dt-item-main">
                        <strong>{a.title}</strong>
                        {a.sub && <small>{a.sub}</small>}
                      </div>
                      <button className="dt-act" onClick={() => go(a.to)}>{a.label}</button>
                    </div>
                  ))
                ) : (
                  <div className="dt-clear">You&apos;re all caught up</div>
                )}
              </div>
              {data.notices && data.notices.length > 0 && (
                <div className="cbt-card">
                  <span className="cbt-tag">Notices</span>
                  {data.notices.map((n) => (
                    <div key={n.id} style={{ marginTop: 10 }}>
                      <h3 style={{ margin: 0 }}>{n.title}</h3>
                      <p style={{ color: "#687385", fontSize: ".8rem", margin: "2px 0 6px" }}>{new Date(n.postedAt).toLocaleDateString()}</p>
                      <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{n.body}</p>
                    </div>
                  ))}
                </div>
              )}
              {data.soon && data.soon.filter((s) => s.kind !== "assignment").length > 0 && (
                <div className="cbt-card">
                  <span className="cbt-tag">Coming up</span>
                  {data.soon.filter((s) => s.kind !== "assignment").slice(0, 3).map((s, i) => {
                    const c = countdown(s.at);
                    return (
                      <p key={i} style={{ color: "#687385", fontSize: ".9rem", margin: "8px 0" }}>
                        <strong style={{ color: "#071f3d" }}>{s.subject ? `${s.subject}: ` : ""}{kindName[s.kind]}</strong>
                        {" "}· <span className={c.soon ? "dt-soon" : undefined}>{whenWord[s.label]} {c.text}</span>
                      </p>
                    );
                  })}
                </div>
              )}
              <section className="dt-quick">
                <h3 className="dt-h">Quick access</h3>
                <div className="dt-quick-grid">
                  <button onClick={() => go("assignments")}><Icon name="assignments" /><span>Assignments</span></button>
                  <button onClick={() => go("tests")}><Icon name="tests" /><span>Tests &amp; exams</span></button>
                  <button onClick={() => go("results")}><Icon name="results" /><span>My results</span></button>
                  <button onClick={() => go("progress")}><Icon name="progress" /><span>My progress</span></button>
                </div>
              </section>
              <div className="dt-account-actions">
                <Link href="/" className="dt-school-link">School website</Link>
                <button type="button" className="dt-logout" onClick={logout}>Log out</button>
              </div>
            </>
          )}
          {/* ---------------- ASSIGNMENTS ---------------- */}
          {tab === "assignments" && (
            <div className="cbt-card">
              <span className="cbt-tag">Assignments</span>
              <h3 style={{ marginTop: 6 }}>
                {data.assignments.todoCount > 0 ? `${data.assignments.todoCount} to do` : "Nothing to do right now"}
                {data.assignments.markedCount > 0 ? ` · ${data.assignments.markedCount} marked` : ""}
              </h3>
              {todo.length > 0 && <p style={{ color: "#687385", fontSize: ".85rem", margin: "2px 0 8px" }}>Nearest deadline first</p>}
              {todo.map((a, i) => {
                const c = a.dueAt ? countdown(a.dueAt) : null;
                return (
                  <div className="dt-row" key={i}>
                    <span><strong style={{ color: "#071f3d" }}>{a.subject}</strong><br /><span style={{ color: "#687385", fontSize: ".9rem" }}>{a.title}</span></span>
                    <span style={{ textAlign: "right", fontSize: ".85rem", color: "#687385" }}>
                      {c ? <span className={c.soon ? "dt-soon" : undefined}>due {c.text}</span> : "No deadline"}
                      {a.dueAt && <><br />{fmt(a.dueAt)}</>}
                    </span>
                  </div>
                );
              })}
              <Link href="/assignments" className="cbt-btn" style={linkBtn} onClick={(e) => openPage(e, "/assignments")}>Open assignments</Link>
            </div>
          )}
          {/* ---------------- TESTS ---------------- */}
          {tab === "tests" && (
            <div className="cbt-card">
              <span className="cbt-tag">Tests &amp; Exams</span>
              {testsOpen ? (
                <>
                  <h3 style={{ marginTop: 6 }}>{data.tests.count > 0 ? `${data.tests.count} open now` : "Nothing open right now"}</h3>
                  {data.tests.items.map((t, i) => (
                    <p key={i} style={{ color: "#687385", fontSize: ".9rem" }}>
                      {t.subject} ({t.kind === "exam" ? "Exam" : "Test"}){t.end ? ` · closes ${fmt(t.end)}` : ""}
                    </p>
                  ))}
                  <Link href="/cbt" className="cbt-btn" style={linkBtn} onClick={(e) => openPage(e, "/cbt")}>Go to tests &amp; exams</Link>
                </>
              ) : (
                <>
                  <h3 style={{ marginTop: 6 }}>Tests and exams are locked</h3>
                  {access?.classOpen ? (
                    <form onSubmit={unlock}>
                      <p style={{ color: "#687385", marginBottom: 10 }}>Enter the code your teacher wrote on the board.</p>
                      <input placeholder="6-character code" value={code} maxLength={6} onChange={(e) => setCode(e.target.value.toUpperCase())} autoComplete="off" />
                      {codeMsg && <div className="cbt-err">{codeMsg}</div>}
                      <button className="cbt-btn" disabled={busy || code.trim().length < 6}>{busy ? "Checking..." : "Unlock"}</button>
                    </form>
                  ) : (
                    <p style={{ color: "#687385" }}>Your teacher has not opened tests yet. They unlock in school.</p>
                  )}
                  <Link href="/cbt" style={{ ...linkBtn, fontSize: ".85rem" }} onClick={(e) => openPage(e, "/cbt")}>Already in a test? Resume it</Link>
                </>
              )}
            </div>
          )}
          {/* ---------------- RESULTS ---------------- */}
          {tab === "results" && (
            <div className="cbt-card">
              <span className="cbt-tag">Results</span>
              <h3 style={{ marginTop: 6 }}>{r.count > 0 ? "Your results are ready" : "No published results yet"}</h3>
              {r.latest && <p style={{ color: "#687385" }}>Latest: {r.latest}</p>}
              {r.count > 0 && (r.grade || r.average != null) && (
                <p style={{ margin: "8px 0", fontWeight: 600, color: "#071f3d" }}>
                  {r.average != null ? `Average ${r.average.toFixed(2)}%` : ""}{r.average != null && r.grade ? " · " : ""}{r.grade ? `Grade ${r.grade}` : ""}
                </p>
              )}
              {r.count > 0 && r.teacherRemark && (
                <p style={{ color: "#687385", fontSize: ".9rem", margin: "6px 0" }}>Teacher&apos;s remark: {r.teacherRemark}</p>
              )}
              {r.count > 0 && <Link href="/results" className="cbt-btn" style={linkBtn}>View results</Link>}
            </div>
          )}
          {/* ---------------- PROGRESS ---------------- */}
          {tab === "progress" && (
            <>
              {pLoading && <div className="cbt-card">Loading your progress…</div>}
              {pErr && <div className="cbt-err">{pErr}</div>}
              {progress && progress.terms.length === 0 && (
                <div className="cbt-card">
                  <h3 style={{ margin: 0 }}>Your progress will appear here</h3>
                  <p style={{ color: "#687385", marginTop: 6 }}>It starts after your first results are published.</p>
                </div>
              )}
              {progress && progress.terms.length > 0 && (
                <div className="cbt-card">
                  <span className="cbt-tag">Average by term</span>
                  {progress.terms.map((t) => (
                    <div key={t.session + t.term} style={{ margin: "14px 0" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".9rem", gap: 8 }}>
                        <span>{t.term} · {t.session}</span>
                        <b>{t.average != null ? `${t.average.toFixed(1)}%` : "-"}{t.grade ? ` · ${t.grade}` : ""}</b>
                      </div>
                      <div className="dt-bar"><i style={{ width: `${Math.max(0, Math.min(100, t.average ?? 0))}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
              {progress?.latest && progress.latest.strong.length > 0 && (
                <div className="cbt-card">
                  <span className="cbt-tag">{progress.latest.term} · {progress.latest.session}</span>
                  <h3 style={{ margin: "6px 0 10px" }}>Your strongest subjects</h3>
                  <div>
                    {progress.latest.strong.map((s) => (
                      <span key={s.subject} className="dt-chip" style={{ background: "#e8f6ee", color: "#17621f" }}>{s.subject} · {s.total}</span>
                    ))}
                  </div>
                  <h3 style={{ margin: "10px 0" }}>Needs more work</h3>
                  <div>
                    {progress.latest.weak.map((s) => (
                      <span key={s.subject} className="dt-chip" style={{ background: "#fff6dc", color: "#8a5d00" }}>{s.subject} · {s.total}</span>
                    ))}
                  </div>
                </div>
              )}
              {progress?.latest && progress.latest.subjects.length > 0 && (
                <div className="cbt-card">
                  <span className="cbt-tag">All subjects · latest result</span>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", fontSize: ".85rem", borderCollapse: "collapse", marginTop: 8 }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: "#687385" }}>
                          <th style={{ padding: "6px 4px" }}>Subject</th><th>CA</th><th>Exam</th><th>Total</th><th>Grade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {progress.latest.subjects.map((s) => (
                          <tr key={s.subject} style={{ borderTop: "1px solid #eef1f5" }}>
                            <td style={{ padding: "8px 4px" }}>{s.subject}</td>
                            <td>{s.ca ?? "-"}</td><td>{s.exam ?? "-"}</td><td><b>{s.total}</b></td><td>{s.grade}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {progress && progress.assignments.length > 0 && (
                <div className="cbt-card">
                  <span className="cbt-tag">Marked assignments</span>
                  {progress.assignments.map((a, i) => {
                    const t = tone(a.score, a.max);
                    return (
                      <div className="dt-row" key={i}>
                        <span><strong style={{ color: "#071f3d" }}>{a.subject}</strong><br /><span style={{ color: "#687385", fontSize: ".9rem" }}>{a.title}</span></span>
                        <span style={{ fontWeight: 700, color: t.c, background: t.bg, border: `2px solid ${t.c}`, borderRadius: 999, padding: "2px 12px" }}>{a.score}/{a.max}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {data.subjects && data.subjects.length > 0 && (
                <div className="cbt-card">
                  <span className="cbt-tag">My subjects</span>
                  <h3 style={{ margin: "6px 0 10px" }}>{data.subjects.length} {data.subjects.length === 1 ? "subject" : "subjects"} this term</h3>
                  <div>
                    {data.subjects.map((s) => (
                      <span key={s} className="dt-chip" style={{ background: "#eef3fa", color: "#071f3d" }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
