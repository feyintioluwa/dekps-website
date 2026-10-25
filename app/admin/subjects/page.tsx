"use client";

import { useEffect, useState } from "react";
import "../students/admin.css";
import { useAdminKey } from "../AdminShell";
import { useConfirm } from "../Dialog";

type Opt = { id: string; name: string };
type Item = { subject_id: string; position: number };

export default function ClassSubjects() {
  const key = useAdminKey();
  const ask = useConfirm();
  const [classes, setClasses] = useState<Opt[]>([]);
  const [subjects, setSubjects] = useState<Opt[]>([]);
  const [classId, setClassId] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState("");
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");

  const h = { "Content-Type": "application/json", "x-admin-key": key };

  async function post(body: object) {
    const r = await fetch("/api/admin/subjects", { method: "POST", headers: h, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || "Failed");
    return d;
  }

  async function loadAll() {
    const r = await fetch("/api/admin/subjects", { headers: h });
    const d = await r.json();
    if (!r.ok) return setMsg(d.error || "Failed");
    setClasses(d.classes);
    setSubjects(d.subjects);
    if (!classId) setClassId(d.classes[0]?.id ?? "");
  }

  async function loadClass(cid: string) {
    const r = await fetch(`/api/admin/subjects?classId=${cid}`, { headers: h });
    const d = await r.json();
    if (!r.ok) return setMsg(d.error || "Failed");
    setItems(d.items);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadAll(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (classId) { setEditId(""); loadClass(classId); } }, [classId]);

  async function act(fn: () => Promise<void>) {
    setMsg(""); setBusy(true);
    try { await fn(); } catch (e) { setMsg(e instanceof Error ? e.message : "Failed"); }
    setBusy(false);
  }

  const className = classes.find((c) => c.id === classId)?.name ?? "";
  const rows = items
    .map((it) => subjects.find((s) => s.id === it.subject_id))
    .filter((s): s is Opt => !!s);
  const available = subjects.filter((s) => !items.some((i) => i.subject_id === s.id));

  const move = (i: number, dir: -1 | 1) => act(async () => {
    const order = rows.map((s) => s.id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    await post({ action: "reorder", classId, order });
    await loadClass(classId);
  });

  const remove = (s: Opt) => act(async () => {
    if (!(await ask({ title: "Remove subject?", message: `Remove "${s.name}" from ${className}? Scores already saved are NOT deleted, but the subject will no longer appear in this class's template or in newly published results.`, confirmText: "Remove", danger: true }))) return;
    await post({ action: "remove", classId, subjectId: s.id });
    await loadClass(classId);
    setMsg(`"${s.name}" removed from ${className}.`);
  });

  const addExisting = () => act(async () => {
    await post({ action: "add", classId, subjectId: pick });
    setPick("");
    await loadClass(classId);
    setMsg("Subject added to the end of the list.");
  });

  const addNew = () => act(async () => {
    await post({ action: "add", classId, newName });
    setNewName("");
    await loadAll();
    await loadClass(classId);
    setMsg("Subject added to the end of the list.");
  });

  const saveRename = (s: Opt) => act(async () => {
    await post({ action: "rename", subjectId: s.id, name: editName });
    setEditId("");
    await loadAll();
    setMsg("Renamed. It changes in every class that uses this subject; results already published keep the old name.");
  });

  const small = { padding: "4px 10px", fontSize: 13, marginRight: 6, marginBottom: 4 } as const;
  const cell = { padding: "6px 8px", textAlign: "left", verticalAlign: "middle" } as const;

  return (
    <div className="adm">
      <h1>Class Subjects</h1>
      {msg && <p className="adm-msg">{msg}</p>}

      {classes.length > 0 && (
        <>
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <h2>{className}: subjects in order</h2>
          {rows.length === 0 && <p>No subjects in this class yet.</p>}
          {rows.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr><th style={cell}>#</th><th style={cell}>Subject</th><th style={cell}>Actions</th></tr>
                </thead>
                <tbody>
                  {rows.map((s, i) => (
                    <tr key={s.id} style={{ borderTop: "1px solid #ddd" }}>
                      <td style={cell}>{i + 1}</td>
                      <td style={cell}>
                        {editId === s.id ? (
                          <>
                            <input value={editName} onChange={(e) => setEditName(e.target.value)} />
                            <div>
                              <button style={small} disabled={busy || !editName.trim()} onClick={() => saveRename(s)}>Save</button>
                              <button style={small} onClick={() => setEditId("")}>Cancel</button>
                            </div>
                            <div style={{ fontSize: 12, color: "#687385" }}>Renames it in every class that uses it.</div>
                          </>
                        ) : s.name}
                      </td>
                      <td style={cell}>
                        <button style={small} disabled={busy || i === 0} onClick={() => move(i, -1)}>Up</button>
                        <button style={small} disabled={busy || i === rows.length - 1} onClick={() => move(i, 1)}>Down</button>
                        <button style={small} disabled={busy} onClick={() => { setEditId(s.id); setEditName(s.name); }}>Rename</button>
                        <button style={small} disabled={busy} onClick={() => remove(s)}>Remove</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2>Add a subject to {className}</h2>
          <select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Choose an existing subject</option>
            {available.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button disabled={busy || !pick} onClick={addExisting}>Add subject</button>

          <h3 style={{ marginTop: 16 }}>Or create a new subject</h3>
          <div className="adm-row">
            <input placeholder="New subject name (written in full)" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button disabled={busy || !newName.trim()} onClick={addNew}>Create and add</button>
          </div>

          <p style={{ fontSize: ".85rem", color: "#687385", marginTop: 10 }}>
            Removing a subject only takes it off this class&apos;s list. Saved scores and published results are never deleted.
          </p>
        </>
      )}
    </div>
  );
}
