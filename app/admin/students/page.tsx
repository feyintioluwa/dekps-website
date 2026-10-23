"use client";

import { useEffect, useState } from "react";
import "./admin.css";
import { useAdminKey } from "../AdminShell";

type ClassRow = { id: string; name: string; id_prefix: string | null };
type Created = { name: string; loginId: string; pin: string };

export default function AdminStudents() {
  const adminKey = useAdminKey();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [classId, setClassId] = useState("");
  const [names, setNames] = useState("");
  const [created, setCreated] = useState<Created[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [newId, setNewId] = useState("");
  const [oldId, setOldId] = useState("");

  const headers = { "Content-Type": "application/json", "x-admin-key": adminKey };

  async function unlock() {
    setMsg("");
    const res = await fetch("/api/admin/students", { headers });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error || "Failed");
    setClasses(data.classes);
    setClassId(data.classes[0]?.id ?? "");
  }

  async function create() {
    setMsg("");
    setBusy(true);
    const list = names.split("\n").map((n) => n.trim()).filter(Boolean);
    const res = await fetch("/api/admin/students", {
      method: "POST",
      headers,
      body: JSON.stringify({ classId, names: list }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(data.error || "Failed");
    setCreated(data.students);
    setNames("");
  }

  async function link() {
    setMsg("");
    const res = await fetch("/api/admin/students", {
      method: "POST",
      headers,
      body: JSON.stringify({ action: "link", loginId: newId, previousLoginId: oldId }),
    });
    const data = await res.json();
    setMsg(res.ok ? "Saved." : data.error || "Failed");
  }

  const className = classes.find((c) => c.id === classId)?.name ?? "";

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { unlock(); }, []);

  return (
    <div className="adm">
      <div className="adm-noprint">
        <h1>Add Students (2026/2027)</h1>
        
        {msg && <p className="adm-msg">{msg}</p>}

        {classes.length > 0 && (
          <>
            <h2>1. Paste names</h2>
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.id_prefix ? `(${c.id_prefix}…)` : "(no prefix set!)"}
                </option>
              ))}
            </select>
            <textarea rows={10} placeholder={"One student name per line"} value={names} onChange={(e) => setNames(e.target.value)} />
            <button disabled={busy || !names.trim()} onClick={create}>
              {busy ? "Creating..." : "Create students"}
            </button>

            <h2>Link to last session (optional)</h2>
            <div className="adm-row">
              <input placeholder="New Login ID" value={newId} onChange={(e) => setNewId(e.target.value)} />
              <input placeholder="Previous Login ID (blank = unlink)" value={oldId} onChange={(e) => setOldId(e.target.value)} />
              <button onClick={link}>Save link</button>
            </div>
          </>
        )}
      </div>

      {created.length > 0 && (
        <div className="adm-sheet">
          <h2>{className} — Login Credentials (2026/2027)</h2>
          <p className="adm-noprint">PINs are shown only once. Print now.</p>
          <table>
            <thead><tr><th>#</th><th>Name</th><th>Login ID</th><th>PIN</th></tr></thead>
            <tbody>
              {created.map((s, i) => (
                <tr key={s.loginId}><td>{i + 1}</td><td>{s.name}</td><td>{s.loginId}</td><td>{s.pin}</td></tr>
              ))}
            </tbody>
          </table>
          <button className="adm-noprint" onClick={() => window.print()}>Print credentials</button>
        </div>
      )}
    </div>
  );
}
