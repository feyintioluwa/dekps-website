"use client";

import { useEffect, useState } from "react";
import "../students/admin.css";
import { useAdminKey } from "../AdminShell";
import { useConfirm } from "../Dialog";

type Opt = { id: string; name: string };
type Link = { class_id: string; subject_id: string };
type Asg = {
  id: string; term_id: string; class_id: string; subject_id: string; title: string;
  instructions: string | null; max_score: number; due_at: string | null; is_published: boolean;
};
type Sub = {
  studentId: string; name: string; loginId: string; answer: string | null;
  files: { name: string; type: string; url: string }[];
  submittedAt: string | null; score: number | null; comment: string | null;
};

export default function AdminAssignments() {
  const key = useAdminKey();
  const ask = useConfirm();
  const [classes, setClasses] = useState<Opt[]>([]);
  const [subjects, setSubjects] = useState<Opt[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [terms, setTerms] = useState<Record<string, unknown>[] | null>(null);
  const [list, setList] = useState<Asg[]>([]);
  const [msg, setMsg] = useState("");
  const [f, setF] = useState({ termId: "", subjectId: "", title: "", instructions: "", maxScore: "10", dueAt: "" });
  const [classIds, setClassIds] = useState<string[]>([]);
  const [sel, setSel] = useState("");
  const [subs, setSubs] = useState<Sub[]>([]);
  const [edit, setEdit] = useState<Record<string, { score: string; comment: string }>>({});
  const [saved, setSaved] = useState<Record<string, { ok: boolean; text: string }>>({});

  const h = { "Content-Type": "application/json", "x-admin-key": key };
  const post = async (body: object) => {
    const r = await fetch("/api/admin/assignments", { method: "POST", headers: h, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Failed");
    return d;
  };
  const name = (l: Opt[], id: string) => l.find((x) => x.id === id)?.name ?? "?";

  async function load() {
    const r = await fetch("/api/admin/assignments", { headers: h });
    const d = await r.json();
    if (!r.ok) return setMsg(d.error || "Failed");
    setClasses(d.classes); setSubjects(d.subjects); setLinks(d.classSubjects ?? []);
    setTerms(d.terms); setList(d.assignments);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  function toggleClass(id: string) {
    setClassIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
    setF((p) => ({ ...p, subjectId: "" }));
  }

  async function create() {
    try {
      setMsg("Creating...");
      const d = await post({
        action: "createMany", ...f, classIds,
        dueAt: f.dueAt ? new Date(f.dueAt).toISOString() : null,
      });
      await load();
      setSel(d.ids[0]); setSubs([]);
      setF({ ...f, title: "", instructions: "", dueAt: "" });
      setMsg(
        `Created for ${d.ids.length} class${d.ids.length === 1 ? "" : "es"} as drafts. Publish each one from Manage when students should see it.` +
        (d.skipped?.length ? ` Skipped (they do not take this subject): ${d.skipped.join(", ")}.` : "")
      );
    } catch (e) { setMsg("Could not create: " + (e as Error).message); }
  }
  async function publish(v: boolean) {
    try {
      await post({ action: "publish", assignmentId: sel, value: v });
      setMsg(v ? "Published: students can see it." : "Unpublished.");
      load();
    } catch (e) { setMsg((e as Error).message); }
  }
  async function remove() {
    if (!cur) return;
    if (!(await ask({ title: "Delete assignment?", message: `Delete "${cur.title}"? This cannot be undone. It only works if no student has submitted.`, confirmText: "Delete", danger: true }))) return;
    try {
      await post({ action: "delete", assignmentId: sel });
      setSel(""); setSubs([]);
      setMsg("Assignment deleted.");
      load();
    } catch (e) { setMsg((e as Error).message); }
  }
  async function removeAll() {
    if (!cur) return;
    if (!(await ask({
      title: "Delete permanently?",
      message: `This permanently deletes "${cur.title}", all student answers, marks and uploaded files for it. It cannot be undone.`,
      confirmText: "Delete permanently",
      danger: true,
      typeToConfirm: cur.title,
    }))) return;
    try {
      await post({ action: "deleteAll", assignmentId: sel, confirmTitle: cur.title });
      setSel(""); setSubs([]);
      setMsg("Assignment and all student work deleted.");
      load();
    } catch (e) { setMsg((e as Error).message); }
  }
  async function loadSubs() {
    try {
      const d = await post({ action: "submissions", assignmentId: sel });
      setSubs(d.rows);
      const m: Record<string, { score: string; comment: string }> = {};
      for (const r of d.rows as Sub[]) m[r.studentId] = { score: r.score === null ? "" : String(r.score), comment: r.comment ?? "" };
      setEdit(m);
      const n = (d.rows as Sub[]).filter((r) => r.submittedAt).length;
      setMsg(`${n} of ${d.rows.length} students have submitted.`);
    } catch (e) { setMsg((e as Error).message); }
  }
  async function mark(studentId: string) {
    try {
      const e = edit[studentId] ?? { score: "", comment: "" };
      setSaved((s) => ({ ...s, [studentId]: { ok: true, text: "Saving..." } }));
      await post({ action: "mark", assignmentId: sel, studentId, score: e.score, comment: e.comment });
      const max = cur?.max_score ?? "";
      setSaved((s) => ({ ...s, [studentId]: { ok: true, text: e.score === "" ? "Saved (no mark)" : `Saved: ${e.score}/${max}` } }));
    } catch (er) {
      setSaved((s) => ({ ...s, [studentId]: { ok: false, text: (er as Error).message } }));
    }
  }

  // Subjects taken by at least one ticked class (the server skips ticked classes that don't take it)
  const classSubjects = subjects.filter((s) => links.some((l) => classIds.includes(l.class_id) && l.subject_id === s.id));
  const cur = list.find((a) => a.id === sel);
  const termLabel = (t: Record<string, unknown>) =>
    t.term && t.session ? `${t.term} — ${t.session}` : String(t.name ?? t.term ?? t.label ?? t.id);
  const labelStyle = { display: "block", fontSize: ".85rem", color: "#687385", marginBottom: 4 } as const;
  const chk = { width: "auto", marginRight: 8 } as const;

  return (
    <div className="adm">
      <h1>Assignments — Admin</h1>
      {msg && <p className="adm-msg">{msg}</p>}

      {classes.length > 0 && (
        <>
          <h2>1. New assignment</h2>
          {terms ? (
            <select value={f.termId} onChange={(e) => setF({ ...f, termId: e.target.value })}>
              <option value="">Select term</option>
              {terms.map((t) => <option key={String(t.id)} value={String(t.id)}>{termLabel(t)}</option>)}
            </select>
          ) : (
            <input placeholder="Term ID (uuid)" value={f.termId} onChange={(e) => setF({ ...f, termId: e.target.value })} />
          )}

          <label style={labelStyle}>Classes (tick one or more)</label>
          <div style={{ border: "1px solid #dfe4ea", borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div className="adm-row" style={{ marginBottom: 8 }}>
              <button type="button" onClick={() => { setClassIds(classes.map((c) => c.id)); setF({ ...f, subjectId: "" }); }}>Select all</button>
              <button type="button" onClick={() => { setClassIds([]); setF({ ...f, subjectId: "" }); }}>Clear</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
              {classes.map((c) => (
                <label key={c.id} style={{ display: "flex", alignItems: "center" }}>
                  <input type="checkbox" style={chk} checked={classIds.includes(c.id)} onChange={() => toggleClass(c.id)} />
                  {c.name}
                </label>
              ))}
            </div>
          </div>

          <select value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}>
            <option value="">{!classIds.length ? "Tick a class first" : classSubjects.length ? "Select subject" : "No subjects set for these classes"}</option>
            {classSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input placeholder="Title e.g. Assignment 1: Plant parts" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <textarea rows={5} placeholder="Instructions / the task for the students" value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} />
          <div className="adm-row">
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Marks it is out of (1 to 100)</label>
              <input value={f.maxScore} onChange={(e) => setF({ ...f, maxScore: e.target.value })} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Deadline (optional)</label>
              <input type="datetime-local" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} />
            </div>
          </div>
          <button disabled={!f.termId || !classIds.length || !f.subjectId || !f.title.trim()} onClick={create}>
            {classIds.length > 1 ? `Create for ${classIds.length} classes` : "Create"}
          </button>

          <h2>2. Manage</h2>
          <select value={sel} onChange={(e) => { setSel(e.target.value); setSubs([]); }}>
            <option value="">Select an assignment</option>
            {list.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} · {name(classes, a.class_id)} · {name(subjects, a.subject_id)} {a.is_published ? "(published)" : "(draft)"}
              </option>
            ))}
          </select>

          {cur && (
            <>
              <p style={{ fontSize: ".85rem", color: "#687385" }}>
                Out of {cur.max_score}.{cur.due_at ? ` Deadline: ${new Date(cur.due_at).toLocaleString()}.` : " No deadline."}
              </p>
              {cur.instructions && <p style={{ whiteSpace: "pre-wrap" }}>{cur.instructions}</p>}
              <div className="adm-row" style={{ margin: "8px 0" }}>
                <button onClick={() => publish(!cur.is_published)}>{cur.is_published ? "Unpublish" : "Publish"}</button>
                <button onClick={loadSubs}>View submissions &amp; mark</button>
                <button disabled={cur.is_published} onClick={remove}>Delete</button>
                <button style={{ background: "#9e1824" }} disabled={cur.is_published} onClick={removeAll}>Delete with student work</button>
              </div>

              {subs.length > 0 && subs.map((r) => (
                <div key={r.studentId} style={{ border: "1px solid #e3e8ef", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <strong>{r.name}</strong> <span style={{ color: "#687385", fontSize: ".85rem" }}>{r.loginId}</span>
                  <div style={{ fontSize: ".85rem", color: r.submittedAt ? "#1a7f4b" : "#a33" }}>
                    {r.submittedAt ? `Submitted ${new Date(r.submittedAt).toLocaleString()}` : "Not submitted"}
                  </div>
                  {r.submittedAt && (
                    <>
                      <p style={{ whiteSpace: "pre-wrap", background: "#f6f8fb", padding: 8, borderRadius: 6 }}>{r.answer || (r.files.length ? "(no typed answer)" : "(empty answer)")}</p>
                      {r.files.length > 0 && (
                        <div style={{ margin: "6px 0" }}>
                          {r.files.map((fl, i) => (
                            fl.url
                              ? <a key={i} href={fl.url} target="_blank" rel="noreferrer" style={{ display: "block" }}>📎 {fl.name}</a>
                              : <span key={i} style={{ display: "block" }}>📎 {fl.name} (link unavailable)</span>
                          ))}
                        </div>
                      )}
                      <div className="adm-row">
                        <input placeholder={`Mark /${cur.max_score}`} style={{ maxWidth: 110 }}
                          value={edit[r.studentId]?.score ?? ""}
                          onChange={(e) => setEdit({ ...edit, [r.studentId]: { score: e.target.value, comment: edit[r.studentId]?.comment ?? "" } })} />
                        <input placeholder="Comment (optional)"
                          value={edit[r.studentId]?.comment ?? ""}
                          onChange={(e) => setEdit({ ...edit, [r.studentId]: { score: edit[r.studentId]?.score ?? "", comment: e.target.value } })} />
                        <button onClick={() => mark(r.studentId)}>Save mark</button>
                      </div>
                      {saved[r.studentId] && (
                        <div style={{ marginTop: 6, fontWeight: 600, color: saved[r.studentId].ok ? "#1a7f4b" : "#c62828" }}>
                          {saved[r.studentId].ok ? "✓ " : "✗ "}{saved[r.studentId].text}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}
