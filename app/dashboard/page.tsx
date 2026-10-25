"use client";

import { FormEvent, MouseEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import "../cbt/cbt.css";
import "./dashboard.css";

type Creds = { loginId: string; pin: string };
type Soon = { kind: "test" | "exam" | "assignment"; subject: string; title: string; at: string; label: "opens" | "closes" | "due" };
type Data = {
  student: { name: string; className: string };
  term?: { term: string; session: string } | null;
  subjects?: string[];
  soon?: Soon[];
  notices?: { id: string; title: string; body: string; postedAt: string }[];
  tests: { count: number; items: { subject: string; kind: string; end: string | null }[] };
  assignments: { todoCount: number; markedCount: number; items: { title: string; subject: string; dueAt: string | null }[] };
  results: { count: number; latest: string | null; grade?: string | null; average?: number | null; teacherRemark?: string | null };
};

const STORE = "dkpsStudent";
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : "");
const linkBtn = { display: "inline-block", textDecoration: "none", marginTop: 10 } as const;
const kindName = { test: "Test", exam: "Exam", assignment: "Assignment" } as const;
const whenWord = { opens: "opens", closes: "closes", due: "due" } as const;

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
      loadAccess(c);
    } catch { setMsg("Could not reach the server."); }
    finally { setBusy(false); }
  }

  function logout() {
    sessionStorage.removeItem(STORE);
    sessionStorage.removeItem("dkpsVia");
    setData(null); setPin(""); setMsg("");
    setAccess(null); setCode(""); setCodeMsg("");
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

  return (
    <div className="cbt">
      {header}
      <div className="cbt-wrap">
        <h2 style={{ margin: "6px 0 4px", color: "#071f3d" }}>Welcome, {data.student.name}</h2>
        {data.term && <p style={{ margin: "0 0 14px", color: "#687385" }}>Current term: {data.term.term} — {data.term.session}</p>}

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

        {data.subjects && data.subjects.length > 0 && (
          <div className="cbt-card">
            <span className="cbt-tag">My subjects</span>
            <h3 style={{ marginTop: 6 }}>{data.subjects.length} {data.subjects.length === 1 ? "subject" : "subjects"} this term</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              {data.subjects.map((s) => (
                <span key={s} style={{ padding: "6px 12px", borderRadius: 999, background: "#eef3fa", color: "#071f3d", fontSize: ".9rem", fontWeight: 500 }}>{s}</span>
              ))}
            </div>
          </div>
        )}

        <div className="cbt-card">
          <span className="cbt-tag">Coming up</span>
          {data.soon && data.soon.length > 0 ? (
            <>
              <h3 style={{ marginTop: 6 }}>Next on your list</h3>
              {data.soon.map((s, i) => (
                <p key={i} style={{ color: "#687385", fontSize: ".9rem", margin: "6px 0" }}>
                  <strong style={{ color: "#071f3d" }}>{s.subject ? `${s.subject}: ` : ""}{s.kind === "assignment" ? s.title : kindName[s.kind]}</strong>
                  {" "}· {whenWord[s.label]} {fmt(s.at)}
                </p>
              ))}
            </>
          ) : (
            <h3 style={{ marginTop: 6 }}>Nothing coming up</h3>
          )}
        </div>

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

        <div className="cbt-card">
          <span className="cbt-tag">Tests &amp; Exams</span>
          {access && !access.locked ? (
            <>
              <h3 style={{ marginTop: 6 }}>{data.tests.count > 0 ? `${data.tests.count} open now` : "Nothing open right now"}</h3>
              {data.tests.items.map((t, i) => (
                <p key={i} style={{ color: "#687385", fontSize: ".9rem" }}>
                  {t.subject} ({t.kind === "exam" ? "Exam" : "Test"}){t.end ? ` · closes ${fmt(t.end)}` : ""}
                </p>
              ))}
              <Link href="/cbt" className="cbt-btn alt" style={linkBtn} onClick={(e) => openPage(e, "/cbt")}>Go to tests &amp; exams</Link>
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

        <div className="cbt-card">
          <span className="cbt-tag">Assignments</span>
          <h3 style={{ marginTop: 6 }}>
            {data.assignments.todoCount > 0 ? `${data.assignments.todoCount} to do` : "Nothing to do right now"}
            {data.assignments.markedCount > 0 ? ` · ${data.assignments.markedCount} marked` : ""}
          </h3>
          {data.assignments.items.map((a, i) => (
            <p key={i} style={{ color: "#687385", fontSize: ".9rem" }}>
              {a.subject}: {a.title}{a.dueAt ? ` · deadline ${fmt(a.dueAt)}` : ""}
            </p>
          ))}
          <Link href="/assignments" className="cbt-btn alt" style={linkBtn} onClick={(e) => openPage(e, "/assignments")}>Go to assignments</Link>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button className="cbt-btn alt" onClick={logout}>Log out</button>
          <Link href="/" className="cbt-btn alt" style={{ textDecoration: "none", display: "inline-block" }}>Back to school website</Link>
        </div>
      </div>
    </div>
  );
}
