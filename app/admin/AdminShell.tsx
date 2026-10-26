"use client";

import { createContext, FormEvent, ReactNode, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "./shell.css";
import { DialogProvider } from "./Dialog";

const Ctx = createContext("");
export const useAdminKey = () => useContext(Ctx);

const NAV = [
  ["/admin", "📊", "Dashboard"],
  ["/admin/students", "👩‍🎓", "Students & PINs"],
  ["/admin/electives", "🧪", "SSS Subjects"],
  ["/admin/subjects", "📚", "Class Subjects"],
  ["/admin/broadsheet", "📑", "Scores & Results"],
  ["/admin/cbt", "📝", "Tests & Exams"],
  ["/admin/test-access", "🔒", "Test Access"],
  ["/admin/assignments", "📋", "Assignments"],
  ["/admin/notices", "📢", "Notices"],
  ["/admin/prefects", "🎖️", "Prefects"],
  ["/admin/terms", "📅", "Terms & Sessions"],
] as const;

const STORE = "dkpsAdminKey";

async function verify(k: string) {
  const r = await fetch("/api/admin/students", { headers: { "x-admin-key": k } });
  return r.ok;
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const [key, setKey] = useState<string | null>(null); // null = checking, "" = logged out
  const [input, setInput] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState("");
  const [menu, setMenu] = useState(false);
  const path = usePathname();

  useEffect(() => {
    const saved = sessionStorage.getItem(STORE);
    if (!saved) { setKey(""); return; }
    verify(saved).then((ok) => {
      if (ok) setKey(saved);
      else { sessionStorage.removeItem(STORE); setKey(""); }
    });
  }, []);

  // Show the current term in the top bar (re-checked each time you open a page)
  useEffect(() => {
    if (!key) return;
    fetch("/api/admin/terms", { headers: { "x-admin-key": key } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const t = d?.terms?.find((x: { is_active: boolean | null }) => x.is_active);
        setCurrent(t ? `${t.term} — ${t.session}` : "No current term set");
      })
      .catch(() => {});
  }, [key, path]);

  async function login(e: FormEvent) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      if (await verify(input.trim())) {
        sessionStorage.setItem(STORE, input.trim());
        setKey(input.trim());
      } else setErr("Wrong admin key.");
    } catch { setErr("Could not reach the server."); }
    setBusy(false);
  }
  function logout() { sessionStorage.removeItem(STORE); setKey(""); setInput(""); setCurrent(""); }

  if (key === null) return <div className="gate"><p style={{ color: "#fff" }}>Loading…</p></div>;

  if (!key)
    return (
      <div className="gate">
        <form onSubmit={login}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/assets/kps-logo.png" alt="School logo" />
          <h2>DKPS Admin Portal</h2>
          <p>Enter your admin key to continue.</p>
          <input type="password" placeholder="Admin key" value={input} onChange={(e) => setInput(e.target.value)} autoFocus />
          {err && <div className="err">{err}</div>}
          <button disabled={busy || !input.trim()}>{busy ? "Checking…" : "Sign in"}</button>
        </form>
      </div>
    );

  const title = NAV.find(([href]) => href === path)?.[2] ?? "Admin";

  return (
    <Ctx.Provider value={key}>
      <DialogProvider>
        <div className="shell">
          <aside className="shell-side">
            <div className="shell-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/kps-logo.png" alt="" />
              <b>De Kings Perfection<small>ADMIN PORTAL</small></b>
              <button className="shell-burger" aria-label="Menu" onClick={() => setMenu((m) => !m)}>{menu ? "✕" : "☰"}</button>
            </div>
            <nav className={"shell-nav" + (menu ? " open" : "")}>
              {NAV.map(([href, icon, label]) => (
                <Link key={href} href={href} className={path === href ? "on" : ""} onClick={() => setMenu(false)}>
                  <span>{icon}</span>{label}
                </Link>
              ))}
            </nav>
            <div className={"shell-foot" + (menu ? " open" : "")}>
              <Link href="/">View website</Link>
              <button onClick={logout}>Sign out</button>
            </div>
          </aside>
          <div className="shell-main">
            <div className="shell-top"><h1>{title}</h1><span>{current}</span></div>
            <div className="shell-body">{children}</div>
          </div>
        </div>
      </DialogProvider>
    </Ctx.Provider>
  );
}
