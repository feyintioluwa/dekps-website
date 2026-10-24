"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import "../cbt/cbt.css";

type Item = {
  id: string; subject: string; title: string; instructions: string | null; maxScore: number;
  dueAt: string | null; state: string; answer: string | null;
  files: { name: string; type: string }[]; submittedAt: string | null;
  score: number | null; comment: string | null;
};

const ALLOWED = ["image/jpeg", "image/png", "application/pdf"];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 3;
const STORE = "dkpsStudent";
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString() : "");

// Green = good (60% and above), yellow = average (45% to 59%), red = low (below 45%)
function tone(score: number, max: number) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  if (pct >= 60) return { c: "#1a8f4c", bg: "#e8f6ee" };
  if (pct >= 45) return { c: "#c98a00", bg: "#fff6dc" };
  return { c: "#c62828", bg: "#fdeaea" };
}

// A mark written like a teacher's pen circle: 7/10
function Mark({ score, max, size }: { score: number; max: number; size: "big" | "small" }) {
  const t = tone(score, max);
  const big = size === "big";
  return (
    <span
      aria-label={`${score} out of ${max}`}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        minWidth: big ? 150 : 62, minHeight: big ? 110 : 46,
        padding: big ? "10px 28px" : "4px 12px",
        border: `${big ? 5 : 3}px solid ${t.c}`, color: t.c, background: t.bg,
        borderRadius: "58% 42% 55% 45% / 48% 56% 44% 52%",
        transform: "rotate(-4deg)",
        fontFamily: '"Bradley Hand","Segoe Print","Comic Sans MS",cursive',
        fontWeight: 700, fontSize: big ? "2.8rem" : "1.15rem", lineHeight: 1,
      }}
    >
      {score}/{max}
    </span>
  );
}

