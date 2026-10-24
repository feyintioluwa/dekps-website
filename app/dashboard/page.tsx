"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import "../cbt/cbt.css";

type Creds = { loginId: string; pin: string };
type Data = {
  student: { name: string; className: string };
  tests: { count: number; items: { subject: string; kind: string; end: string | null }[] };
  assignments: { todoCount: number; markedCount: number; items: { title: string; subject: string; dueAt: string | null }[] };
  results: { count: number; latest: string | null };
};

const STORE = "dkpsStudent";
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : "");
const linkBtn = { display: "inline-block", textDecoration: "none", marginTop: 10 } as const;

export default function Dashboard() {
  const [loginId, setLoginId] = useState("");
  const [pin, setPin] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (c: Creds) => {
    const res = await fetch("/api/dashboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(c),
    });
    return res.json();
  }, []);

  const errText = (s: string) =>
    ({
      locked: "Too many wrong attempts. Please wait 15 minutes.",
      invalid: "Invalid Login ID or PIN.",
    } as Record<string, string>)[s] ?? "Something went wrong. Try again.";

  useEffect(() => {
    const saved = sessionStorage.getItem(STORE);
    if (!saved) return;
    try {
      const c = JSON.parse(saved) as Creds;
      load(c).then((d) => { if (d.status === "ok") setData(d); else sessionStorage.removeItem(STORE); }).catch(() => {});
    } catch { sessionStorage.removeItem(STORE); }
  }, [load]);

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
    } catch { setMsg("Could not reach the server."); }
    finally { setBusy(false); }
  }

  function logout() {
    sessionStorage.removeItem(STORE);
    setData(null); setPin(""); setMsg("");
  }

  const header = (
    <div className="cbt-top">
      <h1>DE KINGS PERFECTION PRIVATE SCHOOL — STUDENT DASHBOARD</h1>
      {data ? <span>{data.student.name} · {data.student.className}</span> : <Link href="/" className="home-btn">← Home</Link>}
    </div>
  );

  if (!data) {
    return (
      <div className="cbt">
        {header}
        <div className="cbt-wrap">
          <form className="cbt-card" onSubmit={login}>
            <h2>Student Login</h2>
            <p style={{ color: "#687385", marginBottom: 14 }}>Sign in once to see your results, tests and assignments.</p>
            <input placeholder="Login ID" value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="off" />
            <input placeholder="4-digit PIN" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="new-password" />
            {msg && <div className="cbt-err">{msg}</div>}
            <button className="cbt-btn" disabled={busy}>{busy ? "Checking..." : "Login"}</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="cbt">
      {header}
      <div className="cbt-wrap">
        <h2 style={{ margin: "6px 0 14px", color: "#071f3d" }}>Welcome, {data.student.name}</h2>

        <div className="cbt-card">
          <span className="cbt-tag">Results</span>
          <h3 style={{ marginTop: 6 }}>{data.results.count > 0 ? "Your results are ready" : "No published results yet"}</h3>
          {data.results.latest && <p style={{ color: "#687385" }}>Latest: {data.results.latest}</p>}
          {data.results.count > 0 && <Link href="/results" className="cbt-btn" style={linkBtn}>View results</Link>}
        </div>

        <div className="cbt-card">
          <span className="cbt-tag">Tests &amp; Exams</span>
          <h3 style={{ marginTop: 6 }}>{data.tests.count > 0 ? `${data.tests.count} open now` : "Nothing open right now"}</h3>
          {data.tests.items.map((t, i) => (
            <p key={i} style={{ color: "#687385", fontSize: ".9rem" }}>
                            {t.subject} ({t.kind === "exam" ? "Exam" : "Test"}){t.end ? ` · closes ${fmt(t.end)}` : ""}
            </p>
          ))}
          <Link href="/cbt" className="cbt-btn alt" style={linkBtn}>Go to tests &amp; exams</Link>
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
          <Link href="/assignments" className="cbt-btn alt" style={linkBtn}>Go to assignments</Link>
        </div>

        <button className="cbt-btn alt" onClick={logout}>Log out</button>
      </div>
    </div>
  );
}