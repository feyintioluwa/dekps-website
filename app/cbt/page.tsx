
"use client";
import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DialogProvider, useConfirm } from "@/lib/dialog";
import "./cbt.css";
import "../dashboard/dashboard.css";
type Credentials = { loginId: string; pin: string };
type Student = { name: string; className: string };
type Item = {
  id: string;
  kind: string;
  subject: string;
  maxScore: number;
  duration: number | null;
  start: string | null;
  end: string | null;
  state: string;
  score: number | null;
};
type Question = {
  id: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
};
type Active = {
  attemptId: string;
  deadline: number;
  offset: number;
  questions: Question[];
  answers: Record<string, string>;
  instructions: string | null;
};
type Result = {
  score: number;
  max: number;
  correct: number;
  total: number;
};
const STORE = "dkpsStudent";
const LETTERS = ["A", "B", "C", "D"] as const;
const nowMs = () => Date.now();
const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleString() : "";
function mmss(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return (
    (h ? h + ":" : "") +
    String(m).padStart(h ? 2 : 1, "0") +
    ":" +
    String(s).padStart(2, "0")
  );
}
function shuffled<T>(arr: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rnd = () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function statusLabel(state: string) {
  switch (state) {
    case "open": return "Available";
    case "in_progress": return "In Progress";
    case "submitted": return "Submitted";
    case "upcoming": return "Upcoming";
    case "expired": return "Expired";
    default: return "Closed";
  }
}
export default function CbtPage() {
  return (
    <DialogProvider>
      <CbtPageInner />
    </DialogProvider>
  );
}
function CbtPageInner() {
  const ask = useConfirm();
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [pin, setPin] = useState("");
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [me, setMe] = useState<Student | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [locked, setLocked] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [active, setActive] = useState<Active | null>(null);
  const [idx, setIdx] = useState(0);
  const [left, setLeft] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const entered = useRef(false);
  const sessionVersion = useRef(0);
  const studentId = useRef<string | null>(null);
  const current = useCallback((version: number, id: string) => {
    if (sessionVersion.current !== version || studentId.current !== id) return false;
    try { return JSON.parse(sessionStorage.getItem(STORE) || "null")?.loginId === id; }
    catch { return false; }
  }, []);
  const clearStudent = useCallback(() => {
    setCreds(null); setMe(null); setItems([]); setLocked(false);
    setActive(null); activeRef.current = null; setIdx(0); setLeft(0);
    setResult(null); setMsg(""); setBusy(false);
    saving.current = []; submitting.current = false; confirming.current = false;
  }, []);
  const submitting = useRef(false);
  const confirming = useRef(false);
  const saving = useRef<Promise<unknown>[]>([]);
  const activeRef = useRef<Active | null>(null);
  activeRef.current = active;
  const call = useCallback(
    async (
      c: Credentials,
      body: Record<string, unknown>
    ) => {
      const res = await fetch("/api/cbt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ ...c, ...body }),
      });
      if (!res.ok) {
        throw new Error("Server request failed");
      }
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
      test_locked:
        "Tests are locked. Enter the code from your teacher on the dashboard.",
    } as Record<string, string>)[s] ??
    "Something went wrong. Try again.";
  useEffect(() => {
    if (!entered.current) {
      if (sessionStorage.getItem("dkpsVia") !== "/cbt") {
        router.replace("/dashboard"); return;
      }
      sessionStorage.removeItem("dkpsVia");
      entered.current = true;
    }
    const version = ++sessionVersion.current;
    let cancelled = false;
    studentId.current = null;
    let saved: Credentials | null = null;
    try { saved = JSON.parse(sessionStorage.getItem(STORE) || "null"); } catch { /* invalid */ }
    const run = async () => {
      if (saved?.loginId && saved?.pin) {
        try {
          const d = await call(saved, { action: "list" });
          if (cancelled || sessionVersion.current !== version) return;
          if (d.status === "ok" && JSON.parse(sessionStorage.getItem(STORE) || "null")?.loginId === saved.loginId) {
            studentId.current = saved.loginId;
            clearStudent(); setCreds(saved); setMe(d.student);
            setItems(d.items); setLocked(!!d.locked); setChecking(false);
            return;
          }
          if (JSON.parse(sessionStorage.getItem(STORE) || "null")?.loginId === saved.loginId)
            sessionStorage.removeItem(STORE);
        } catch { if (cancelled || sessionVersion.current !== version) return; }
      }
      if (!cancelled && sessionVersion.current === version) router.replace("/dashboard");
    };
    void run();
    return () => { cancelled = true; sessionVersion.current++; };
  }, [call, router, clearStudent]);
  async function login(e: FormEvent) {
    e.preventDefault(); setMsg("");
    const c = { loginId: loginId.trim(), pin: pin.trim() };
    if (!c.loginId || !/^\d{4}$/.test(c.pin)) { setMsg("Enter your Login ID and 4-digit PIN."); return; }
    const version = ++sessionVersion.current;
    studentId.current = null; clearStudent(); setBusy(true);
    sessionStorage.removeItem(STORE);
    try {
      const d = await call(c, { action: "list" });
      if (sessionVersion.current !== version) return;
      if (d.status !== "ok") { setMsg(errText(d.status)); return; }
      sessionStorage.setItem(STORE, JSON.stringify(c));
      studentId.current = c.loginId;
      setCreds(c); setMe(d.student); setItems(d.items);
      setLocked(!!d.locked); setChecking(false);
    } catch { if (sessionVersion.current === version) setMsg("Could not reach the server."); }
    finally { if (sessionVersion.current === version) setBusy(false); }
  }
  function logout() {
    sessionVersion.current++;
    studentId.current = null;
    sessionStorage.removeItem(STORE);
    sessionStorage.removeItem("dkpsVia");
    clearStudent(); setChecking(true);
    router.replace("/dashboard");
  }
  const refresh = useCallback(async () => {
    if (!creds) return;
    const version = sessionVersion.current;
    try {
      const d = await call(creds, { action: "list" });
      if (!current(version, creds.loginId)) return;
      if (d.status === "ok") { setItems(d.items); setLocked(!!d.locked); }
    } catch { if (current(version, creds.loginId)) setMsg("Could not refresh assessments."); }
  }, [creds, call, current]);
  async function start(id: string) {
    if (!creds || busy) return;
    const version = sessionVersion.current;
    setMsg(""); setBusy(true); setResult(null);
    try {
      const d = await call(creds, { action: "start", assessmentId: id });
      if (!current(version, creds.loginId)) return;
      if (d.status !== "ok") { setMsg(errText(d.status)); await refresh(); return; }
      submitting.current = false; confirming.current = false; saving.current = [];
      setActive({
        attemptId: d.attemptId,
        deadline: new Date(d.deadline).getTime(),
        offset: d.serverNow - nowMs(),
        questions: shuffled<Question>(d.questions, d.attemptId),
        answers: d.answers ?? {}, instructions: d.instructions,
      });
      setIdx(0);
    } catch { if (current(version, creds.loginId)) setMsg("Could not reach the server."); }
    finally { if (current(version, creds.loginId)) setBusy(false); }
  }
  const submit = useCallback(async () => {
    if (!creds || !active || submitting.current) return;
    const version = sessionVersion.current;
    submitting.current = true; setBusy(true); setMsg("");
    try {
      await Promise.allSettled([...saving.current]);
      if (!current(version, creds.loginId)) return;
      const d = await call(creds, { action: "submit", attemptId: active.attemptId });
      if (!current(version, creds.loginId)) return;
      if (d.status === "ok") { setResult(d); setActive(null); void refresh(); }
      else { submitting.current = false; setMsg(errText(d.status)); }
    } catch {
      if (current(version, creds.loginId)) {
        submitting.current = false;
        setMsg("Could not submit. Check your connection and press Submit again.");
      }
    } finally { if (current(version, creds.loginId)) setBusy(false); }
  }, [creds, active, call, refresh, current]);
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const remaining =
        active.deadline - (nowMs() + active.offset);
      setLeft(remaining);
      if (remaining <= 0) {
        void submit();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [active, submit]);
  const choose = useCallback(
    (q: Question, letter: string) => {
      const attempt = activeRef.current;
      const version = sessionVersion.current;
      if (
        !creds ||
        !attempt ||
        submitting.current ||
        confirming.current
      ) return;
      const option = q[
        `option_${letter.toLowerCase()}` as keyof Question
      ];
      if (!option) return;
      setActive((previous) => {
        if (!previous || !current(version, creds.loginId)) return previous;
        return {
          ...previous,
          answers: {
            ...previous.answers,
            [q.id]: letter,
          },
        };
      });
      const pending = call(creds, {
        action: "save",
        attemptId: attempt.attemptId,
        questionId: q.id,
        chosen: letter,
      })
        .then((d) => {
          if (!current(version, creds.loginId)) return;
          if (d.status !== "ok") {
            setMsg(
              "Your answer could not be saved. Check your connection."
            );
          } else {
            setMsg("");
          }
        })
        .catch(() => {
          if (!current(version, creds.loginId)) return;
          setMsg(
            "Answer not saved yet. Check your connection."
          );
        });
      saving.current.push(pending);
      void pending.finally(() => {
        saving.current = saving.current.filter(
          (p) => p !== pending
        );
      });
    },
    [creds, call, current]
  );
  const confirmSubmit = useCallback(async () => {
    if (
      !active ||
      busy ||
      submitting.current ||
      confirming.current
    ) return;
    confirming.current = true;
    try {
      const answered = active.questions.filter(
        (q) => active.answers[q.id]
      ).length;
      const unanswered =
        active.questions.length - answered;
      const message = unanswered > 0
        ? `You have ${unanswered} unanswered question(s). You cannot change your answers after submitting.`
        : "You have answered all questions. You cannot change your answers after submitting.";
      const confirmed = await ask({
        title: "Submit examination?",
        message,
        confirmText: "Submit",
      });
      if (confirmed) {
        await submit();
      }
    } finally {
      confirming.current = false;
    }
  }, [active, busy, ask, submit]);
  useEffect(() => {
    if (!active) return;
    const handleKey = (e: KeyboardEvent) => {
      if (
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        e.repeat ||
        busy ||
        submitting.current ||
        confirming.current
      ) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [aria-modal="true"]'
        )
      ) return;
      const key = e.key.toUpperCase();
      if (["A", "B", "C", "D"].includes(key)) {
        const q = active.questions[idx];
        if (!q) return;
        e.preventDefault();
        choose(q, key);
      } else if (key === "N") {
        e.preventDefault();
        setIdx((i) =>
          Math.min(i + 1, active.questions.length - 1)
        );
      } else if (key === "P") {
        e.preventDefault();
        setIdx((i) => Math.max(0, i - 1));
      } else if (key === "S") {
        e.preventDefault();
        void confirmSubmit();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [active, idx, busy, choose, confirmSubmit]);
  const header = (
    <header className="cbt-top cbt-premium-header">
      <div className="cbt-header-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/kps-logo.png"
          alt="DKPS logo"
          className="cbt-brand-logo"
        />
        <div className="cbt-brand-text">
          <strong>DKPS Student Portal</strong>
          <small>Tests & Examinations</small>
        </div>
        {me && (
          <div className="cbt-student-info">
            <strong>{me.name}</strong>
            <small>{me.className}</small>
          </div>
        )}
      </div>
    </header>
  );
  if (!checking && creds && active) {
    const q = active.questions[idx];
    const total = active.questions.length;
    const answered = active.questions.filter(
      (question) => !!active.answers[question.id]
    ).length;
    const progress =
      total > 0 ? (answered / total) * 100 : 0;
    const urgent = left <= 5 * 60 * 1000;
    return (
      <div className="cbt cbt-premium">
        {header}
        <main className="cbt-exam-container">
          <div className="cbt-exam-heading">
            <div>
              <span className="cbt-eyebrow">
                ONLINE EXAMINATION
              </span>
              <h1>Examination Workspace</h1>
            </div>
            <div
              className={`cbt-clock ${
                urgent ? "cbt-clock-urgent" : ""
              }`}
              role="timer"
              aria-label={`Time remaining ${mmss(left)}`}
            >
              <small>TIME REMAINING</small>
              <strong>{mmss(left)}</strong>
            </div>
          </div>
          {msg && (
            <div className="cbt-alert cbt-alert-error" role="alert">
              {msg}
            </div>
          )}
          <div className="cbt-exam-layout">
            <div className="cbt-exam-main">
              {active.instructions && (
                <section className="cbt-instructions">
                  <h2>Examination Instructions</h2>
                  <p>{active.instructions}</p>
                </section>
              )}
              {q ? (
                <section className="cbt-question-card">
                  <div className="cbt-question-top">
                    <span className="cbt-question-tag">
                      QUESTION {idx + 1} OF {total}
                    </span>
                    <span className="cbt-question-hint">
                      Select one answer
                    </span>
                  </div>
                  <h2 className="cbt-question-text">
                    {q.question}
                  </h2>
                  <div
                    className="cbt-options"
                    role="group"
                    aria-label={`Answers for question ${idx + 1}`}
                  >
                    {LETTERS.map((letter) => {
                      const option = q[
                        `option_${letter.toLowerCase()}` as keyof Question
                      ];
                      if (!option) return null;
                      const selected =
                        active.answers[q.id] === letter;
                      return (
                        <button
                          type="button"
                          key={letter}
                          className={`cbt-answer-option ${
                            selected ? "selected" : ""
                          }`}
                          aria-pressed={selected}
                          disabled={busy}
                          onClick={() => choose(q, letter)}
                        >
                          <span className="cbt-answer-letter">
                            {letter}
                          </span>
                          <span className="cbt-answer-text">
                            {option}
                          </span>
                          {selected && (
                            <span
                              className="cbt-answer-check"
                              aria-hidden="true"
                            >
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className="cbt-question-actions">
                    <button
                      type="button"
                      className="cbt-action-secondary"
                      disabled={idx === 0 || busy}
                      onClick={() =>
                        setIdx((i) => Math.max(0, i - 1))
                      }
                    >
                      ← Previous
                    </button>
                    {idx < total - 1 ? (
                      <button
                        type="button"
                        className="cbt-action-primary"
                        disabled={busy}
                        onClick={() =>
                          setIdx((i) =>
                            Math.min(total - 1, i + 1)
                          )
                        }
                      >
                        Next Question →
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="cbt-action-primary"
                        disabled={busy}
                        onClick={() => void confirmSubmit()}
                      >
                        Submit Examination
                      </button>
                    )}
                  </div>
                </section>
              ) : (
                <section className="cbt-question-card">
                  <h2>No questions available</h2>
                  <p>
                    No questions have been added yet.
                    Contact your teacher.
                  </p>
                  <button
                    className="cbt-action-primary"
                    disabled={busy}
                    onClick={() => void submit()}
                  >
                    Leave
                  </button>
                </section>
              )}
            </div>
            <aside className="cbt-exam-sidebar">
              <section className="cbt-side-card">
                <div className="cbt-side-heading">
                  <h2>Exam Progress</h2>
                  <strong>{answered}/{total}</strong>
                </div>
                <div
                  className="cbt-progress-track"
                  role="progressbar"
                  aria-valuenow={answered}
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-label="Questions answered"
                >
                  <div
                    className="cbt-progress-fill"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p>
                  {answered} answered · {total - answered} remaining
                </p>
              </section>
              <section className="cbt-side-card">
                <h2>Question Navigator</h2>
                <p>Jump to any question.</p>
                <div className="cbt-question-grid">
                  {active.questions.map((question, i) => {
                    const done = !!active.answers[question.id];
                    const current = i === idx;
                    return (
                      <button
                        type="button"
                        key={question.id}
                        className={`cbt-question-number ${
                          done ? "answered" : ""
                        } ${current ? "current" : ""}`}
                        aria-label={`Question ${i + 1}${
                          done ? ", answered" : ", unanswered"
                        }${current ? ", current" : ""}`}
                        aria-current={current ? "step" : undefined}
                        onClick={() => setIdx(i)}
                      >
                        {i + 1}
                      </button>
                    );
                  })}
                </div>
                <div className="cbt-legend">
                  <span><i className="legend-done" /> Answered</span>
                  <span><i className="legend-current" /> Current</span>
                  <span><i className="legend-empty" /> Unanswered</span>
                </div>
              </section>
              <section className="cbt-side-card cbt-shortcuts">
                <h2>Keyboard Shortcuts</h2>
                <div><span>Select answer</span><strong>A – D</strong></div>
                <div><span>Next question</span><strong>N</strong></div>
                <div><span>Previous question</span><strong>P</strong></div>
                <div><span>Submit exam</span><strong>S</strong></div>
              </section>
              <button
                type="button"
                className="cbt-submit-side"
                disabled={busy}
                onClick={() => void confirmSubmit()}
              >
                Submit Examination
              </button>
            </aside>
          </div>
        </main>
      </div>
    );
  }
  if (!creds && checking) {
    return (
      <div className="cbt cbt-premium">
        {header}
        <main className="cbt-page-container">
          <div className="cbt-premium-card">
            Loading assessments…
          </div>
        </main>
      </div>
    );
  }
  if (!creds) {
    return (
      <div className="cbt cbt-premium">
        {header}
        <main className="cbt-page-container cbt-login-layout">
          <form className="cbt-premium-card cbt-login-card" onSubmit={login}>
            <span className="cbt-eyebrow">STUDENT ACCESS</span>
            <h1>Student Login</h1>
            <p>Enter your Student Login ID and 4-digit PIN.</p>
            <label htmlFor="cbt-login-id">Login ID</label>
            <input
              id="cbt-login-id"
              value={loginId}
              onChange={(e) =>
                setLoginId(e.target.value.toUpperCase())
              }
              autoComplete="off"
              autoCapitalize="characters"
              required
            />
            <label htmlFor="cbt-login-pin">4-digit PIN</label>
            <input
              id="cbt-login-pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoComplete="new-password"
              required
            />
            {msg && (
              <div className="cbt-alert cbt-alert-error" role="alert">
                {msg}
              </div>
            )}
            <button
              type="submit"
              className="cbt-action-primary"
              disabled={busy}
            >
              {busy ? "Checking…" : "Login"}
            </button>
            <Link href="/dashboard" className="cbt-back-link">
              ← Back to dashboard
            </Link>
          </form>
        </main>
      </div>
    );
  }
  const availableCount = items.filter(
    (it) => it.state === "open"
  ).length;
  const progressCount = items.filter(
    (it) => it.state === "in_progress"
  ).length;
  const completedCount = items.filter(
    (it) => it.state === "submitted"
  ).length;
  return (
    <div className="cbt cbt-premium">
      {header}
      <main className="cbt-page-container">
        <section className="cbt-hero">
          <span className="cbt-eyebrow">
            ONLINE ASSESSMENT CENTRE
          </span>
          <h1>Tests & Examinations</h1>
          <p>
            Access your scheduled assessments,
            monitor progress and complete your tests.
          </p>
        </section>
        <section className="cbt-summary">
          <div className="cbt-summary-card">
            <strong>{availableCount}</strong>
            <span>Available</span>
          </div>
          <div className="cbt-summary-card">
            <strong>{progressCount}</strong>
            <span>In Progress</span>
          </div>
          <div className="cbt-summary-card">
            <strong>{completedCount}</strong>
            <span>Completed</span>
          </div>
        </section>
        {result && (
          <div className="cbt-alert cbt-alert-success" role="status">
            <strong>Examination Submitted</strong>
            <p>
              Your answers have been received.
              Your teacher will give you your result.
            </p>
          </div>
        )}
        {msg && (
          <div className="cbt-alert cbt-alert-error" role="alert">
            {msg}
          </div>
        )}
        {locked && (
          <div className="cbt-alert cbt-alert-warning">
            <strong>Assessments Locked</strong>
            <p>
              Return to the dashboard and enter
              the access code from your teacher.
            </p>
          </div>
        )}
        <h2 className="cbt-section-title">
          Your Assessments
        </h2>
        {!locked && items.length === 0 && (
          <div className="cbt-premium-card cbt-empty">
            Nothing is available for your class right now.
          </div>
        )}
        <section className="cbt-assessment-grid">
          {items.map((it) => (
            <article className="cbt-assessment-card" key={it.id}>
              <div className="cbt-assessment-top">
                <span
                  className={`cbt-status cbt-status-${it.state}`}
                >
                  {statusLabel(it.state)}
                </span>
                <span className="cbt-kind">
                  {it.kind === "exam" ? "EXAM" : "TEST"}
                </span>
              </div>
              <h3>{it.subject}</h3>
              <div className="cbt-assessment-meta">
                {it.duration && (
                  <span>◷ {it.duration} minutes</span>
                )}
                <span>◈ {it.maxScore} marks</span>
              </div>
              {it.end && (
                <p className="cbt-assessment-date">
                  Closes: {fmt(it.end)}
                </p>
              )}
              {it.state === "upcoming" && (
                <p className="cbt-assessment-date">
                  Opens: {fmt(it.start)}
                </p>
              )}
              {it.state === "submitted" && (
                <p className="cbt-completed-note">
                  ✓ Answers submitted successfully
                </p>
              )}
              {it.state === "open" && (
                <button
                  className="cbt-action-primary"
                  disabled={busy}
                  onClick={() => void start(it.id)}
                >
                  Start {it.kind === "exam" ? "Exam" : "Test"}
                </button>
              )}
              {it.state === "in_progress" && (
                <button
                  className="cbt-action-resume"
                  disabled={busy}
                  onClick={() => void start(it.id)}
                >
                  Resume Assessment
                </button>
              )}
            </article>
          ))}
        </section>
        <div className="cbt-footer-actions">
          <Link
            href="/dashboard"
            className="cbt-action-secondary"
          >
            ← Back to Dashboard
          </Link>
          <button
            className="cbt-logout"
              onClick={logout}
          >
            Log out
          </button>
        </div>
      </main>
    </div>
  );
}
