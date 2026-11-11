"use client";



import { FormEvent, useEffect, useState } from "react";

import "./teacher.css";

import Image from "next/image";

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

type Note = { id: string; assignmentId: string; student: string; className: string; subject: string; title: string; submittedAt: string; read: boolean };



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

  const [notes, setNotes] = useState<Note[]>([]);



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



  // New submissions for this teacher (loaded once they are signed in)
  useEffect(() => {
  if (!me) return;

  let cancelled = false;

  async function fetchNotifications() {
    try {
      const res = await fetch("/api/teacher/notifications");

      if (!res.ok) return;

      const data = await res.json();

      if (!cancelled) {
        setNotes(data.items ?? []);
      }
    } catch {
      // Notifications remain unchanged if the request fails.
    }
  }

  void fetchNotifications();

  return () => {
    cancelled = true;
  };
}, [me]);



  function readNote(id: string) {

    setNotes((p) => p.map((n) => (n.id === id ? { ...n, read: true } : n)));

    fetch("/api/teacher/notifications", {

      method: "POST", keepalive: true,

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({ action: "read", id }),

    }).catch(() => {});

  }

  async function readAllNotes() {

    setNotes((p) => p.map((n) => ({ ...n, read: true })));

    await fetch("/api/teacher/notifications", {

      method: "POST",

      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({ action: "readAll" }),

    }).catch(() => {});

  }

  const [showAll, setShowAll] = useState(false);

  const unreadNotes = notes.filter((n) => !n.read);

  const unread = unreadNotes.length;

  const shownNotes = unreadNotes.slice(0, 3);          // the card shows only the 3 newest unread ones

  const hiddenCount = notes.length - shownNotes.length; // anything else lives behind "View all"

  useEffect(() => {

    if (!showAll) return;

    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowAll(false); };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);

  }, [showAll]);

  const noteRow = (n: Note) => (

    <a

      key={n.id}

      href={`/teacher/assignments?open=${n.assignmentId}`}

      onClick={() => readNote(n.id)}

      style={{

        display: "block", marginTop: 8, padding: "10px 12px", borderRadius: 10, textDecoration: "none",

        color: "inherit", border: "1px solid #dfe4ea", background: n.read ? "#fff" : "#eef5ff",

      }}

    >

      <b>{n.student}</b> ({n.className}) submitted {n.subject}: {n.title}

      <div className="tch-muted" style={{ fontSize: ".8rem" }}>{new Date(n.submittedAt).toLocaleString()}</div>

    </a>

  );



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

            <Image  src="/assets/kps-logo.png"  alt="School logo"  width={48}  height={48}/>

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



            <div className="tch-card" style={{ margin: "14px 0" }}>

              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>

                <h2 style={{ margin: 0 }}>

                  🔔 Notifications

                  {unread > 0 && (

                    <span style={{ marginLeft: 8, padding: "2px 10px", borderRadius: 999, background: "#c62828", color: "#fff", fontSize: ".8rem" }}>

                      {unread} new

                    </span>

                  )}

                </h2>

                {unread > 0 && <button type="button" className="tch-link" onClick={readAllNotes}>Mark all as read</button>}

              </div>

              {notes.length === 0 ? (

                <p className="tch-muted" style={{ margin: "8px 0 0" }}>No submissions yet. They will appear here when students hand in work.</p>

              ) : unread === 0 ? (

                <p className="tch-muted" style={{ margin: "8px 0 0" }}>You are all caught up. Nothing new is waiting.</p>

              ) : (

                shownNotes.map(noteRow)

              )}

              {hiddenCount > 0 && (

                <button

                  type="button"

                  onClick={() => setShowAll(true)}

                  style={{ marginTop: 10, width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #c9d3df", background: "#fff", color: "#071f3d", fontWeight: 600, cursor: "pointer" }}

                >

                  View all ({notes.length})

                </button>

              )}

            </div>



            {showAll && (

              <div

                role="dialog"

                aria-modal="true"

                aria-label="All notifications"

                onMouseDown={(e) => { if (e.target === e.currentTarget) setShowAll(false); }}

                style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(7,31,61,.55)" }}

              >

                <div style={{ width: "100%", maxWidth: 520, maxHeight: "85vh", display: "flex", flexDirection: "column", background: "#fff", borderRadius: 12, borderTop: "5px solid #071f3d", boxShadow: "0 20px 50px rgba(7,31,61,.35)" }}>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "16px 18px 8px" }}>

                    <h2 style={{ margin: 0, fontSize: "1.1rem" }}>🔔 All notifications ({notes.length})</h2>

                    <button type="button" aria-label="Close" onClick={() => setShowAll(false)} style={{ border: 0, background: "transparent", fontSize: "1.6rem", lineHeight: 1, cursor: "pointer", color: "#55627a" }}>×</button>

                  </div>

                  {unread > 0 && (

                    <div style={{ padding: "0 18px" }}>

                      <button type="button" className="tch-link" onClick={readAllNotes}>Mark all as read</button>

                    </div>

                  )}

                  <div style={{ overflowY: "auto", padding: "0 18px 18px" }}>

                    {notes.map(noteRow)}

                  </div>

                </div>

              </div>

            )}



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

                <a className="tch-card tch-assign-card" href="/teacher/cbt">

                  <div className="tch-class-top">

                    <h2>Tests &amp; Exams</h2>

                  </div>

                  <p className="tch-muted">Create tests and exams, add questions, publish them, and see the results.</p>

                  <span className="tch-btn" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>

                    Open tests &amp; exams

                  </span>

                </a>

                                <a className="tch-card tch-assign-card" href="/teacher/broadsheet">
                  <div className="tch-class-top">
                    <h2>Teacher Broadsheet</h2>
                  </div>
                  <p className="tch-muted">Enter CA and exam scores online, review saved marks, and track assessment completion.</p>
                  <span className="tch-btn" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    Open broadsheet
                  </span>
                </a>

<a className="tch-card tch-assign-card" href="/teacher/scores">

                  <div className="tch-class-top">

                    <h2>Scores</h2>

                  </div>

                  <p className="tch-muted">Download a broadsheet for your classes and subjects, fill it in and upload it.</p>

                  <span className="tch-btn" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>

                    Open scores

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
