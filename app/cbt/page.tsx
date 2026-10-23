"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import "./cbt.css";
import Link from "next/link";

type Item = {
  id: string; kind: string; subject: string; maxScore: number; duration: number | null;
  start: string | null; end: string | null; state: string; score: number | null;
};
type Question = { id: string; question: string; option_a: string; option_b: string; option_c: string; option_d: string };
type Active = { attemptId: string; deadline: number; offset: number; questions: Question[]; answers: Record<string, string>; instructions: string | null };
type Result = { score: number; max: number; correct: number; total: number };

const nowMs = () => Date.now();

function shuffled<T>(arr: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rnd = () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : "");
const mmss = (ms: number) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return (h ? h + ":" : "") + String(m).padStart(h ? 2 : 1, "0") + ":" + String(s).padStart(2, "0");
};

export default function CbtPage() {
  const [loginId, setLoginId] = useState("");
  const [pin, setPin] = useState("");
  const [creds, setCreds] = useState<{ loginId: string; pin: string } | null>(null);
  const [me, setMe] = useState<{ name: string; className: string } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<Active | null>(null);
  const [idx, setIdx] = useState(0);
  const [left, setLeft] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const submitting = useRef(false);

  const call = useCallback(
    async (c: { loginId: string; pin: string }, body: Record<string, unknown>) => {
      const res = await fetch("/api/cbt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...c, ...body }),
      });
      return res.json();
    },
    []
  );

  const errText = (s: string) =>
    ({
      locked: "Too many wrong attempts. Please wait 15 minutes.",
      invalid: "Invalid Login ID or PIN.",
      already_submitted: "You have already submitted this one.",
      expired: "Your time for this one has ended.",
      not_open: "This is not open yet.",
      closed: "This has closed.",
      not_allowed: "You cannot open this.",
    } as Record<string, string>)[s] ?? "Something went wrong. Try again.";

  async function login(e: FormEvent) {
    e.preventDefault();
    setMsg("");
    const c = { loginId: loginId.trim(), pin: pin.trim() };
    if (!c.loginId || !/^\d{4}$/.test(c.pin)) return setMsg("Enter your Login ID and 4-digit PIN.");
    setBusy(true);
    try {
      const d = await call(c, { action: "list" });
      if (d.status !== "ok") return setMsg(errText(d.status));
      setCreds(c); setMe(d.student); setItems(d.items);
    } catch { setMsg("Could not reach the server."); }
    finally { setBusy(false); }
  }

  async function refresh() {
    if (!creds) return;
    const d = await call(creds, { action: "list" });
    if (d.status === "ok") setItems(d.items);
  }

  async function start(id: string) {
    if (!creds) return;
    setMsg(""); setBusy(true); setResult(null);
    try {
      const d = await call(creds, { action: "start", assessmentId: id });
      if (d.status !== "ok") { setMsg(errText(d.status)); return refresh(); }
      submitting.current = false;
      setActive({
        attemptId: d.attemptId, deadline: new Date(d.deadline).getTime(),
        offset: d.serverNow - nowMs(), questions: shuffled<Question>(d.questions, d.attemptId),
        answers: d.answers ?? {}, instructions: d.instructions,
      });
      setIdx(0);
    } catch { setMsg("Could not reach the server."); }
    finally { setBusy(false); }
  }

  const submit = useCallback(async () => {
    if (!creds || !active || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      const d = await call(creds, { action: "submit", attemptId: active.attemptId });
      if (d.status === "ok") { setResult(d); setActive(null); refresh(); }
      else { submitting.current = false; setMsg(errText(d.status)); }
    } catch { submitting.current = false; setMsg("Could not submit. Check your connection and press Submit again."); }
    finally { setBusy(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creds, active, call]);

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const remaining = active.deadline - (nowMs() + active.offset);
      setLeft(remaining);
      if (remaining <= 0) submit();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [active, submit]);

  async function choose(q: Question, letter: string) {
    if (!creds || !active) return;
    setActive({ ...active, answers: { ...active.answers, [q.id]: letter } });
    try {
      await call(creds, { action: "save", attemptId: active.attemptId, questionId: q.id, chosen: letter });
    } catch { setMsg("Answer not saved yet. Check your connection."); }
  }

  const header = (
    <div className="cbt-top">
      <h1>DE KINGS PERFECTION PRIVATE SCHOOL — TESTS &amp; EXAMS</h1>
                  {me ? <span>{me.name} · {me.className}</span> : <Link href="/" className="home-btn">← Home</Link>}
    </div>
  );

  // ---------- taking ----------
  if (active) {
    const q = active.questions[idx];
    const answered = Object.keys(active.answers).length;
    return (
      <div className="cbt">
        {header}
        <div className="cbt-wrap">
          <div className="cbt-card cbt-item">
            <span className="cbt-timer">⏱ {mmss(left)}</span>
            <span>{answered}/{active.questions.length} answered</span>
          </div>
          {msg && <div className="cbt-err">{msg}</div>}
          {q ? (
            <div className="cbt-card">
              {idx === 0 && active.instructions && <p style={{ marginBottom: 12, color: "#687385" }}>{active.instructions}</p>}
              <h3>Question {idx + 1} of {active.questions.length}</h3>
              <p style={{ margin: "8px 0 16px", whiteSpace: "pre-wrap" }}>{q.question}</p>
              {(["A", "B", "C", "D"] as const).map((L) => {
                const text = q[`option_${L.toLowerCase()}` as "option_a"];
                if (!text) return null;
                return (
                  <button key={L} className={`cbt-opt${active.answers[q.id] === L ? " sel" : ""}`} onClick={() => choose(q, L)}>
                    <b>{L}.</b> {text}
                  </button>
                );
              })}
              <div className="cbt-nav">
                <button className="cbt-btn alt" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>Previous</button>
                {idx < active.questions.length - 1 ? (
                  <button className="cbt-btn" onClick={() => setIdx(idx + 1)}>Next</button>
                ) : (
                  <button className="cbt-btn" disabled={busy} onClick={() => { if (confirm("Submit now? You cannot change answers after this.")) submit(); }}>Submit</button>
                )}
              </div>
              <div className="cbt-dots">
                {active.questions.map((x, i) => (
                  <button key={x.id} className={`cbt-dot${active.answers[x.id] ? " done" : ""}${i === idx ? " cur" : ""}`} onClick={() => setIdx(i)}>{i + 1}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="cbt-card">
              <p>No questions have been added yet. Contact your teacher.</p>
              <button className="cbt-btn" onClick={submit}>Leave</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ---------- login ----------
  if (!creds) {
    return (
      <div className="cbt">
        {header}
        <div className="cbt-wrap">
          <form className="cbt-card" onSubmit={login}>
            <h2>Student Login</h2>
            <p style={{ color: "#687385", marginBottom: 14 }}>Use your Student Login ID and 4-digit PIN.</p>
            <input placeholder="Login ID" value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="off" />
            <input placeholder="4-digit PIN" type="password" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="new-password" />
            {msg && <div className="cbt-err">{msg}</div>}
            <button className="cbt-btn" disabled={busy}>{busy ? "Checking..." : "Login"}</button>
          </form>
        </div>
      </div>
    );
  }

  // ---------- list / result ----------
  return (
    <div className="cbt">
      {header}
      <div className="cbt-wrap">
        {result && (
          <div className="cbt-card" style={{ textAlign: "center" }}>
            <h2>Submitted</h2>
            <p>Your answers have been received. Your teacher will give you your result.</p>
          </div>
        )}
        {msg && <div className="cbt-err">{msg}</div>}
        <h2 style={{ margin: "6px 0 12px", color: "#071f3d" }}>Your tests and exams</h2>
        {items.length === 0 && <div className="cbt-card">Nothing is available for your class right now.</div>}
        {items.map((it) => (
          <div className="cbt-card cbt-item" key={it.id}>
            <div>
              <span className="cbt-tag">{it.kind === "exam" ? "Exam" : "Test"}</span>
              <h3 style={{ marginTop: 6 }}>{it.subject}</h3>
              <small style={{ color: "#687385" }}>
                {it.duration ? `${it.duration} min · ` : ""}{it.maxScore} marks
                {it.end ? ` · closes ${fmt(it.end)}` : ""}
              </small>
            </div>
            <div style={{ textAlign: "right" }}>
              {it.state === "submitted" && <b>Submitted</b>}
              {it.state === "open" && <button className="cbt-btn" disabled={busy} onClick={() => start(it.id)}>Start</button>}
              {it.state === "in_progress" && <button className="cbt-btn" disabled={busy} onClick={() => start(it.id)}>Resume</button>}
              {it.state === "upcoming" && <small>Opens {fmt(it.start)}</small>}
              {(it.state === "closed" || it.state === "expired") && <small>Closed</small>}
            </div>
          </div>
        ))}
        <button className="cbt-btn alt" onClick={() => { setCreds(null); setMe(null); setPin(""); setResult(null); }}>Log out</button>
      </div>
    </div>
  );
}
