"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import "../cbt/cbt.css";
import "../dashboard/dashboard.css";
import "./assignments.css";

type Creds = { loginId: string; pin: string };
type Item = {
  id: string; subject: string; title: string; instructions: string | null;
  maxScore: number; dueAt: string | null; state: string;
  answer: string | null; files: { name: string; type: string }[];
  submittedAt: string | null; score: number | null; comment: string | null;
};

const ALLOWED = ["image/jpeg", "image/png", "application/pdf"];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 3;
const STORE = "dkpsStudent";
const fmt = (s: string | null) => s ? new Date(s).toLocaleString() : "";

function tone(score: number, max: number) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  if (pct >= 60) return { c: "#1a8f4c", bg: "#e8f6ee" };
  if (pct >= 45) return { c: "#c98a00", bg: "#fff6dc" };
  return { c: "#c62828", bg: "#fdeaea" };
}

function Mark({ score, max, size }: { score: number; max: number; size: "big" | "small" }) {
  const t = tone(score, max);
  return (
    <span className={`as-mark ${size === "big" ? "as-mark-big" : ""}`}
      aria-label={`${score} out of ${max}`}
      style={{ borderColor: t.c, color: t.c, background: t.bg }}>
      {score}/{max}
    </span>
  );
}

function statusLabel(state: string) {
  if (state === "marked") return "Marked";
  if (state === "submitted") return "Submitted";
  if (state === "closed") return "Closed";
  return "To Do";
}

