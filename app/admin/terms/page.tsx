"use client";

import { useEffect, useState } from "react";
import "../students/admin.css";
import { useAdminKey } from "../AdminShell";
import { useConfirm } from "../Dialog";

type T = { id: string; session: string; term: string; is_active: boolean | null; is_locked: boolean | null; is_published: boolean | null };
const ORDER = ["First Term", "Second Term", "Third Term"];

export default function AdminTerms() {
  const key = useAdminKey();
  const ask = useConfirm();
  const [terms, setTerms] = useState<T[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState("");
  const [opened, setOpened] = useState<Record<string, boolean>>({});

  const h = { "Content-Type": "application/json", "x-admin-key": key };

  async function load() {
    const r = await fetch("/api/admin/terms", { headers: h });
    const d = await r.json();
    if (!r.ok) return setMsg(d.error || "Could not load terms");
    setTerms(d.terms);
  }
  async function act(body: object, done: string) {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/admin/terms", { method: "POST", headers: h, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      await load();
      setMsg(done);
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const current = terms.find((t) => t.is_active);

  // Group terms by session, newest session first, terms in First/Second/Third order
  const sessions = Array.from(new Set(terms.map((t) => t.session))).sort((a, b) => b.localeCompare(a));
  const termsOf = (s: string) =>
    terms.filter((t) => t.session === s).sort((a, b) => ORDER.indexOf(a.term) - ORDER.indexOf(b.term));

  // A session is open if the user toggled it; otherwise only the current session starts open
  const isOpen = (s: string) => (s in opened ? opened[s] : s === current?.session);
  const toggle = (s: string) => setOpened((o) => ({ ...o, [s]: !isOpen(s) }));

  return (
    <div className="adm">
      <h1>Terms &amp; Sessions</h1>
      <p>{current ? `Current term: ${current.term} — ${current.session}` : "No term is set as current yet."}</p>
      {msg && <p className="adm-msg">{msg}</p>}

      <h2>1. Add a new session</h2>
      <p>Creates First, Second and Third Term for that session. It does not change the current term.</p>
      <div className="adm-row">
        <input placeholder="Session, for example 2027/2028" value={session} onChange={(e) => setSession(e.target.value)} />
        <button disabled={busy || !session.trim()} onClick={() => act({ action: "addSession", session }, "Session added.").then(() => setSession(""))}>Add session</button>
      </div>

      <h2>2. All sessions</h2>
      {sessions.map((s) => {
        const rows = termsOf(s);
        const open = isOpen(s);
        const hasCurrent = rows.some((t) => t.is_active);
        return (
          <div key={s} style={{ border: "1px solid #e6e9ee", borderRadius: 8, marginBottom: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", background: "#fff", paddingRight: 12 }}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggle(s)}
                style={{ flex: 1, display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "#fff", color: "#0a1f3c", border: 0, borderRadius: 0, cursor: "pointer", fontWeight: 600, fontSize: 16, textAlign: "left" }}
              >
                <span aria-hidden="true" style={{ display: "inline-block", width: 10, textAlign: "center", transition: "transform .2s", transform: open ? "rotate(90deg)" : "none" }}>›</span>
                <span>{s}</span>
                <span style={{ fontWeight: 400, fontSize: 13, color: "#6b7480" }}>{rows.length} terms</span>
                {hasCurrent && <span style={{ fontWeight: 500, fontSize: 12, padding: "2px 10px", borderRadius: 99, background: "#e8f3ea", color: "#1f6b35" }}>Current session</span>}
              </button>
              <button
                type="button"
                disabled={busy || hasCurrent}
                title={hasCurrent ? "Make another term current before deleting this session" : "Delete this session"}
                onClick={async () => {
                  if (await ask({ title: "Delete session?", message: `Delete ${s} and its three terms? This only works if the session has no scores, tests, assignments, remarks or results. It cannot be undone.`, confirmText: "Delete session" }))
                    act({ action: "deleteSession", session: s }, `Session ${s} deleted.`);
                }}
              >
                Delete session
              </button>
            </div>

            {open && (
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead><tr><th>Term</th><th>Status</th><th>Results</th><th>Actions</th></tr></thead>
                  <tbody>
                    {rows.map((t) => (
                      <tr key={t.id}>
                        <td>{t.term}</td>
                        <td>{t.is_active ? "Current" : "-"}{t.is_locked ? " · Locked" : ""}</td>
                        <td>{t.is_published ? "Published" : "Not published"}</td>
                        <td>
                          <div className="adm-row">
                            <button disabled={busy || !!t.is_active} onClick={async () => { if (await ask({ title: "Make current term?", message: `Make ${t.term} ${t.session} the current term?`, confirmText: "Make current" })) act({ action: "setActive", id: t.id }, "Current term updated."); }}>Make current</button>
                            <button disabled={busy} onClick={() => act({ action: "lock", id: t.id, value: !t.is_locked }, t.is_locked ? "Term unlocked." : "Term locked.")}>{t.is_locked ? "Unlock" : "Lock"}</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
      {terms.length === 0 && <p>No terms found.</p>}
    </div>
  );
}
