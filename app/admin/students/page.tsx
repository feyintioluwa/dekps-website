"use client";

import { useEffect, useState } from "react";
import "./admin.css";
import { useAdminKey } from "../AdminShell";

type ClassRow = { id: string; name: string; id_prefix: string | null };
type Created = { name: string; loginId: string; pin: string };
type Student = { id: string; login_id: string; name: string; is_active: boolean; previous_login_id: string | null };

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

  // Manage students
  const [mClassId, setMClassId] = useState("");
  const [list, setList] = useState<Student[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [notice, setNotice] = useState("");
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");
  const [moveId, setMoveId] = useState("");
  const [moveTo, setMoveTo] = useState("");

  const headers = { "Content-Type": "application/json", "x-admin-key": adminKey };

  async function post(body: object) {
    const res = await fetch("/api/admin/students", { method: "POST", headers, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Failed");
    return data;
  }

  async function unlock() {
    setMsg("");
    const res = await fetch("/api/admin/students", { headers });
    const data = await res.json();
    if (!res.ok) return setMsg(data.error || "Failed");
    setClasses(data.classes);
    setClassId(data.classes[0]?.id ?? "");
    setMClassId(data.classes[0]?.id ?? "");
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

  async function loadList(cid: string) {
    setLoadingList(true);
    try {
      const d = await post({ action: "list", classId: cid });
      setList(d.students);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    }
    setLoadingList(false);
  }

  async function act(fn: () => Promise<void>) {
    setMsg("");
    try { await fn(); } catch (e) { setMsg(e instanceof Error ? e.message : "Failed"); }
  }

  const saveName = (s: Student) => act(async () => {
    await post({ action: "rename", id: s.id, name: editName });
    setEditId("");
    await loadList(mClassId);
  });

  const resetPin = (s: Student) => act(async () => {
    if (!window.confirm(`Reset the PIN for ${s.name} (${s.login_id})? The old PIN will stop working.`)) return;
    const d = await post({ action: "resetPin", loginId: s.login_id });
    setNotice(`New PIN for ${s.name} (${s.login_id}): ${d.pin}. It is shown only once, so write it down now.`);
  });

  const toggleActive = (s: Student) => act(async () => {
    const next = !s.is_active;
    if (!next && !window.confirm(`Deactivate ${s.name}? They will not be able to log in. Nothing is deleted.`)) return;
    await post({ action: "setActive", id: s.id, value: next });
    await loadList(mClassId);
  });

  const doMove = (s: Student) => act(async () => {
    const to = classes.find((c) => c.id === moveTo);
    if (!to) { setMsg("Choose the new class first"); return; }
    if (!window.confirm(`Move ${s.name} to ${to.name}? They will get a NEW Login ID. The PIN stays the same.`)) return;
    const d = await post({ action: "moveClass", studentId: s.id, classId: moveTo });
    setNotice(`${s.name} moved to ${to.name}. New Login ID: ${d.loginId}. The PIN is unchanged.`);
    setMoveId("");
    setMoveTo("");
    await loadList(mClassId);
  });

  const className = classes.find((c) => c.id === classId)?.name ?? "";

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { unlock(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (mClassId) { setNotice(""); loadList(mClassId); } }, [mClassId]);

  const small = { padding: "4px 10px", fontSize: 13, marginRight: 6, marginBottom: 4 } as const;
  const cell = { padding: "6px 8px", textAlign: "left", verticalAlign: "top" } as const;

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

            <h2>Manage students</h2>
            <select value={mClassId} onChange={(e) => setMClassId(e.target.value)}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            {notice && <p className="adm-msg"><strong>{notice}</strong></p>}
            {loadingList && <p>Loading...</p>}
            {!loadingList && list.length === 0 && <p>No students in this class yet.</p>}

            {list.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={cell}>Login ID</th>
                      <th style={cell}>Name</th>
                      <th style={cell}>Status</th>
                      <th style={cell}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((s) => (
                      <tr key={s.id} style={{ borderTop: "1px solid #ddd", opacity: s.is_active ? 1 : 0.6 }}>
                        <td style={cell}>{s.login_id}</td>
                        <td style={cell}>
                          {editId === s.id ? (
                            <>
                              <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                              <div>
                                <button style={small} disabled={!editName.trim()} onClick={() => saveName(s)}>Save</button>
                                <button style={small} onClick={() => setEditId("")}>Cancel</button>
                              </div>
                            </>
                          ) : s.name}
                        </td>
                        <td style={cell}>{s.is_active ? "Active" : "Inactive"}</td>
                        <td style={cell}>
                          <button style={small} onClick={() => { setEditId(s.id); setEditName(s.name); }}>Edit name</button>
                          <button style={small} onClick={() => resetPin(s)}>Reset PIN</button>
                          <button style={small} onClick={() => toggleActive(s)}>{s.is_active ? "Deactivate" : "Activate"}</button>
                          <button style={small} onClick={() => { setMoveId(moveId === s.id ? "" : s.id); setMoveTo(""); }}>Move class</button>
                          {moveId === s.id && (
                            <div>
                              <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                                <option value="">Choose new class</option>
                                {classes.filter((c) => c.id !== mClassId).map((c) => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                              <button style={small} disabled={!moveTo} onClick={() => doMove(s)}>Move</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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