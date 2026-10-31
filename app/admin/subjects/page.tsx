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
  const [adds, setAdds] = useState<string[]>([]); // subjects ticked to add, in the order they were ticked
  const [sel, setSel] = useState<Set<string>>(new Set()); // rows ticked for removal
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

  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { loadAll(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect
  useEffect(() => { if (classId) loadClass(classId); }, [classId]);

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

  // ---- remove one ----
  const remove = (s: Opt) => act(async () => {
    if (!(await ask({ title: "Remove subject?", message: `Remove "${s.name}" from ${className}? Scores already saved are NOT deleted, but the subject will no longer appear in this class's template or in newly published results.`, confirmText: "Remove", danger: true }))) return;
    await post({ action: "remove", classId, subjectId: s.id });
    setSel((cur) => { const n = new Set(cur); n.delete(s.id); return n; });
    await loadClass(classId);
    setMsg(`"${s.name}" removed from ${className}.`);
  });

  // ---- remove several ticked rows at once ----
  const toggleRow = (id: string) =>
    setSel((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allRowsTicked = rows.length > 0 && rows.every((s) => sel.has(s.id));
  const toggleAllRows = () => setSel(allRowsTicked ? new Set() : new Set(rows.map((s) => s.id)));

  const removeSelected = () => act(async () => {
    const chosen = rows.filter((s) => sel.has(s.id));
    if (chosen.length === 0) return;
    const names = chosen.map((s) => `"${s.name}"`).join(", ");
    if (!(await ask({ title: `Remove ${chosen.length} subject${chosen.length === 1 ? "" : "s"}?`, message: `Remove ${names} from ${className}? Scores already saved are NOT deleted, but these subjects will no longer appear in this class's template or in newly published results.`, confirmText: "Remove", danger: true }))) return;
    for (const s of chosen) {
      await post({ action: "remove", classId, subjectId: s.id });
    }
    setSel(new Set());
    await loadClass(classId);
    setMsg(`${chosen.length} subject${chosen.length === 1 ? "" : "s"} removed from ${className}.`);
  });

  // ---- add several at once ----
  const toggleAdd = (id: string) =>
    setAdds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const addSelected = () => act(async () => {
    const chosen = adds.filter((id) => available.some((s) => s.id === id));
    for (const id of chosen) {
      await post({ action: "add", classId, subjectId: id });
    }
    setAdds([]);
    await loadClass(classId);
    setMsg(`${chosen.length} subject${chosen.length === 1 ? "" : "s"} added to ${className}, in the order you ticked them.`);
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
  const tick = { width: "auto", margin: 0 } as const;

  return (
    <div className="adm">
      <h1>Class Subjects</h1>
      {msg && <p className="adm-msg">{msg}</p>}

      {classes.length > 0 && (
        <>
          <select value={classId} onChange={(e) => { setClassId(e.target.value); setEditId(""); setAdds([]); setSel(new Set()); }}>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <h2>{className}: subjects in order</h2>
          {rows.length === 0 && <p>No subjects in this class yet.</p>}
          {rows.length > 0 && (
            <>
              <div style={{ marginBottom: 8 }}>
                <button disabled={busy || sel.size === 0} onClick={removeSelected}>
                  {sel.size > 0 ? `Remove ${sel.size} selected` : "Remove selected"}
                </button>
                <span style={{ marginLeft: 10, fontSize: ".85rem", color: "#687385" }}>Tick the subjects you want to remove, then press the button.</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ ...cell, width: 34 }}>
                        <input type="checkbox" style={tick} checked={allRowsTicked} onChange={toggleAllRows} aria-label="Select all subjects" />
                      </th>
                      <th style={cell}>#</th><th style={cell}>Subject</th><th style={cell}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s, i) => (
                      <tr key={s.id} style={{ borderTop: "1px solid #ddd" }}>
                        <td style={cell}>
                          <input type="checkbox" style={tick} checked={sel.has(s.id)} onChange={() => toggleRow(s.id)} aria-label={`Select ${s.name}`} />
                        </td>
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
            </>
          )}

          <h2>Add subjects to {className}</h2>
          {available.length === 0 ? (
            <p>Every existing subject is already in this class.</p>
          ) : (
            <>
              <p style={{ fontSize: ".85rem", color: "#687385", margin: "0 0 6px" }}>
                Tick as many as you want. They are added to the end of the list in the order you tick them.
              </p>
              <div style={{ maxHeight: 280, overflowY: "auto", border: "1px solid #dfe4ea", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
                {available.map((s) => {
                  const at = adds.indexOf(s.id);
                  return (
                    <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input type="checkbox" style={tick} checked={at >= 0} onChange={() => toggleAdd(s.id)} />
                      <span style={{ flex: 1 }}>{s.name}</span>
                      {at >= 0 && <span style={{ fontSize: 12, color: "#687385" }}>#{at + 1}</span>}
                    </label>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button disabled={busy || adds.length === 0} onClick={addSelected}>
                  {adds.length > 0 ? `Add ${adds.length} selected` : "Add selected"}
                </button>
                <button disabled={busy || adds.length === 0} onClick={() => setAdds([])}>Clear ticks</button>
              </div>
            </>
          )}

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
