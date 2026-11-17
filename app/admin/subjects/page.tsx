"use client";

import { useEffect, useState } from "react";
import "../students/admin.css";
import "./subjects.css";
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
    const name = editName.trim().replace(/\s+/g, " ");
    if (!name || name === s.name) return;
    const preview = await fetch(`/api/admin/subjects?renamePreview=${encodeURIComponent(s.id)}`, { headers: h });
    const details = await preview.json();
    if (!preview.ok) throw new Error(details.error || "Could not verify affected classes.");
    const affected: string[] = details.affectedClasses ?? [];
    const confirmed = await ask({
      title: "Rename subject globally?",
      message: `Change "${s.name}" to "${name}" in ${affected.length} class${affected.length === 1 ? "" : "es"}: ${affected.join(", ") || "none currently"}. Existing scores and assignments remain linked to the same subject. Already-published results retain their saved names.`,
      confirmText: "Rename everywhere",
    });
    if (!confirmed) return;
    await post({ action: "rename", subjectId: s.id, name });
    setEditId("");
    await loadAll();
    setMsg(`Renamed to "${name}" across ${affected.length} class${affected.length === 1 ? "" : "es"}. Already-published results keep their saved names.`);
  });


  return (
    <div className="adm subject-admin">
      <div className="subject-admin__hero">
        <div className="subject-admin__hero-icon" aria-hidden="true">▤</div>
        <div>
          <span className="subject-admin__eyebrow">ACADEMIC MANAGEMENT</span>
          <h1>Class Subjects</h1>
          <p>Manage class subjects, arrange their order and rename subjects across the school.</p>
        </div>
      </div>

      {msg && <p className="subject-admin__notice" role="status">{msg}</p>}

      {classes.length === 0 ? (
        <div className="subject-admin__empty">No classes are available yet.</div>
      ) : (
        <>
          <section className="subject-admin__section">
            <div className="subject-admin__section-heading">
              <div>
                <h2>Choose a class</h2>
                <p>Select the class whose subject list you want to manage.</p>
              </div>
              <span className="subject-admin__count">{rows.length} subjects</span>
            </div>
            <label className="subject-admin__field-label" htmlFor="subject-class">Class</label>
            <select
              id="subject-class"
              value={classId}
              disabled={busy}
              onChange={(e) => {
                setClassId(e.target.value);
                setEditId("");
                setAdds([]);
                setSel(new Set());
                setMsg("");
              }}
            >
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </section>

          <section className="subject-admin__section">
            <div className="subject-admin__section-heading">
              <div>
                <h2>Subjects in {className}</h2>
                <p>Move subjects up or down, rename globally, or remove them from this class.</p>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="subject-admin__empty">No subjects have been assigned to this class.</div>
            ) : (
              <>
                <div className="subject-admin__toolbar">
                  <label className="subject-admin__select-all">
                    <input
                      type="checkbox"
                      checked={allRowsTicked}
                      disabled={busy}
                      onChange={toggleAllRows}
                    />
                    Select all
                  </label>
                  <span className="subject-admin__selection">{sel.size} selected</span>
                  <button
                    type="button"
                    className="subject-admin__button subject-admin__button--danger"
                    disabled={busy || sel.size === 0}
                    onClick={removeSelected}
                  >
                    Remove selected
                  </button>
                </div>

                <div className="subject-admin__rows">
                  {rows.map((s, i) => (
                    <article className="subject-admin__subject" key={s.id}>
                      <div className="subject-admin__subject-main">
                        <input
                          type="checkbox"
                          checked={sel.has(s.id)}
                          disabled={busy}
                          onChange={() => toggleRow(s.id)}
                          aria-label={`Select ${s.name}`}
                        />
                        <span className="subject-admin__position">{i + 1}</span>
                        <div className="subject-admin__subject-content">
                          {editId === s.id ? (
                            <div className="subject-admin__rename">
                              <label htmlFor={`rename-${s.id}`}>Rename subject globally</label>
                              <input
                                id={`rename-${s.id}`}
                                value={editName}
                                disabled={busy}
                                maxLength={120}
                                onChange={(e) => setEditName(e.target.value)}
                              />
                              <small>All classes using this subject will see the new name. You will review the affected classes before confirming.</small>
                              <div className="subject-admin__rename-actions">
                                <button
                                  type="button"
                                  className="subject-admin__button subject-admin__button--primary"
                                  disabled={busy || !editName.trim() || editName.trim() === s.name}
                                  onClick={() => saveRename(s)}
                                >
                                  {busy ? "Working..." : "Review & rename"}
                                </button>
                                <button
                                  type="button"
                                  className="subject-admin__button subject-admin__button--light"
                                  disabled={busy}
                                  onClick={() => setEditId("")}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <strong>{s.name}</strong>
                              <span className="subject-admin__subject-caption">Subject {i + 1} of {rows.length}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="subject-admin__actions">
                        <div className="subject-admin__move">
                          <button
                            type="button"
                            className="subject-admin__icon-button"
                            disabled={busy || i === 0}
                            aria-label={`Move ${s.name} up`}
                            title="Move up"
                            onClick={() => move(i, -1)}
                          >↑</button>
                          <button
                            type="button"
                            className="subject-admin__icon-button"
                            disabled={busy || i === rows.length - 1}
                            aria-label={`Move ${s.name} down`}
                            title="Move down"
                            onClick={() => move(i, 1)}
                          >↓</button>
                        </div>
                        <button
                          type="button"
                          className="subject-admin__button subject-admin__button--rename"
                          disabled={busy}
                          onClick={() => {
                            setEditId(editId === s.id ? "" : s.id);
                            setEditName(s.name);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="subject-admin__button subject-admin__button--remove"
                          disabled={busy}
                          onClick={() => remove(s)}
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="subject-admin__section">
            <div className="subject-admin__section-heading">
              <div>
                <h2>Add existing subjects</h2>
                <p>Select subjects to add to {className}. They will be added in the order selected.</p>
              </div>
              {adds.length > 0 && <span className="subject-admin__count">{adds.length} chosen</span>}
            </div>

            {available.length === 0 ? (
              <div className="subject-admin__empty">All existing subjects are already assigned to this class.</div>
            ) : (
              <>
                <div className="subject-admin__available">
                  {available.map((s) => {
                    const at = adds.indexOf(s.id);
                    return (
                      <label className="subject-admin__available-item" key={s.id}>
                        <input
                          type="checkbox"
                          disabled={busy}
                          checked={at >= 0}
                          onChange={() => toggleAdd(s.id)}
                        />
                        <span>{s.name}</span>
                        {at >= 0 && <em>#{at + 1}</em>}
                      </label>
                    );
                  })}
                </div>
                <div className="subject-admin__footer-actions">
                  <button
                    type="button"
                    className="subject-admin__button subject-admin__button--primary"
                    disabled={busy || adds.length === 0}
                    onClick={addSelected}
                  >
                    Add {adds.length || ""} selected
                  </button>
                  <button
                    type="button"
                    className="subject-admin__button subject-admin__button--light"
                    disabled={busy || adds.length === 0}
                    onClick={() => setAdds([])}
                  >
                    Clear selection
                  </button>
                </div>
              </>
            )}
          </section>

          <section className="subject-admin__section">
            <div className="subject-admin__section-heading">
              <div>
                <h2>Create a new subject</h2>
                <p>Create a subject and add it to the end of {className}&apos;s list.</p>
              </div>
            </div>
            <div className="subject-admin__create">
              <div>
                <label className="subject-admin__field-label" htmlFor="new-subject-name">Subject name</label>
                <input
                  id="new-subject-name"
                  placeholder="e.g. Digital Technology"
                  value={newName}
                  disabled={busy}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="subject-admin__button subject-admin__button--primary"
                disabled={busy || !newName.trim()}
                onClick={addNew}
              >
                Create & add
              </button>
            </div>
            <p className="subject-admin__footnote">
              Removing a subject from a class does not delete its saved scores or previously published results.
              Global renaming preserves the subject ID and existing assignments.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
