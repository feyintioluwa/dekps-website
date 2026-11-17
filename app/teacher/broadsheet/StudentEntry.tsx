"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Option = { id: string; name: string };
type Student = { id: string; login_id: string; name: string };
type Mark = { student_id: string; subject_id: string; kind: string; score: number };
type Term = { id: string; label: string; locked: boolean } | null;
type Data = {
  term: Term; students: Student[]; subjects: Option[];
  studentSubjects: { student_id: string; subject_id: string }[];
  scores: Mark[]; editableSubjectIds: string[]; frozenSubjectIds: string[];
};
type Entry = { ca: string; exam: string };
const API = "/api/teacher/scores";
const key = (studentId: string, subjectId: string) => `${studentId}|${subjectId}`;

function entries(data: Data): Record<string, Entry> {
  const result: Record<string, Entry> = {};
  for (const student of data.students) for (const subject of data.subjects) {
    const find = (kind: string) => data.scores.find(s => s.student_id === student.id && s.subject_id === subject.id && (s.kind === kind || (kind === "ca" && s.kind === "test1")))?.score;
    const ca = find("ca"); const exam = find("exam");
    result[key(student.id, subject.id)] = { ca: ca === undefined ? "" : String(ca), exam: exam === undefined ? "" : String(exam) };
  }
  return result;
}

