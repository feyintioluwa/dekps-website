"use client";

import { useEffect, useState } from "react";
import "../students/admin.css";
import { useAdminKey } from "../AdminShell";

type Opt = { id: string; name: string };
type Link = { class_id: string; subject_id: string };
type Asg = {
  id: string; term_id: string; class_id: string; subject_id: string; title: string;
  instructions: string | null; max_score: number; due_at: string | null; is_published: boolean;
};
type Sub = {
  studentId: string; name: string; loginId: string; answer: string | null;
  submittedAt: string | null; score: number | null; comment: string | null;
};

export default function AdminAssignments() {
  const key = useAdminKey();
  const [classes, setClasses] = useState<Opt[]>([]);
  const [subjects, setSubjects] = useState<Opt[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [terms, setTerms] = useState<Record<string, unknown>[] | null>(null);
  const [list, setList] = useState<Asg[]>([]);
  const [msg, setMsg] = useState("");
  const [f, setF] = useState({ termId: "", classId: "", subjectId: "", title: "", instructions: "", maxScore: "10", dueAt: "" });
  const [sel, setSel] = useState("");
  const [subs, setSubs] = useState<Sub[]>([]);
  const [edit, setEdit] = useState<Record<string, { score: string; comment: string }>>({});

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

  async function create() {
    try {
      setMsg("Creating...");
      const d = await post({
        action: "create", ...f,
        dueAt: f.dueAt ? new Date(f.dueAt).toISOString() : null,
      });
      await load();
      setSel(d.id); setSubs([]);
      setF({ ...f, title: "", instructions: "", dueAt: "" });
      setMsg("Created as a draft. Press Publish when students should see it.");
    } catch (e) { setMsg("Could not create: " + (e as Error).message); }
  }
  async function publish(v: boolean) {
    try {
      await post({ action: "publish", assignmentId: sel, value: v });
      setMsg(v ? "Published: students can see it." : "Unpublished.");
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
      await post({ action: "mark", assignmentId: sel, studentId, score: e.score, comment: e.comment });
      setMsg("Saved.");
    } catch (er) { setMsg((er as Error).message); }
  }

  const classSubjects = subjects.filter((s) => links.some((l) => l.class_id === f.classId && l.subject_id === s.id));
  const cur = list.find((a) => a.id === sel);
  const termLabel = (t: Record<string, unknown>) =>
    t.term && t.session ? `${t.term} — ${t.session}` : String(t.name ?? t.term ?? t.label ?? t.id);
  const labelStyle = { display: "block", fontSize: ".85rem", color: "#687385", marginBottom: 4 } as const;

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
          <select value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value, subjectId: "" })}>
            <option value="">Select class</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}>
            <option value="">{!f.classId ? "Select class first" : classSubjects.length ? "Select subject" : "No subjects set for this class"}</option>
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
          <button disabled={!f.termId || !f.classId || !f.subjectId || !f.title.trim()} onClick={create}>Create</button>

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
              </div>

              {subs.length > 0 && subs.map((r) => (
                <div key={r.studentId} style={{ border: "1px solid #e3e8ef", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <strong>{r.name}</strong> <span style={{ color: "#687385", fontSize: ".85rem" }}>{r.loginId}</span>
                  <div style={{ fontSize: ".85rem", color: r.submittedAt ? "#1a7f4b" : "#a33" }}>
                    {r.submittedAt ? `Submitted ${new Date(r.submittedAt).toLocaleString()}` : "Not submitted"}
                  </div>
                  {r.submittedAt && (
                    <>
                      <p style={{ whiteSpace: "pre-wrap", background: "#f6f8fb", padding: 8, borderRadius: 6 }}>{r.answer || "(empty answer)"}</p>
                      <div className="adm-row">
                        <input placeholder={`Mark /${cur.max_score}`} style={{ maxWidth: 110 }}
                          value={edit[r.studentId]?.score ?? ""}
                          onChange={(e) => setEdit({ ...edit, [r.studentId]: { score: e.target.value, comment: edit[r.studentId]?.comment ?? "" } })} />
                        <input placeholder="Comment (optional)"
                          value={edit[r.studentId]?.comment ?? ""}
                          onChange={(e) => setEdit({ ...edit, [r.studentId]: { score: edit[r.studentId]?.score ?? "", comment: e.target.value } })} />
                        <button onClick={() => mark(r.studentId)}>Save mark</button>
                      </div>
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
