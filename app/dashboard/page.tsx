"use client";

import { FormEvent, MouseEvent, useCallback, useEffect, useState } from "react";
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

export default function Dashboard() {
  const [loginId, setLoginId] = useState("");
  const [pin, setPin] = useState("");
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

  const load = useCallback(async (c: Creds) => {
    const res = await fetch("/api/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(c),
    });
    return res.json();
  }, []);

  const loadAccess = useCallback(async (c: Creds) => {
    try {
      const res = await fetch("/api/cbt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...c, action: "access" }),
      });
      const d = await res.json();
      if (d.status === "ok") setAccess({ locked: d.locked, classOpen: d.classOpen });
    } catch { /* stays locked */ }
  }, []);

  const loadProgress = useCallback(async () => {
    let c: Creds | null = null;
    try { c = JSON.parse(sessionStorage.getItem(STORE) || "null"); } catch { c = null; }
    if (!c) { setPErr("Please sign in again."); return; }
    setPLoading(true); setPErr("");
    try {
      const res = await fetch("/api/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c),
      });
      const d = await res.json();
      if (d.status === "ok") setProgress(d);
      else setPErr("Could not load your progress. Try again.");
    } catch { setPErr("Could not reach the server."); }
    finally { setPLoading(false); }
  }, []);

  function go(t: Tab) {
    setTab(t);
    window.scrollTo({ top: 0 });
    if (t === "progress" && !progress && !pLoading) loadProgress();
  }

  async function unlock(e: FormEvent) {
    e.preventDefault();
    setCodeMsg("");
    let c: Creds | null = null;
    try { c = JSON.parse(sessionStorage.getItem(STORE) || "null"); } catch { c = null; }
    if (!c) return setCodeMsg("Please sign in again.");
    setBusy(true);
    try {
      const res = await fetch("/api/cbt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...c, action: "unlock", code }),
      });
      const d = await res.json();
      if (d.status === "ok") { setCode(""); await loadAccess(c); }
      else if (d.status === "code_blocked") setCodeMsg("Too many wrong codes. Please wait 15 minutes.");
      else if (d.status === "class_locked") setCodeMsg("Tests are not open yet. Ask your teacher.");
      else if (d.status === "wrong_code") setCodeMsg(`Wrong code. ${d.left} tries left.`);
      else setCodeMsg("Something went wrong. Try again.");
    } catch { setCodeMsg("Could not reach the server."); }
    finally { setBusy(false); }
  }

  const errText = (s: string) =>
    ({
      locked: "Too many wrong attempts. Please wait 15 minutes.",
      invalid: "Invalid Login ID or PIN.",
    } as Record<string, string>)[s] ?? "Something went wrong. Try again.";

  useEffect(() => {
    // Coming back here closes the doors to the test and assignment pages
    sessionStorage.removeItem("dkpsVia");
    const run = async () => {
      const saved = sessionStorage.getItem(STORE);
      if (saved) {
        try {
          const c = JSON.parse(saved) as Creds;
          const d = await load(c);
          if (d.status === "ok") { setData(d); loadAccess(c); setChecking(false); return; }
          sessionStorage.removeItem(STORE);
        } catch { /* show the login form */ }
      }
      setData(null);
      setChecking(false);
    };
    run();
  }, [load, loadAccess]);

  async function login(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    const c = { loginId: loginId.trim(), pin: pin.trim() };
    if (!c.loginId || !/^\d{4}$/.test(c.pin)) return setMsg("Enter your Login ID and 4-digit PIN.");
    setBusy(true);
    try {
      const d = await load(c);
      if (d.status !== "ok") return setMsg(errText(d.status));
      sessionStorage.setItem(STORE, JSON.stringify(c));
      setData(d);
      setTab("home");
      loadAccess(c);
    } catch { setMsg("Could not reach the server."); }
    finally { setBusy(false); }
  }

  function logout() {
    sessionStorage.removeItem(STORE);
    sessionStorage.removeItem("dkpsVia");
    setData(null); setPin(""); setMsg("");
    setAccess(null); setCode(""); setCodeMsg("");
    setTab("home"); setProgress(null); setPErr("");
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
    <div className="cbt-top dash-top">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/kps-logo.png" alt="De Kings Perfection Private School" className="dash-logo" />
      <div className="dash-who">
        <strong>{data.student.name}</strong>
        <small>{data.student.className}</small>
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

  if (!data && checking) {
    return (
      <div className="cbt">
        {header}
        <div className="cbt-wrap"><div className="cbt-card">Loading…</div></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="cbt">
        {header}
        <div className="cbt-wrap">
          <form className="cbt-card" onSubmit={login}>
            <h2>Student Login</h2>
            <p style={{ color: "#687385", marginBottom: 14 }}>Sign in once to see your results, tests and assignments.</p>
            <input placeholder="Login ID" value={loginId} onChange={(e) => setLoginId(e.target.value.toUpperCase())} autoComplete="off" autoCapitalize="characters" />
            <input placeholder="4-digit PIN" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="new-password" />
            {msg && <div className="cbt-err">{msg}</div>}
            <button className="cbt-btn" disabled={busy}>{busy ? "Checking..." : "Login"}</button>
          </form>
        </div>
      </div>
    );
  }

  const r = data.results;
  const testsOpen = access && !access.locked;
  const todo = [...data.assignments.items].sort(byDue);
  const tabs: { id: Tab; icon: string; label: string; badge?: number }[] = [
    { id: "home", icon: "🏠", label: "Home" },
    { id: "assignments", icon: "📋", label: "Assignments", badge: data.assignments.todoCount },
    { id: "tests", icon: "📝", label: "Tests", badge: testsOpen ? data.tests.count : 0 },
    { id: "results", icon: "🎓", label: "Results" },
    { id: "progress", icon: "📈", label: "Progress" },
  ];

  return (
    <div className="cbt">
      {header}
      <div className="cbt-wrap">
        <nav className="dt-tabs" aria-label="Dashboard sections">
          {tabs.map((t) => (
            <button key={t.id} className={`dt-tab${tab === t.id ? " on" : ""}`} onClick={() => go(t.id)} aria-current={tab === t.id ? "page" : undefined}>
              <span className="ic" aria-hidden="true">{t.icon}</span>
              {t.label}
              {t.badge ? <span className="dt-badge">{t.badge}</span> : null}
            </button>
          ))}
        </nav>

        <div className="dt-body">
          {/* ---------------- HOME ---------------- */}
          {tab === "home" && (
            <>
              <div style={{ background: "#fff", border: "1px solid #e3e8ef", borderRadius: 14, padding: 20, margin: "6px 0 12px" }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#cfe3fb", color: "#1f5fa8", display: "grid", placeItems: "center", fontSize: "1.4rem", fontWeight: 600 }}>
                  {initials(data.student.name)}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 12 }}>
                  <h2 style={{ margin: 0, color: "#071f3d", fontSize: "1.35rem" }}>{data.student.name}</h2>
                  {data.prefect && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 999, fontWeight: 600, fontSize: ".9rem", background: badgeStyle(data.prefect.role).bg, border: `1px solid ${badgeStyle(data.prefect.role).edge}`, color: badgeStyle(data.prefect.role).fg }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M12 2l8 3v6c0 5-3.5 9.2-8 11-4.5-1.8-8-6-8-11V5l8-3z" /></svg>
                      {data.prefect.role}
                    </span>
                  )}
                </div>
                <p style={{ margin: "4px 0 0", color: "#55627a" }}>
                  {data.student.className}{data.student.loginId ? ` · Login ID ${data.student.loginId}` : ""}
                </p>
                {data.prefect && <p style={{ margin: "2px 0 0", color: "#687385", fontSize: ".9rem" }}>Prefect for {data.prefect.session} session</p>}
              </div>
              {data.term && <p style={{ margin: "0 0 14px", color: "#687385" }}>Current term: {data.term.term} — {data.term.session}</p>}

              <div className="dt-tiles">
                <button className="dt-tile" onClick={() => go("assignments")}>
                  <strong>{data.assignments.todoCount}</strong><small>assignment{data.assignments.todoCount === 1 ? "" : "s"} to do</small>
                </button>
                <button className="dt-tile" onClick={() => go("tests")}>
                  <strong>{testsOpen ? data.tests.count : "Locked"}</strong><small>{testsOpen ? "tests & exams open" : "tests & exams"}</small>
                </button>
                <button className="dt-tile" onClick={() => go("results")}>
                  <strong>{r.count > 0 ? (r.grade ? `Grade ${r.grade}` : "Ready") : "None yet"}</strong><small>results</small>
                </button>
                <button className="dt-tile" onClick={() => go("progress")}>
                  <strong>View</strong><small>my progress</small>
                </button>
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

              <div className="cbt-card">
                <span className="cbt-tag">Coming up</span>
                {data.soon && data.soon.length > 0 ? (
                  <>
                    <h3 style={{ marginTop: 6 }}>Next on your list</h3>
                    {data.soon.slice(0, 3).map((s, i) => {
                      const c = countdown(s.at);
                      return (
                        <p key={i} style={{ color: "#687385", fontSize: ".9rem", margin: "6px 0" }}>
                          <strong style={{ color: "#071f3d" }}>{s.subject ? `${s.subject}: ` : ""}{s.kind === "assignment" ? s.title : kindName[s.kind]}</strong>
                          {" "}· <span className={c.soon ? "dt-soon" : undefined}>{whenWord[s.label]} {c.text}</span>
                        </p>
                      );
                    })}
                  </>
                ) : (
                  <h3 style={{ marginTop: 6 }}>Nothing coming up</h3>
                )}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <button className="cbt-btn alt" onClick={logout}>Log out</button>
                <Link href="/" className="cbt-btn alt" style={{ textDecoration: "none", display: "inline-block" }}>Back to school website</Link>
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