export default function StudentEntry({ classId, classes, onClassChange, onDirtyChange }: { classId: string; classes: Option[]; onClassChange: (id: string) => void; onDirtyChange: (dirty: boolean) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<Record<string, Entry>>({});
  const [original, setOriginal] = useState<Record<string, Entry>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  const load = useCallback(async (id: string) => {
    const response = await fetch(`${API}?classId=${encodeURIComponent(id)}&view=student`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Could not load scores.");
    return body as Data;
  }, []);
  useEffect(() => {
    if (!classId) return;
    let active = true;
    setLoading(true); setData(null); setMessage(""); setConflict(false);
    load(classId).then(fresh => {
      if (!active) return;
      setData(fresh); const next = entries(fresh); setValues(next); setOriginal(next); setIndex(0);
    }).catch(e => { if (active) setMessage(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [classId, load]);
  const student = data?.students[index];
  const dirty = useMemo(() => Object.keys(values).some(k => values[k]?.ca !== original[k]?.ca || values[k]?.exam !== original[k]?.exam), [values, original]);
  useEffect(() => { onDirtyChange(dirty); return () => onDirtyChange(false); }, [dirty, onDirtyChange]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const subjects = useMemo(() => {
    if (!data || !student) return [];
    const enrolled = data.studentSubjects.filter(s => s.student_id === student.id);
    return enrolled.length ? data.subjects.filter(s => enrolled.some(e => e.subject_id === s.id)) : data.subjects;
  }, [data, student]);
  const editable = (id: string) => !!data && !data.term?.locked && data.editableSubjectIds.includes(id) && !data.frozenSubjectIds.includes(id);
  const canEdit = (id: string) => editable(id) && online && !saving && !conflict;
  const update = (subjectId: string, kind: keyof Entry, value: string) => {
    if (!student || (value !== "" && !/^\d{0,2}$/.test(value))) return;
    const k = key(student.id, subjectId);
    setValues(prev => ({ ...prev, [k]: { ...prev[k], [kind]: value } }));
  };
  const changeStudent = (next: number) => {
    if (dirty && !window.confirm("Discard all unsaved changes before switching students?")) return;
    if (dirty) setValues({ ...original });
    setIndex(next); setMessage("");
  };
  const save = async () => {
    if (!data || !student || !classId || saving || !online || conflict || !dirty) return;
    const scores: { subjectId: string; kind: "ca" | "exam"; score: number; expected: number | null }[] = [];
    for (const subject of data.subjects) {
      const k = key(student.id, subject.id); const now = values[k]; const before = original[k];
      if (!now || !before) continue;
      for (const kind of ["ca", "exam"] as const) {
        if (now[kind] === before[kind]) continue;
        if (!editable(subject.id)) { setMessage(`Cannot edit ${subject.name}. It is not assigned to you or is locked.`); return; }
        if (now[kind] === "") { setMessage("Clearing a saved score is not supported. Restore its original value."); return; }
        const n = Number(now[kind]); const max = kind === "ca" ? 40 : 60;
        if (!Number.isInteger(n) || n < 0 || n > max) { setMessage(`${subject.name}: ${kind.toUpperCase()} must be 0–${max}.`); return; }
        scores.push({ subjectId: subject.id, kind, score: n, expected: before[kind] === "" ? null : Number(before[kind]) });
      }
    }
    if (!scores.length) return;
    setSaving(true); setMessage("Saving scores…");
    try {
      const response = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "save-protected", classId, rows: [{ loginId: student.login_id, scores }] }) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409 || result.code === "SCORE_CONFLICT") { setConflict(true); throw new Error("Score conflict: another edit was saved. Your marks are still visible. Reload the page to review before trying again."); }
        throw new Error(result.error || "Saving failed.");
      }
      try {
        const fresh = await load(classId);
        setData(fresh); const next = entries(fresh); setValues(next); setOriginal(next);
        setMessage(`${result.saved ?? scores.length} score entries saved. Results have not been published.`);
      } catch {
        setConflict(true); setMessage("Save accepted, but verification failed. Reload to verify before editing again.");
      }
    } catch (e) { setMessage(e instanceof Error ? e.message : "Saving failed."); }
    finally { setSaving(false); }
  };
  return (
    <div className="bs-student-mode">
      <section className="bs-panel bs-selector bs-student-class-panel">
        <div className="bs-panel-heading"><div><h2>Student Score Entry</h2><p>Enter CA and examination marks for one student at a time.</p></div></div>
        <div className="bs-filters"><label>Class
          <select value={classId} disabled={saving} onChange={e => {
            if (dirty && !window.confirm("Discard unsaved student scores and change class?")) return;
            setValues({}); setOriginal({}); onClassChange(e.target.value);
          }}><option value="">Select a class</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label></div>
      </section>
      {message && <div className="bs-notice" role="status">{message}</div>}
      {!online && <div className="bs-notice" role="status">You are offline. Saving is unavailable; keep this page open until your connection returns.</div>}
      {loading && classId && <p className="bs-empty">Loading students and scores…</p>}
      {!classId && <p className="bs-empty">Choose a class to begin.</p>}
      {data && !data.students.length && <p className="bs-empty">No active students in this class.</p>}
      {data && student && (
        <section className="bs-panel bs-student-panel">
          <div className="bs-student-toolbar">
            <div className="bs-student-identity">
              <div className="bs-student-avatar" aria-hidden="true">{student.name.trim().split(/\s+/).slice(0, 2).map(part => part.charAt(0)).join("").toUpperCase()}</div>
              <div className="bs-student-identity-copy">
                <span className="bs-student-count">STUDENT {index + 1} OF {data.students.length}</span>
                <h2>{student.name}</h2>
                <p>{student.login_id} · {data.term?.label ?? "No active term"}</p>
              </div>
            </div>
            <div className="bs-student-navigation">
              <label htmlFor="bs-student-picker">Select student
                <select id="bs-student-picker" value={index} disabled={saving} onChange={e => changeStudent(Number(e.target.value))}>
                  {data.students.map((s, i) => <option key={s.id} value={i}>{s.name}</option>)}
                </select>
              </label>
              <div className="bs-student-navigation-buttons">
                <button type="button" aria-label="Previous student" disabled={index === 0 || saving} onClick={() => changeStudent(index - 1)}>← <span>Previous</span></button>
                <button type="button" aria-label="Next student" disabled={index === data.students.length - 1 || saving} onClick={() => changeStudent(index + 1)}><span>Next</span> →</button>
              </div>
            </div>
          </div>
          <div className="bs-student-section-title"><div><h3>Subjects &amp; Scores</h3><p>CA /40 · Exam /60 · Total /100</p></div><span>{subjects.length} subjects</span></div>
          <div className="bs-student-score-list">
            <div className="bs-student-table-head" aria-hidden="true"><span>Subject</span><span>CA /40</span><span>Exam /60</span><span>Total /100</span></div>
            {subjects.map(subject => {
              const entry = values[key(student.id, subject.id)] ?? { ca: "", exam: "" };
              const valid = entry.ca !== "" && entry.exam !== "" && Number(entry.ca) <= 40 && Number(entry.exam) <= 60;
              const total = valid ? Number(entry.ca) + Number(entry.exam) : null;
              const status = !data.editableSubjectIds.includes(subject.id) ? "View only" : data.frozenSubjectIds.includes(subject.id) ? "Submitted / locked" : data.term?.locked ? "Term locked" : "Assigned";
              return (
                <article className="bs-student-score-row" key={subject.id}>
                  <div className="bs-student-subject-name"><h4>{subject.name}</h4><span>{status}</span></div>
                  {(["ca", "exam"] as const).map(kind => (
                    <label className="bs-student-score-field" key={kind}>
                      <span>{kind === "ca" ? "CA /40" : "Exam /60"}</span>
                      <input aria-label={`${subject.name} ${kind === "ca" ? "CA" : "Exam"}`} inputMode="numeric" type="text" placeholder="—" value={entry[kind]} disabled={!canEdit(subject.id)} onChange={e => update(subject.id, kind, e.target.value)} />
                    </label>
                  ))}
                  <div className="bs-student-score-total"><span>Total /100</span><strong>{total ?? "—"}</strong></div>
                </article>
              );
            })}
          </div>
          <div className="bs-student-save"><span aria-live="polite">{dirty ? "● Unsaved changes" : "All displayed changes saved"}</span><button className="bs-save" type="button" disabled={!dirty || saving || !online || conflict || !!data.term?.locked} onClick={() => void save()}>{saving ? "Saving…" : "Save student's scores"}</button></div>
        </section>
      )}
    </div>
  );
}