export default function AssignmentsPage() {
  const [loginId, setLoginId] = useState("");
  const [pin, setPin] = useState("");
  const [creds, setCreds] = useState<Creds | null>(null);
  const [me, setMe] = useState<{ name: string; className: string } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [picked, setPicked] = useState<File[]>([]);
  const router = useRouter();
  const entered = useRef(false);
  const sessionVersion = useRef(0);
  const studentId = useRef<string | null>(null);
  const current = useCallback((version: number, id: string) => {
    if (sessionVersion.current !== version || studentId.current !== id) return false;
    try { return JSON.parse(sessionStorage.getItem(STORE) || "null")?.loginId === id; }
    catch { return false; }
  }, []);
  const clearStudent = () => {
    setCreds(null); setMe(null); setItems([]); setOpenId(null);
    setAnswer(""); setPicked([]); setMsg(""); setPin(""); setLoginId("");
    setBusy(false);
  };

  const call = useCallback(async (c: Creds, body: Record<string, unknown>) => {
    const res = await fetch("/api/assignments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...c, ...body }),
    });
    return res.json();
  }, []);

  useEffect(() => {
    if (!entered.current) {
      if (sessionStorage.getItem("dkpsVia") !== "/assignments") {
        router.replace("/dashboard");
        return;
      }
      sessionStorage.removeItem("dkpsVia");
      entered.current = true;
    }
    const version = ++sessionVersion.current;
    let cancelled = false;
    studentId.current = null;
    let saved: Creds | null = null;
    try { saved = JSON.parse(sessionStorage.getItem(STORE) || "null"); }
    catch { /* invalid storage */ }
    const run = async () => {
      if (saved?.loginId && saved?.pin) {
        try {
          const d = await call(saved, { action: "list" });
          if (cancelled || sessionVersion.current !== version) return;
          const stored = JSON.parse(sessionStorage.getItem(STORE) || "null");
          if (d.status === "ok" && stored?.loginId === saved.loginId && stored?.pin === saved.pin) {
            studentId.current = saved.loginId;
            setCreds(saved); setMe(d.student); setItems(d.items);
            setChecking(false); return;
          }
          if (stored?.loginId === saved.loginId && stored?.pin === saved.pin)
            sessionStorage.removeItem(STORE);
        } catch { if (cancelled || sessionVersion.current !== version) return; }
      }
      if (!cancelled && sessionVersion.current === version) router.replace("/dashboard");
    };
    void run();
    return () => { cancelled = true; sessionVersion.current++; };
  }, [call, router]);

  const errText = (s: string) => ({
    locked: "Too many wrong attempts. Please wait 15 minutes.",
    invalid: "Invalid Login ID or PIN.",
    closed: "The deadline for this assignment has passed.",
    already_marked: "This assignment has already been marked.",
    not_allowed: "You cannot open this assignment.",
    bad_type: "Only JPG, PNG or PDF files are allowed.",
    too_many: `You can attach at most ${MAX_FILES} files.`,
    empty: "Type your answer or attach a file first.",
  } as Record<string, string>)[s] ?? "Something went wrong. Try again.";

  async function login(e: FormEvent) {
    e.preventDefault(); setMsg("");
    const c = { loginId: loginId.trim(), pin: pin.trim() };
    if (!c.loginId || !/^\d{4}$/.test(c.pin)) {
      setMsg("Enter your Login ID and 4-digit PIN."); return;
    }
    const version = ++sessionVersion.current;
    studentId.current = null;
    setCreds(null); setMe(null); setItems([]); setOpenId(null);
    sessionStorage.removeItem(STORE);
    setBusy(true);
    try {
      const d = await call(c, { action: "list" });
      if (sessionVersion.current !== version) return;
      if (d.status !== "ok") { setMsg(errText(d.status)); return; }
      sessionStorage.setItem(STORE, JSON.stringify(c));
      studentId.current = c.loginId;
      setCreds(c); setMe(d.student); setItems(d.items);
    } catch {
      if (sessionVersion.current === version) setMsg("Could not reach the server.");
    } finally {
      if (sessionVersion.current === version) setBusy(false);
    }
  }

  async function refresh(c: Creds, version: number) {
    try {
      const d = await call(c, { action: "list" });
      if (current(version, c.loginId) && d.status === "ok") setItems(d.items);
    } catch {
      if (current(version, c.loginId)) setMsg("Could not refresh assignments.");
    }
  }

  function logout() {
    sessionVersion.current++;
    studentId.current = null;
    sessionStorage.removeItem(STORE);
    sessionStorage.removeItem("dkpsVia");
    clearStudent();
    router.replace("/dashboard");
  }

  function open(it: Item) {
    setOpenId(it.id); setAnswer(it.answer ?? ""); setPicked([]); setMsg("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function back() {
    setOpenId(null); setPicked([]); setMsg("");
  }

  function onPick(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length > MAX_FILES) {
      setMsg(`You can attach at most ${MAX_FILES} files.`); return;
    }
    for (const f of files) {
      if (!ALLOWED.includes(f.type)) {
        setMsg(`"${f.name}" is not allowed. Use JPG, PNG or PDF.`); return;
      }
      if (f.size > MAX_BYTES) {
        setMsg(`"${f.name}" is bigger than 5 MB.`); return;
      }
    }
    setMsg(""); setPicked(files);
  }

  async function submit() {
    if (!creds || !openId || busy) return;
    const c = creds;
    const version = sessionVersion.current;
    const assignmentId = openId;
    if (!current(version, c.loginId)) return;
    setBusy(true); setMsg("");
    try {
      const refs: { path: string; name: string; type: string }[] = [];
      for (const f of picked) {
        if (!current(version, c.loginId)) return;
        const u = await call(c, {
          action: "upload_url", assignmentId, contentType: f.type,
        });
        if (!current(version, c.loginId)) return;
        if (u.status !== "ok") { setMsg(errText(u.status)); return; }
        const fd = new FormData();
        fd.append("cacheControl", "3600");
        fd.append("", f);
        const r = await fetch(u.uploadUrl, { method: "PUT", body: fd });
        if (!current(version, c.loginId)) return;
        if (!r.ok) {
          setMsg(`Could not upload "${f.name}". Try again or use a smaller file.`);
          return;
        }
        refs.push({ path: u.path, name: f.name, type: f.type });
      }
      if (!current(version, c.loginId)) return;
      const d = await call(c, {
        action: "submit", assignmentId, answer, files: refs,
      });
      if (!current(version, c.loginId)) return;
      if (d.status !== "ok") { setMsg(errText(d.status)); return; }
      setOpenId(null); setPicked([]);
      await refresh(c, version);
      if (current(version, c.loginId)) setMsg("Submitted. Your teacher will mark it.");
    } catch {
      if (current(version, c.loginId))
        setMsg("Could not submit. Check your connection and try again.");
    } finally {
      if (current(version, c.loginId)) setBusy(false);
    }
  }

  const header = (
    <header className="as-header">
      <div className="as-header-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/kps-logo.png" alt="DKPS logo" className="as-logo" />
        <div className="as-brand">
          <strong>Student Portal</strong>
          <small>De Kings Perfection Private School</small>
        </div>
        {me && <div className="as-person">
          <strong>{me.name}</strong><small>{me.className}</small>
        </div>}
      </div>
    </header>
  );

  if (!creds && checking) return (
    <div className="cbt as-page">{header}
      <main className="as-container"><div className="as-panel">Loading assignments…</div></main>
    </div>
  );

  if (!creds) return (
    <div className="cbt as-page">{header}
      <main className="as-container as-login-container">
        <form className="as-panel as-login" onSubmit={login}>
          <h1>Student Login</h1>
          <p>Use your Student Login ID and 4-digit PIN.</p>
          <label htmlFor="as-id">Student Login ID</label>
          <input id="as-id" value={loginId} onChange={(e) => setLoginId(e.target.value.toUpperCase())} autoComplete="off" autoCapitalize="characters" required />
          <label htmlFor="as-pin">4-digit PIN</label>
          <input id="as-pin" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="new-password" required />
          {msg && <div className="as-message as-error" role="alert">{msg}</div>}
          <button className="as-primary" disabled={busy}>{busy ? "Checking…" : "Login"}</button>
          <Link href="/dashboard" className="as-text-link">Back to dashboard</Link>
        </form>
      </main>
    </div>
  );

  const cur = items.find((x) => x.id === openId);
  const todoCount = items.filter((x) => x.state === "open").length;
  const submittedCount = items.filter((x) => x.state === "submitted").length;
  const markedCount = items.filter((x) => x.state === "marked").length;

  if (cur) {
    const locked = cur.state === "marked" || cur.state === "closed";
    return (
      <div className="cbt as-page">{header}
        <main className="as-container">
          <button type="button" className="as-back" onClick={back}>← Back to Assignments</button>
          {msg && <div className="as-message as-error" role="alert">{msg}</div>}
          <article className="as-panel as-detail">
            <div className="as-detail-top">
              <span className={`as-status as-status-${cur.state}`}>{statusLabel(cur.state)}</span>
              <span className="as-muted">{cur.maxScore} marks</span>
            </div>
            <span className="as-subject">{cur.subject}</span>
            <h1>{cur.title}</h1>
            {cur.dueAt && <p className="as-meta">Deadline: {fmt(cur.dueAt)}</p>}
            {cur.submittedAt && <p className="as-meta">Submitted: {fmt(cur.submittedAt)}</p>}
            <div className="as-separator" />
            <section className="as-detail-section">
              <h2>Teacher&apos;s Instructions</h2>
              <p className="as-instructions">{cur.instructions || "No additional instructions provided."}</p>
            </section>
            {cur.state === "marked" && (
              <section className="as-feedback">
                <h2>Your Mark</h2>
                <Mark score={cur.score ?? 0} max={cur.maxScore} size="big" />
                {cur.comment && <p className="as-comment"><strong>Teacher&apos;s comment:</strong> {cur.comment}</p>}
              </section>
            )}
            {cur.state === "closed" && !cur.submittedAt && (
              <p className="as-message as-error">The deadline has passed and nothing was submitted.</p>
            )}
            <section className="as-detail-section">
              <label className="as-section-label" htmlFor="as-answer">Your Answer</label>
              <textarea id="as-answer" rows={8} value={answer} disabled={locked}
                onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer here…" />
            </section>
            {cur.files.length > 0 && (
              <section className="as-detail-section">
                <h2>Already Attached</h2>
                <ul className="as-file-list">{cur.files.map((f, i) => <li key={`${f.name}-${i}`}>{f.name}</li>)}</ul>
              </section>
            )}
            {!locked && (
              <section className="as-detail-section">
                <label className="as-section-label" htmlFor="as-files">Attachments</label>
                <div className="as-upload">
                  <span className="as-upload-title">Choose photos or PDF files</span>
                  <p>JPG, PNG or PDF · Maximum 3 files · 5 MB each</p>
                  <input id="as-files" type="file" multiple accept="image/jpeg,image/png,application/pdf"
                    onChange={(e) => onPick(e.target.files)} />
                </div>
                {picked.length > 0 && <div className="as-picked">
                  <strong>Selected files</strong>
                  <ul>{picked.map((f, i) => <li key={`${f.name}-${i}`}>{f.name}</li>)}</ul>
                  {cur.files.length > 0 && <small>These will replace your previously attached files.</small>}
                </div>}
              </section>
            )}
            <div className="as-actions">
              <button type="button" className="as-secondary" disabled={busy} onClick={back}>Back</button>
              {!locked && <button type="button" className="as-primary" disabled={busy} onClick={submit}>
                {busy ? "Sending…" : cur.state === "submitted" ? "Resubmit Assignment" : "Submit Assignment"}
              </button>}
            </div>
          </article>
        </main>
      </div>
    );
  }

  return (
    <div className="cbt as-page">{header}
      <main className="as-container">
        <section className="as-hero">
          <span>MY LEARNING SPACE</span>
          <h1>Your Assignments</h1>
          <p>View your schoolwork, submit answers and track your marks.</p>
        </section>
        <section className="as-stats" aria-label="Assignment summary">
          <div className="as-stat"><strong>{todoCount}</strong><span>To Do</span></div>
          <div className="as-stat"><strong>{submittedCount}</strong><span>Submitted</span></div>
          <div className="as-stat"><strong>{markedCount}</strong><span>Marked</span></div>
        </section>
        {msg && <div className={`as-message ${msg.startsWith("Submitted.") ? "as-success" : "as-error"}`} role="status">{msg}</div>}
        <h2 className="as-list-heading">All Assignments</h2>
        {items.length === 0 ? (
          <div className="as-panel as-empty">There are no assignments for your class right now.</div>
        ) : (
          <section className="as-grid" aria-label="Assignment list">
            {items.map((it) => (
              <article className="as-panel as-item" key={it.id}>
                <div className="as-item-top">
                  <span className={`as-status as-status-${it.state}`}>{statusLabel(it.state)}</span>
                  <span className="as-muted">{it.maxScore} marks</span>
                </div>
                <span className="as-subject">{it.subject}</span>
                <h3>{it.title}</h3>
                {it.dueAt && <p className="as-meta">Deadline: {fmt(it.dueAt)}</p>}
                {it.state === "submitted" && <p className="as-meta">Awaiting marking</p>}
                <div className="as-item-bottom">
                  {it.state === "marked" ? <Mark score={it.score ?? 0} max={it.maxScore} size="small" /> : <span />}
                  <button type="button" className="as-primary" onClick={() => open(it)}>
                    {it.state === "open" ? "Open Assignment" : it.state === "submitted" ? "View / Edit" : "View Assignment"}
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
        <div className="as-footer-actions">
          <Link href="/dashboard" className="as-secondary">← Back to dashboard</Link>
          <button type="button" className="as-logout" onClick={logout}>Log out</button>
        </div>
      </main>
    </div>
  );
}