export default function AssignmentsPage() {
  const [loginId, setLoginId] = useState("");
  const [pin, setPin] = useState("");
  const [creds, setCreds] = useState<{ loginId: string; pin: string } | null>(null);
  const [me, setMe] = useState<{ name: string; className: string } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const router = useRouter();
  const entered = useRef(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [picked, setPicked] = useState<File[]>([]);

  const call = useCallback(async (c: { loginId: string; pin: string }, body: Record<string, unknown>) => {
    const res = await fetch("/api/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...c, ...body }),
    });
    return res.json();
  }, []);

  // Use the login saved by the dashboard (or by another student page)
  useEffect(() => {
    // This page can only be opened from the student dashboard
    if (!entered.current) {
      if (sessionStorage.getItem("dkpsVia") !== "/assignments") { router.replace("/dashboard"); return; }
      sessionStorage.removeItem("dkpsVia"); // one-time pass
      entered.current = true;
    }
    let saved: { loginId: string; pin: string } | null = null;
    try { saved = JSON.parse(sessionStorage.getItem(STORE) || "null"); } catch { saved = null; }
    const run = async () => {
      if (saved?.loginId && saved?.pin) {
        try {
          const d = await call(saved, { action: "list" });
          if (d.status === "ok") { setCreds(saved); setMe(d.student); setItems(d.items); setChecking(false); return; }
          sessionStorage.removeItem(STORE);
        } catch { /* fall through to the dashboard */ }
      }
      router.replace("/dashboard");
    };
    run();
  }, [call, router]);

  const errText = (s: string) =>
    ({
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
    e.preventDefault();
    setMsg("");
    const c = { loginId: loginId.trim(), pin: pin.trim() };
    if (!c.loginId || !/^\d{4}$/.test(c.pin)) return setMsg("Enter your Login ID and 4-digit PIN.");
    setBusy(true);
    try {
      const d = await call(c, { action: "list" });
      if (d.status !== "ok") return setMsg(errText(d.status));
      sessionStorage.setItem(STORE, JSON.stringify(c));
      setCreds(c); setMe(d.student); setItems(d.items);
    } catch { setMsg("Could not reach the server."); }
    finally { setBusy(false); }
  }

  async function refresh() {
    if (!creds) return;
    const d = await call(creds, { action: "list" });
    if (d.status === "ok") setItems(d.items);
  }

  function open(it: Item) {
    setOpenId(it.id); setAnswer(it.answer ?? ""); setPicked([]); setMsg("");
  }

  function onPick(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (files.length > MAX_FILES) return setMsg(`You can attach at most ${MAX_FILES} files.`);
    for (const f of files) {
      if (!ALLOWED.includes(f.type)) return setMsg(`"${f.name}" is not allowed. Use JPG, PNG or PDF.`);
      if (f.size > MAX_BYTES) return setMsg(`"${f.name}" is bigger than 5 MB.`);
    }
    setMsg(""); setPicked(files);
  }

  async function submit() {
    if (!creds || !openId) return;
    setBusy(true); setMsg("");
    try {
      const refs: { path: string; name: string; type: string }[] = [];
      for (const f of picked) {
        const u = await call(creds, { action: "upload_url", assignmentId: openId, contentType: f.type });
        if (u.status !== "ok") return setMsg(errText(u.status));
        const fd = new FormData();
        fd.append("cacheControl", "3600");
        fd.append("", f);
        const r = await fetch(u.uploadUrl, { method: "PUT", body: fd });
        if (!r.ok) return setMsg(`Could not upload "${f.name}". Try again or use a smaller file.`);
        refs.push({ path: u.path, name: f.name, type: f.type });
      }
      const d = await call(creds, { action: "submit", assignmentId: openId, answer, files: refs });
      if (d.status !== "ok") return setMsg(errText(d.status));
      setOpenId(null); setPicked([]);
      await refresh();
      setMsg("Submitted. Your teacher will mark it.");
    } catch { setMsg("Could not submit. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  const header = (
    <div className="cbt-top">
      <h1>DE KINGS PERFECTION PRIVATE SCHOOL — ASSIGNMENTS</h1>
      {me ? <span>{me.name} · {me.className}</span> : <Link href="/" className="home-btn">← Home</Link>}
    </div>
  );

  // ---------- checking the saved login ----------
  if (!creds && checking) {
    return (
      <div className="cbt">
        {header}
        <div className="cbt-wrap"><div className="cbt-card">Loading…</div></div>
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

  // ---------- one assignment ----------
  const cur = items.find((x) => x.id === openId);
  if (cur) {
    const locked = cur.state === "marked" || cur.state === "closed";
    return (
      <div className="cbt">
        {header}
        <div className="cbt-wrap">
          {msg && <div className="cbt-err">{msg}</div>}
          <div className="cbt-card">
            <span className="cbt-tag">{cur.subject}</span>
            <h2 style={{ margin: "6px 0" }}>{cur.title}</h2>
            <small style={{ color: "#687385" }}>
              {cur.maxScore} marks{cur.dueAt ? ` · deadline ${fmt(cur.dueAt)}` : ""}
            </small>
            {cur.instructions && <p style={{ margin: "12px 0", whiteSpace: "pre-wrap" }}>{cur.instructions}</p>}

            {cur.state === "marked" && (
              <div style={{ margin: "18px 0", textAlign: "center" }}>
                <Mark score={cur.score ?? 0} max={cur.maxScore} size="big" />
                {cur.comment && (
                  <p style={{ margin: "16px auto 0", whiteSpace: "pre-wrap", textAlign: "left", maxWidth: 520 }}>
                    <b>Teacher&apos;s comment:</b> {cur.comment}
                  </p>
                )}
              </div>
            )}
            {cur.state === "closed" && !cur.submittedAt && <p style={{ color: "#a33" }}>The deadline has passed and nothing was submitted.</p>}

            <label style={{ display: "block", margin: "12px 0 4px", fontSize: ".85rem", color: "#687385" }}>Your answer</label>
            <textarea
              rows={8} style={{ width: "100%" }} value={answer} disabled={locked}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer here"
            />

            {cur.files.length > 0 && (
              <p style={{ margin: "8px 0", fontSize: ".9rem" }}>
                Already attached: {cur.files.map((f) => f.name).join(", ")}
              </p>
            )}

            {!locked && (
              <>
                <label style={{ display: "block", margin: "12px 0 4px", fontSize: ".85rem", color: "#687385" }}>
                  Attach a photo or PDF (optional, up to {MAX_FILES} files, 5 MB each, JPG / PNG / PDF)
                </label>
                <input type="file" multiple accept="image/jpeg,image/png,application/pdf" onChange={(e) => onPick(e.target.files)} />
                {picked.length > 0 && <p style={{ fontSize: ".85rem" }}>New files: {picked.map((f) => f.name).join(", ")}{cur.files.length ? " (these replace the files already attached)" : ""}</p>}
                <div className="cbt-nav">
                  <button className="cbt-btn alt" disabled={busy} onClick={() => { setOpenId(null); setMsg(""); }}>Back</button>
                  <button className="cbt-btn" disabled={busy} onClick={submit}>{busy ? "Sending..." : cur.state === "submitted" ? "Resubmit" : "Submit"}</button>
                </div>
              </>
            )}
            {locked && (
              <div className="cbt-nav">
                <button className="cbt-btn alt" onClick={() => { setOpenId(null); setMsg(""); }}>Back</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- list ----------
  return (
    <div className="cbt">
      {header}
      <div className="cbt-wrap">
        {msg && <div className="cbt-err">{msg}</div>}
        <h2 style={{ margin: "6px 0 12px", color: "#071f3d" }}>Your assignments</h2>
        {items.length === 0 && <div className="cbt-card">There are no assignments for your class right now.</div>}
        {items.map((it) => (
          <div className="cbt-card cbt-item" key={it.id}>
            <div>
              <span className="cbt-tag">{it.subject}</span>
              <h3 style={{ marginTop: 6 }}>{it.title}</h3>
              <small style={{ color: "#687385" }}>
                {it.maxScore} marks{it.dueAt ? ` · deadline ${fmt(it.dueAt)}` : ""}
              </small>
            </div>
            <div style={{ textAlign: "right" }}>
              {it.state === "marked" && <Mark score={it.score ?? 0} max={it.maxScore} size="small" />}
              {it.state === "submitted" && <small>Submitted</small>}
              {it.state === "closed" && <small>Closed</small>}
              <div style={{ marginTop: 6 }}>
                <button className="cbt-btn" onClick={() => open(it)}>
                  {it.state === "open" ? "Open" : it.state === "submitted" ? "View / edit" : "View"}
                </button>
              </div>
            </div>
          </div>
        ))}
        <button className="cbt-btn alt" onClick={() => { sessionStorage.removeItem(STORE); router.push("/dashboard"); }}>Log out</button>
      </div>
    </div>
  );
}
