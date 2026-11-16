"use client";

import "./teacher-profile-avatar.css";
import "./teacher-desktop-profile-menu.css";
import "./teacher-header-notifications.css";



import { FormEvent, useEffect, useRef, useState } from "react";

import "./teacher.css";
import "./teacher-continue.css";
import ContinueWorking from "./ContinueWorking";
import TeacherAvatar from "./TeacherAvatar";
import QuickActions from "./QuickActions";
import AcademicTermIndicator from "./AcademicTermIndicator";
import "./teacher-academic-term.css";
import "./teacher-quick-actions.css";
import "./teacher-dashboard-overview.css";



type Subject = { id: string; name: string };

type ClassCard = {

  id: string;

  name: string;

  isClassTeacher: boolean;

  studentCount: number;

  subjects: Subject[];

};

type Me = { teacher: { name: string; email: string }; classes: ClassCard[] };

type DashboardStats = { pendingTasks: number | null; missingScores: number | null; drafts?: number; unmarked?: number; noActiveTerm?: boolean };

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
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [statsError, setStatsError] = useState(false);



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

  async function loadNotes() {

    try {

      const res = await fetch("/api/teacher/notifications");

      if (res.ok) setNotes((await res.json()).items ?? []);

    } catch { /* the bell just stays empty */ }

  }

  useEffect(() => { if (me) loadNotes(); }, [me]);

  useEffect(() => {
    if (!me) { setDashboardStats(null); setStatsError(false); return; }
    const controller = new AbortController();
    setDashboardStats(null);
    setStatsError(false);
    fetch("/api/teacher/dashboard-stats", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Stats request failed");
        return res.json() as Promise<DashboardStats>;
      })
      .then((data) => { if (!controller.signal.aborted) setDashboardStats(data); })
      .catch(() => { if (!controller.signal.aborted) setStatsError(true); });
    return () => controller.abort();
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
  const [notificationTab, setNotificationTab] = useState<"all" | "unread" | "read">("unread");
  const [showScoreOptions, setShowScoreOptions] = useState(false);
  const [showReviewOptions, setShowReviewOptions] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [notificationMenuOpen, setNotificationMenuOpen] = useState(false);
  const notificationMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileMenuOpen]);


  useEffect(() => {
    if (!notificationMenuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!notificationMenuRef.current?.contains(event.target as Node)) setNotificationMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotificationMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [notificationMenuOpen]);

  const totalStudents = me?.classes.reduce((total, c) => total + c.studentCount, 0) ?? 0;

  const unreadNotes = notes.filter((n) => !n.read);

  const unread = unreadNotes.length;

  const filteredNotes = notes.filter((n) =>
    notificationTab === "all" ? true : notificationTab === "unread" ? !n.read : n.read
  );
  const notificationTabs = (
    <div className="tch-notification-tabs" role="group" aria-label="Filter notifications">
      {(["all", "unread", "read"] as const).map((tab) => (
        <button key={tab} type="button" aria-pressed={notificationTab === tab}
          className={notificationTab === tab ? "active" : ""}
          onClick={() => setNotificationTab(tab)}>
          {tab === "all" ? `All (${notes.length})` : tab === "unread" ? `Unread (${unread})` : `Read (${notes.length - unread})`}
        </button>
      ))}
    </div>
  );
  const emptyNotificationMessage = notificationTab === "unread"
    ? "You are all caught up. Nothing new is waiting."
    : notificationTab === "read" ? "No read notifications yet." : "No notifications yet.";

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

              <div className="tch-notification-menu-wrap" ref={notificationMenuRef}>
                <button
                  type="button"
                  className="tch-notification-trigger"
                  aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications, none unread"}
                  aria-expanded={notificationMenuOpen}
                  aria-controls="tch-notification-dropdown"
                  onClick={() => { setProfileMenuOpen(false); setNotificationMenuOpen((open) => !open); }}
                >
                  <span aria-hidden="true">🔔</span>
                  {unread > 0 && <span className="tch-notification-badge">{unread}</span>}
                </button>
                {notificationMenuOpen && (
                  <div id="tch-notification-dropdown" className="tch-notification-dropdown">
                    <div className="tch-notification-dropdown-head">
                      <strong>Notifications</strong>
                      {unread > 0 && <button type="button" onClick={() => void readAllNotes()}>Mark all as read</button>}
                    </div>
                    {notificationTabs}
                    <div className="tch-notification-dropdown-list">
                      {filteredNotes.length === 0 ? (
                        <p className="tch-muted">{emptyNotificationMessage}</p>
                      ) : (
                        filteredNotes.slice(0, 5).map(noteRow)
                      )}
                    </div>
                    {notes.length > 0 && (
                      <button type="button" className="tch-notification-view-all" onClick={() => { setNotificationMenuOpen(false); setShowAll(true); }}>
                        View all notifications
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="tch-profile-menu-wrap" ref={profileMenuRef}>
                <button
                  type="button"
                  className="tch-profile-avatar tch-profile-menu-trigger"
                  aria-label="Open teacher account menu"
                  aria-haspopup="menu"
                  aria-expanded={profileMenuOpen}
                  aria-controls="tch-profile-menu"
                  onClick={() => { setNotificationMenuOpen(false); setProfileMenuOpen((open) => !open); }}
                >
                  <TeacherAvatar name={me.teacher.name} />
                </button>
                {profileMenuOpen && (
                  <div id="tch-profile-menu" className="tch-profile-dropdown" role="menu">
                    <a href="/teacher/profile" role="menuitem" onClick={() => setProfileMenuOpen(false)}>
                      Profile &amp; Settings
                    </a>
                    <button type="button" role="menuitem" onClick={() => { setProfileMenuOpen(false); void signOut(); }}>
                      Log out
                    </button>
                  </div>
                )}
              </div>

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



            <AcademicTermIndicator />

            <div className="tch-overview" aria-label="Teacher dashboard overview">
              <div className="tch-overview-item">
                <span className="tch-overview-label">My Classes</span>
                <strong className="tch-overview-number">{me.classes.length}</strong>
                <span className="tch-overview-detail">Assigned classes</span>
              </div>
              <div className="tch-overview-item">
                <span className="tch-overview-label">My Students</span>
                <strong className="tch-overview-number">{totalStudents}</strong>
                <span className="tch-overview-detail">Across my classes</span>
              </div>
              <div className="tch-overview-item">
                <span className="tch-overview-label">Pending Tasks</span>
                <strong className={dashboardStats?.pendingTasks != null ? "tch-overview-number" : "tch-overview-pending"}>
                  {statsError ? "Unavailable" : dashboardStats?.noActiveTerm ? "—" : dashboardStats?.pendingTasks ?? "Loading…"}
                </strong>
                <span className="tch-overview-detail">{statsError ? "Could not load task data" : dashboardStats?.noActiveTerm ? "No active term" : dashboardStats ? `${dashboardStats.drafts ?? 0} drafts · ${dashboardStats.unmarked ?? 0} unmarked submissions` : "Checking assignments and tests"}</span>
              </div>
              <div className="tch-overview-item">
                <span className="tch-overview-label">Missing Scores</span>
                <strong className={dashboardStats?.missingScores != null ? "tch-overview-number" : "tch-overview-pending"}>
                  {statsError ? "Unavailable" : dashboardStats?.noActiveTerm ? "—" : dashboardStats?.missingScores ?? "Loading…"}
                </strong>
                <span className="tch-overview-detail">{statsError ? "Could not load score data" : dashboardStats?.noActiveTerm ? "No active term" : "Outstanding CA and exam marks"}</span>
              </div>
            </div>

            <ContinueWorking email={me.teacher.email} />
            <QuickActions />

            <a href="/teacher/score-history" className="tch-history-row">
              <span className="tch-history-icon" aria-hidden="true">↺</span>
              <span className="tch-history-copy">
                <strong>Score Editing History</strong>
                <small>Review score changes and who made them</small>
              </span>
              <span className="tch-history-arrow" aria-hidden="true">›</span>
            </a>

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

                    <h2 style={{ margin: 0, fontSize: "1.1rem" }}>🔔 Notifications ({notes.length})</h2>

                    <button type="button" aria-label="Close" onClick={() => setShowAll(false)} style={{ border: 0, background: "transparent", fontSize: "1.6rem", lineHeight: 1, cursor: "pointer", color: "#55627a" }}>×</button>

                  </div>

                  {unread > 0 && (

                    <div style={{ padding: "0 18px" }}>

                      <button type="button" className="tch-link" onClick={readAllNotes}>Mark all as read</button>

                    </div>

                  )}

                  <div style={{ padding: "8px 18px" }}>{notificationTabs}</div>
                  <div style={{ overflowY: "auto", padding: "0 18px 18px" }}>
                    {filteredNotes.length ? filteredNotes.map(noteRow) : <p className="tch-muted">{emptyNotificationMessage}</p>}
                  </div>

                </div>

              </div>

            )}



            <div className="tch-tools-heading">
              <h2>Teacher Tools</h2>
              <p className="tch-muted">Manage assignments, assessments, scores, and your classes.</p>
            </div>

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

                <button
                  type="button"
                  className="tch-card tch-assign-card"
                  onClick={() => setShowScoreOptions(true)}
                  aria-haspopup="dialog"
                  style={{textAlign:"left",width:"100%",font:"inherit",color:"inherit",cursor:"pointer"}}
                >
                  <div className="tch-class-top"><h2>Score Management</h2></div>
                  <p className="tch-muted">Enter and manage student scores using the online or Excel broadsheet.</p>
                  <span className="tch-btn" style={{display:"inline-flex",alignItems:"center",justifyContent:"center"}}>Manage scores</span>
                </button>

                <button
                  type="button"
                  className="tch-card tch-assign-card"
                  onClick={() => setShowReviewOptions(true)}
                  aria-haspopup="dialog"
                  style={{textAlign:"left",width:"100%",font:"inherit",color:"inherit",cursor:"pointer"}}
                >
                  <div className="tch-class-top"><h2>Score Review &amp; Corrections</h2></div>
                  <p className="tch-muted">Submit scores for Admin approval, track reviews, or request corrections to published results.</p>
                  <span className="tch-btn" style={{display:"inline-flex",alignItems:"center",justifyContent:"center"}}>Manage score reviews</span>
                </button>

                <a className="tch-card tch-assign-card" href="/teacher/classes">
                  <div className="tch-class-top"><h2>My Classes</h2><span className="tch-badge">{me.classes.length} assigned</span></div>
                  <p className="tch-muted">View your assigned classes, subjects, and student lists in one place.</p>
                  <span className="tch-btn" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>View my classes</span>
                </a>

              </div>

            )}

          </section>

        )}



        {showScoreOptions && !checking && me && !openClass && (
          <div
            role="presentation"
            onMouseDown={(e) => { if (e.target === e.currentTarget) setShowScoreOptions(false); }}
            style={{position:"fixed",inset:0,zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:16,background:"rgba(7,31,61,.6)"}}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="score-options-title"
              onKeyDown={(e) => { if (e.key === "Escape") setShowScoreOptions(false); }}
              style={{width:"100%",maxWidth:420,background:"#fff",borderRadius:14,padding:24,boxShadow:"0 20px 55px rgba(7,31,61,.28)"}}
            >
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
                <div>
                  <h2 id="score-options-title" style={{margin:"0 0 8px",color:"#071f3d"}}>Choose Broadsheet</h2>
                  <p className="tch-muted" style={{margin:"0 0 20px"}}>How would you like to manage scores?</p>
                </div>
                <button type="button" aria-label="Close score options" onClick={() => setShowScoreOptions(false)} style={{border:0,background:"transparent",fontSize:24,cursor:"pointer",color:"#55627a"}}>×</button>
              </div>
              <div style={{display:"grid",gap:12}}>
                <a href="/teacher/broadsheet" className="tch-btn" style={{display:"flex",justifyContent:"center",alignItems:"center",textDecoration:"none",minHeight:48}}>Online Broadsheet</a>
                <a href="/teacher/scores" className="tch-btn" style={{display:"flex",justifyContent:"center",alignItems:"center",textDecoration:"none",minHeight:48}}>Excel Broadsheet</a>
              </div>
            </section>
          </div>
        )}

        {showReviewOptions && !checking && me && !openClass && (
          <div
            role="presentation"
            onMouseDown={(e) => { if (e.target === e.currentTarget) setShowReviewOptions(false); }}
            style={{position:"fixed",inset:0,zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:16,background:"rgba(7,31,61,.6)"}}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="review-options-title"
              onKeyDown={(e) => { if (e.key === "Escape") setShowReviewOptions(false); }}
              style={{width:"100%",maxWidth:420,background:"#fff",borderRadius:14,padding:24,boxShadow:"0 20px 55px rgba(7,31,61,.28)"}}
            >
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:12}}>
                <div>
                  <h2 id="review-options-title" style={{margin:"0 0 8px",color:"#071f3d"}}>Score Review &amp; Corrections</h2>
                  <p className="tch-muted" style={{margin:"0 0 20px"}}>What would you like to do?</p>
                </div>
                <button type="button" aria-label="Close review options" onClick={() => setShowReviewOptions(false)} style={{border:0,background:"transparent",fontSize:24,cursor:"pointer",color:"#55627a"}}>×</button>
              </div>
              <div style={{display:"grid",gap:12}}>
                <a href="/teacher/score-submissions" className="tch-btn" style={{display:"flex",justifyContent:"center",alignItems:"center",textDecoration:"none",minHeight:48,textAlign:"center"}}>Score Submissions &amp; Approval</a>
                <a href="/teacher/published-corrections" className="tch-btn" style={{display:"flex",justifyContent:"center",alignItems:"center",textDecoration:"none",minHeight:48,textAlign:"center"}}>Published Result Corrections</a>
              </div>
            </section>
          </div>
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
