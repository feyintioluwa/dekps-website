"use client";

import { FormEvent, useEffect, useState } from "react";
import "./teacher.css";

type Subject = { id: string; name: string };
type ClassCard = {
  id: string;
  name: string;
  isClassTeacher: boolean;
  studentCount: number;
  subjects: Subject[];
};
type Me = { teacher: { name: string; email: string }; classes: ClassCard[] };
type Student = { id: string; login_id: string; name: string };

const NETWORK = "Could not reach the server. Check your internet and try again.";

export default function TeacherPage() {
  const [checking, setChecking] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  const [openClass, setOpenClass] = useState<ClassCard | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [q, setQ] = useState("");

  async function loadMe(): Promise<boolean> {
    try {
      const res = await fetch("/api/teacher/me");
      const d = await res.json();
      if (res.ok) {
        setMe(d);
        return true;
      }
      setMe(null);
      // 401 just means "not signed in yet": no message needed
      if (res.status !== 401) setMsg(d.error || "Something went wrong.");
    } catch {
      setMsg(NETWORK);
    }
    return false;
  }

  useEffect(() => {
    (async () => {
      await loadMe();
      setChecking(false);
    })();
  }, []);

  async function signIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg("");
    if (!email.trim() || !password) return setMsg("Enter your email and password.");

    setBusy(true);
    try {
      const res = await fetch("/api/teacher/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await res.json();
      if (res.ok) {
        setPassword("");
        await loadMe();
      } else {
        setMsg(d.error || "Could not sign in.");
      }
    } catch {
      setMsg(NETWORK);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/teacher/session", { method: "DELETE" }).catch(() => {});
    setMe(null);
    setOpenClass(null);
    setStudents([]);
    setPassword("");
    setMsg("");
  }

  async function openStudents(c: ClassCard) {
    setOpenClass(c);
    setStudents([]);
    setQ("");
    setMsg("");
    setLoadingStudents(true);
    try {
      const res = await fetch(`/api/teacher/students?classId=${encodeURIComponent(c.id)}`);
      const d = await res.json();
      if (res.ok) setStudents(d.students);
      else if (res.status === 401) { setMe(null); setOpenClass(null); setMsg("Your session ended. Please sign in again."); }
      else setMsg(d.error || "Could not load the students.");
    } catch {
      setMsg(NETWORK);
    } finally {
      setLoadingStudents(false);
    }
  }

  const shown = students.filter((s) => {
    const t = q.trim().toLowerCase();
    return !t || s.name.toLowerCase().includes(t) || s.login_id.toLowerCase().includes(t);
  });

  return (
    <div className="tch">
      <header className="tch-header">
        <div className="tch-header-in">
          <div className="tch-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/kps-logo.png" alt="School logo" />
            <div>
              <strong>DE KINGS PERFECTION PRIVATE SCHOOL</strong>
              <small>TEACHER PORTAL</small>
            </div>
          </div>

          {me && (
            <div className="tch-me">
              <span>
                <b>{me.teacher.name}</b>
                <small>{me.teacher.email}</small>
              </span>
              <button className="tch-btn tch-light" onClick={signOut}>Log out</button>
            </div>
          )}
        </div>
      </header>

      <main className="tch-main">
        {checking && <p className="tch-muted tch-center">Loading...</p>}

        {!checking && !me && (
          <section className="tch-card tch-narrow">
            <h1>Teacher Sign In</h1>
            <p className="tch-muted">Use the email and password the school gave you.</p>

            <form onSubmit={signIn}>
              <label htmlFor="t-email">Email address</label>
              <input
                id="t-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />

              <label htmlFor="t-pw">Password</label>
              <div className="tch-pw">
                <input
                  id="t-pw"
                  type={showPw ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button type="button" className="tch-link" onClick={() => setShowPw((v) => !v)}>
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>

              <p className="tch-error" role="alert">{msg}</p>

              <button className="tch-btn" type="submit" disabled={busy}>
                {busy ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </section>
        )}

        {!checking && me && !openClass && (
          <section>
            <h1>Welcome, {me.teacher.name}</h1>
            <p className="tch-muted">Your classes and subjects</p>
            {msg && <p className="tch-error" role="alert">{msg}</p>}

            {me.classes.length === 0 ? (
              <div className="tch-card tch-empty">
                <h2>No classes yet</h2>
                <p className="tch-muted">
                  The school has not given you any class or subject yet. Please see the admin.
                </p>
              </div>
            ) : (
              <div className="tch-grid">
                <a className="tch-card tch-assign-card" href="/teacher/assignments">
                  <div className="tch-class-top">
                    <h2>Assignments</h2>
                  </div>
                  <p className="tch-muted">Create assignments, mark submissions, and see who is missing.</p>
                  <span className="tch-btn" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    Open assignments
                  </span>
                </a>
                {me.classes.map((c) => (
                  <article className="tch-card" key={c.id}>
                    <div className="tch-class-top">
                      <h2>{c.name}</h2>
                      {c.isClassTeacher && <span className="tch-badge">Class teacher</span>}
                    </div>
                    <p className="tch-muted">
                      {c.studentCount} student{c.studentCount === 1 ? "" : "s"}
                    </p>

                    <div className="tch-chips">
                      {c.subjects.length === 0 ? (
                        <span className="tch-muted">No subjects</span>
                      ) : (
                        c.subjects.map((s) => <span className="tch-chip" key={s.id}>{s.name}</span>)
                      )}
                    </div>

                    <button className="tch-btn" onClick={() => openStudents(c)}>View students</button>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        {!checking && me && openClass && (
          <section className="tch-card">
            <button className="tch-link tch-back" onClick={() => { setOpenClass(null); setMsg(""); }}>
              ← Back to my classes
            </button>
            <h1>{openClass.name}</h1>
            <p className="tch-muted">
              {students.length} student{students.length === 1 ? "" : "s"}
              {openClass.isClassTeacher ? " · You are the class teacher" : ""}
            </p>

            {msg && <p className="tch-error" role="alert">{msg}</p>}

            <input
              className="tch-search"
              type="search"
              placeholder="Search by name or Login ID"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />

            {loadingStudents ? (
              <p className="tch-muted">Loading students...</p>
            ) : shown.length === 0 ? (
              <p className="tch-muted">{students.length === 0 ? "No students in this class yet." : "No match."}</p>
            ) : (
              <div className="tch-table-wrap">
                <table className="tch-table">
                  <thead>
                    <tr><th>#</th><th>Name</th><th>Login ID</th></tr>
                  </thead>
                  <tbody>
                    {shown.map((s, i) => (
                      <tr key={s.id}>
                        <td>{i + 1}</td>
                        <td>{s.name}</td>
                        <td>{s.login_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}