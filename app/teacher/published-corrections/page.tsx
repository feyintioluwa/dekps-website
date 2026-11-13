"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { DialogProvider, useConfirm, useToast } from "@/lib/dialog";
import "../teacher.css";
import "./corrections.css";

type Option = { id: string; name: string };
type Draft = { id: number; studentId: string; subjectId: string; kind: "test1" | "exam"; mark: string; reason: string; error?: string };
type Correction = { id: string; created_at: string; status: string; kind: string; old_score: number; proposed_score: number; reason: string; decision_note: string | null; student_id: string; subject_id: string; class_id: string };
const newDraft = (id: number): Draft => ({ id, studentId: "", subjectId: "", kind: "test1", mark: "", reason: "" });
async function json(r: Response): Promise<Record<string, any>> {
  const raw = await r.text(); let data: Record<string, any> = {};
  if (raw) { try { data = JSON.parse(raw); } catch { throw new Error(`Invalid server response (${r.status})`); } }
  if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : `Request failed (${r.status})`);
  return data;
}
function CorrectionsContent() {
  const toast = useToast(); const confirm = useConfirm();
  const [classes, setClasses] = useState<Option[]>([]);
  const [students, setStudents] = useState<Option[]>([]);
  const [subjects, setSubjects] = useState<Option[]>([]);
  const [term, setTerm] = useState(""); const [cls, setCls] = useState("");
  const [rows, setRows] = useState<Draft[]>([newDraft(1)]);
  const [nextId, setNextId] = useState(2);
  const [items, setItems] = useState<Correction[]>([]);
  const [loading, setLoading] = useState(true); const [classLoading, setClassLoading] = useState(false);
  const [busy, setBusy] = useState(false); const [pageError, setPageError] = useState("");
  const refresh = useCallback(async () => {
    const d = await json(await fetch("/api/teacher/published-corrections", { cache: "no-store" }));
    setItems(Array.isArray(d.items) ? d.items : []);
  }, []);
  useEffect(() => {
    let active = true;
    Promise.all([jsonFetch("/api/teacher/scores"), jsonFetch("/api/teacher/published-corrections")])
      .then(([s, c]) => { if (!active) return; setTerm(s.term?.id ?? ""); setClasses(s.classes ?? []); setItems(c.items ?? []); })
      .catch(e => { if (active) setPageError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    setStudents([]); setSubjects([]); setRows([newDraft(1)]); setNextId(2);
    if (!cls) return;
    setClassLoading(true);
    jsonFetch(`/api/teacher/scores?classId=${encodeURIComponent(cls)}`)
      .then(d => { if (active) { setStudents(d.students ?? []); setSubjects(d.subjects ?? []); } })
      .catch(e => { if (active) toast(e.message, "err"); })
      .finally(() => { if (active) setClassLoading(false); });
    return () => { active = false; };
  }, [cls, toast]);
  function update(id: number, patch: Partial<Draft>) { setRows(old => old.map(x => x.id === id ? { ...x, ...patch, error: undefined } : x)); }
  function add() { setRows(old => [...old, newDraft(nextId)]); setNextId(x => x + 1); }
  function remove(id: number) { setRows(old => old.filter(x => x.id !== id)); }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!term || !cls || classLoading) { toast("Select a class with an active term.", "err"); return; }
    const seen = new Set<string>();
    const checked = rows.map(r => {
      const value = Number(r.mark); const key = `${r.studentId}:${r.subjectId}:${r.kind}`;
      let error = "";
      if (!r.studentId || !r.subjectId || r.mark.trim() === "" || !r.reason.trim()) error = "Complete all fields.";
      else if (!Number.isInteger(value) || value < 0 || value > (r.kind === "test1" ? 40 : 60)) error = "Enter a whole mark within the allowed range.";
      else if (r.reason.trim().length < 10 || r.reason.trim().length > 1000) error = "Reason must contain 10–1000 characters.";
      else if (seen.has(key)) error = "This student, subject and score type is already listed.";
      seen.add(key);
      return { ...r, error };
    });
    if (checked.some(x => x.error)) { setRows(checked); toast("Please correct the highlighted rows.", "err"); return; }
    const ok = await confirm({ title: "Submit correction requests?", message: `Send ${rows.length} correction request${rows.length === 1 ? "" : "s"} to School Admin? Marks will not change until approved.`, confirmText: "Submit requests" });
    if (!ok) return;
    setBusy(true);
    const failures: Record<number, string> = {}; let sent = 0;
    // Existing API creates one independently audited request per POST.
    for (const r of rows) {
      try {
        await json(await fetch("/api/teacher/published-corrections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ termId: term, classId: cls, studentId: r.studentId, subjectId: r.subjectId, kind: r.kind, proposedScore: Number(r.mark), reason: r.reason.trim() }) }));
        sent++;
      } catch (e) { failures[r.id] = e instanceof Error ? e.message : "Request failed"; }
    }
    setRows(old => old.filter(r => failures[r.id]).map(r => ({ ...r, error: failures[r.id] })));
    if (Object.keys(failures).length === 0) { setRows([newDraft(nextId)]); setNextId(x => x + 1); }
    try { await refresh(); } catch (e) { toast(e instanceof Error ? e.message : "Could not refresh requests", "err"); }
    setBusy(false);
    if (sent) toast(`${sent} correction request${sent === 1 ? "" : "s"} sent for approval.${Object.keys(failures).length ? ` ${Object.keys(failures).length} failed; review the rows below.` : ""}`, Object.keys(failures).length ? "info" : "ok");
    else toast("No requests were submitted. Review the errors shown on each row.", "err");
  }
  return <main className="tch"><div className="tch-main pc-page">
    <a className="pc-back" href="/teacher">← Back to Teacher Dashboard</a>
    <div className="pc-heading"><div><span className="pc-eyebrow">TEACHER PORTAL / RESULTS</span><h1>Published Result Corrections</h1><p className="tch-muted">Request changes to published scores. School Admin reviews each request before any mark is updated.</p></div><span className="pc-heading-icon" aria-hidden="true">✎</span></div>
    <div className="pc-note"><strong>Approval required</strong><span>Each student and subject correction is submitted separately for audit. You can prepare several requests together below.</span></div>
    {pageError && <p className="pc-error" role="alert">{pageError}</p>}
    <form className="tch-card pc-form" onSubmit={submit}>
      <div className="pc-section-title"><div><h2>New correction requests</h2><p className="tch-muted">Select a class, then add as many students or subject corrections as needed.</p></div><span className="pc-counter">{rows.length} {rows.length === 1 ? "request" : "requests"}</span></div>
      <div className="pc-class-field"><label htmlFor="pc-class">Class</label><select id="pc-class" required value={cls} onChange={e => setCls(e.target.value)} disabled={busy || loading}><option value="">Select a class</option>{classes.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
      {rows.map((r, i) => <section className="pc-row" key={r.id} aria-label={`Correction ${i + 1}`}>
        <div className="pc-row-head"><strong><span className="pc-number">{i + 1}</span> Correction {i + 1}</strong>{rows.length > 1 && <button className="pc-remove" type="button" disabled={busy} onClick={() => remove(r.id)}>Remove</button>}</div>
        <div className="pc-fields">
          <div className="pc-field"><label htmlFor={`student-${r.id}`}>Student</label><select id={`student-${r.id}`} required value={r.studentId} disabled={!cls || classLoading || busy} onChange={e => update(r.id, { studentId: e.target.value })}><option value="">Select student</option>{students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="pc-field"><label htmlFor={`subject-${r.id}`}>Subject</label><select id={`subject-${r.id}`} required value={r.subjectId} disabled={!cls || classLoading || busy} onChange={e => update(r.id, { subjectId: e.target.value })}><option value="">Select subject</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="pc-field"><label htmlFor={`kind-${r.id}`}>Score type</label><select id={`kind-${r.id}`} value={r.kind} disabled={busy} onChange={e => update(r.id, { kind: e.target.value as Draft["kind"], mark: "" })}><option value="test1">CA / 40</option><option value="exam">Exam / 60</option></select></div>
          <div className="pc-field"><label htmlFor={`mark-${r.id}`}>Corrected mark</label><input id={`mark-${r.id}`} type="number" required min="0" max={r.kind === "test1" ? 40 : 60} step="1" placeholder={`0–${r.kind === "test1" ? 40 : 60}`} value={r.mark} disabled={busy} onChange={e => update(r.id, { mark: e.target.value })}/></div>
          <div className="pc-field pc-full"><label htmlFor={`reason-${r.id}`}>Reason for correction</label><textarea id={`reason-${r.id}`} required minLength={10} maxLength={1000} rows={2} placeholder="Explain why this mark needs to be corrected (at least 10 characters)" value={r.reason} disabled={busy} onChange={e => update(r.id, { reason: e.target.value })}/></div>
        </div>{r.error && <p className="pc-row-error" role="alert">{r.error}</p>}
      </section>)}
      <div className="pc-actions"><button type="button" className="pc-add" onClick={add} disabled={busy || !cls || classLoading}>+ Add another correction</button><button type="submit" className="tch-btn" disabled={busy || !term || !cls || classLoading || loading}>{busy ? "Submitting requests…" : `Submit ${rows.length} request${rows.length === 1 ? "" : "s"} for approval`}</button></div>
    </form>
    <section className="tch-card pc-history"><div className="pc-section-title"><div><h2>My correction requests</h2><p className="tch-muted">Track approval decisions and feedback from School Admin.</p></div><button type="button" className="pc-refresh" disabled={busy} onClick={() => void refresh().catch(e => toast(e.message, "err"))}>↻ Refresh</button></div>
      <div className="tch-table-wrap"><table className="tch-table"><thead><tr><th>Date</th><th>Student</th><th>Subject</th><th>Type</th><th>Score change</th><th>Status</th><th>Admin note</th></tr></thead><tbody>{items.map(x => <tr key={x.id}><td>{new Date(x.created_at).toLocaleDateString()}</td><td>{students.find(s => s.id === x.student_id)?.name ?? "—"}</td><td>{subjects.find(s => s.id === x.subject_id)?.name ?? "—"}</td><td>{x.kind === "test1" ? "CA" : "Exam"}</td><td>{x.old_score} → {x.proposed_score}</td><td><span className={`pc-status pc-${x.status}`}>{x.status === "approved" ? "Approved" : x.status === "rejected" ? "Rejected" : "Pending"}</span></td><td>{x.decision_note || "—"}</td></tr>)}</tbody></table></div>
      {!items.length && <div className="pc-empty">{loading ? "Loading requests…" : "No correction requests submitted yet."}</div>}
    </section>
  </div></main>;
}
async function jsonFetch(url: string) { return json(await fetch(url, { cache: "no-store" })); }
export default function PublishedCorrections() { return <DialogProvider><CorrectionsContent /></DialogProvider>; }
