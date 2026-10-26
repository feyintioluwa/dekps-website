"use client";

import { useEffect, useState } from "react";
import "../students/admin.css";
import { useAdminKey } from "../AdminShell";
import { useConfirm } from "../Dialog";

type Cls = { id: string; name: string };
type Stu = { id: string; name: string; login_id: string };
type P = { id: string; role: string; name: string; loginId: string; className: string };

export default function AdminPrefects() {
  const key = useAdminKey();
  const ask = useConfirm();
  const [session, setSession] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [classes, setClasses] = useState<Cls[]>([]);
  const [students, setStudents] = useState<Stu[]>([]);
  const [prefects, setPrefects] = useState<P[]>([]);
  const [classId, setClassId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [role, setRole] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const h = { "Content-Type": "application/json", "x-admin-key": key };

  async function load(cid = classId) {
    const r = await fetch(`/api/admin/prefects${cid ? `?classId=${cid}` : ""}`, { headers: h });
    const d = await r.json();
    if (!r.ok) return setMsg(d.error || "Could not load prefects");
    setSession(d.session); setRoles(d.roles); setClasses(d.classes);
    setStudents(d.students); setPrefects(d.prefects);
  }
  async function act(payload: object, done: string) {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/admin/prefects", { method: "POST", headers: h, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      await load();
      setMsg(done);
      return true;
    } catch (e) { setMsg((e as Error).message); return false; }
    finally { setBusy(false); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(""); }, []);

  async function pickClass(id: string) {
    setClassId(id); setStudentId("");
    await load(id);
  }
  async function assign() {
    const ok = await act({ action: "set", studentId, role }, "Prefect saved.");
    if (ok) { setStudentId(""); setRole(""); }
  }

  return (
    <div className="adm">
      <h1>Prefects</h1>
      <p>{session ? `Roles are for the current session: ${session}. Prefects show a badge on their student dashboard.` : "No current term is set, so there is no current session yet."}</p>
      {msg && <p className="adm-msg">{msg}</p>}

      <h2>1. Give a student a role</h2>
      <div className="adm-row">
        <select value={classId} onChange={(e) => pickClass(e.target.value)}>
          <option value="">Choose class</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)} disabled={!classId}>
          <option value="">Choose student</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.login_id})</option>)}
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">Choose role</option>
          {roles.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <button disabled={busy || !session || !studentId || !role} onClick={assign} style={{ marginTop: 8 }}>Save prefect</button>
      <p style={{ fontSize: ".85rem", color: "#687385" }}>A student can hold one role per session. Saving a new role replaces the old one.</p>

      <h2>2. Current prefects{session ? ` (${session})` : ""}</h2>
      {prefects.length === 0 ? <p>No prefects set yet.</p> : (
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead><tr><th>Role</th><th>Name</th><th>Class</th><th>Login ID</th><th>Action</th></tr></thead>
            <tbody>
              {prefects.map((p) => (
                <tr key={p.id}>
                  <td>{p.role}</td><td>{p.name}</td><td>{p.className}</td><td>{p.loginId}</td>
                  <td>
                    <button disabled={busy} onClick={async () => { if (await ask({ title: "Remove prefect?", message: `Remove ${p.name} as ${p.role}?`, confirmText: "Remove" })) act({ action: "remove", id: p.id }, "Prefect removed."); }}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
