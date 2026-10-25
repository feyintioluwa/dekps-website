"use client";

import { useEffect, useState } from "react";
import "../students/admin.css";
import { useAdminKey } from "../AdminShell";
import { useConfirm } from "../Dialog";

type N = { id: string; title: string; body: string; class_id: string | null; hide_after: string | null; created_at: string; expired: boolean };
type C = { id: string; name: string };

export default function AdminNotices() {
  const key = useAdminKey();
  const ask = useConfirm();
  const [notices, setNotices] = useState<N[]>([]);
  const [classes, setClasses] = useState<C[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [classId, setClassId] = useState("all");
  const [hideAfter, setHideAfter] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const h = { "Content-Type": "application/json", "x-admin-key": key };

  async function load() {
    const r = await fetch("/api/admin/notices", { headers: h });
    const d = await r.json();
    if (!r.ok) return setMsg(d.error || "Could not load notices");
    setNotices(d.notices);
    setClasses(d.classes);
  }
  async function act(payload: object, done: string) {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/admin/notices", { method: "POST", headers: h, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      await load();
      setMsg(done);
      return true;
    } catch (e) { setMsg((e as Error).message); return false; }
    finally { setBusy(false); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  async function post() {
    const ok = await act({ action: "add", title, body, classId, hideAfter }, "Notice posted.");
    if (ok) { setTitle(""); setBody(""); setClassId("all"); setHideAfter(""); }
  }

  const className = (id: string | null) => (id ? classes.find((c) => c.id === id)?.name ?? "One class" : "All classes");

  return (
    <div className="adm">
      <h1>Notices</h1>
      <p>Notices appear on the student dashboard. Do not put private details (names, fees owed, discipline) in a notice.</p>
      {msg && <p className="adm-msg">{msg}</p>}

      <h2>1. Write a notice</h2>
      <input placeholder="Title, for example Resumption date" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
      <textarea placeholder="Message" value={body} maxLength={2000} rows={4} onChange={(e) => setBody(e.target.value)} style={{ width: "100%", marginTop: 8, padding: 10, font: "inherit", boxSizing: "border-box" }} />
      <div className="adm-row" style={{ marginTop: 8 }}>
        <select value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="all">All classes</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name} only</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Hide after (optional)
          <input type="date" value={hideAfter} onChange={(e) => setHideAfter(e.target.value)} />
        </label>
      </div>
      <button disabled={busy || !title.trim() || !body.trim()} onClick={post} style={{ marginTop: 8 }}>Post notice</button>

      <h2>2. All notices</h2>
      {notices.length === 0 && <p>No notices yet.</p>}
      {notices.map((n) => (
        <div key={n.id} style={{ border: "1px solid #e6e9ee", borderRadius: 8, padding: "14px 16px", marginBottom: 12, opacity: n.expired ? 0.6 : 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
            <div>
              <strong>{n.title}</strong>
              <div style={{ fontSize: 13, color: "#6b7480", margin: "2px 0 8px" }}>
                {className(n.class_id)} · posted {new Date(n.created_at).toLocaleDateString()}
                {n.hide_after ? ` · hides after ${new Date(n.hide_after).toLocaleDateString()}` : ""}
                {n.expired ? " · hidden from students" : ""}
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{n.body}</div>
            </div>
            <button disabled={busy} onClick={async () => { if (await ask({ title: "Delete notice?", message: `Delete "${n.title}"? This cannot be undone.`, confirmText: "Delete" })) act({ action: "delete", id: n.id }, "Notice deleted."); }}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
