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

  const sorted = [...terms].sort((a, b) =>
    a.session === b.session ? ORDER.indexOf(a.term) - ORDER.indexOf(b.term) : b.session.localeCompare(a.session)
  );
  const current = terms.find((t) => t.is_active);

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

      <h2>2. All terms</h2>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>Session</th><th>Term</th><th>Status</th><th>Results</th><th>Actions</th></tr></thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={t.id}>
                <td>{t.session}</td>
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
      {terms.length === 0 && <p>No terms found.</p>}
    </div>
  );
}
