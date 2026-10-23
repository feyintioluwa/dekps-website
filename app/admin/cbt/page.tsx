"use client";

import { useEffect, useState } from "react";
import "../students/admin.css";
import { useAdminKey } from "../AdminShell";

type Opt = { id: string; name: string };
type Asm = { id: string; kind: string; class_id: string; subject_id: string; max_score: number; duration_minutes: number; start_at: string | null; end_at: string | null; is_published: boolean };
type Link = { class_id: string; subject_id: string };
type Q = { question: string; a: string; b: string; c: string; d: string; correct: string };
type Row = { id: string; name: string; loginId: string; submitted_at: string | null; score: number | null };

// Format: question line, A) B) C) D) lines, "Answer: B", blank line between questions
function parse(text: string): { qs: Q[]; errors: string[] } {
  const qs: Q[] = [], errors: string[] = [];
  text.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean).forEach((block, i) => {
    const q: Q = { question: "", a: "", b: "", c: "", d: "", correct: "" };
    const qLines: string[] = [];
    for (const line of block.split("\n").map((l) => l.trim())) {
      const o = line.match(/^([A-Da-d])[).:]\s*(.+)$/);
      const a = line.match(/^answer\s*[:=-]\s*([A-Da-d])/i);
      if (a) q.correct = a[1].toUpperCase();
      else if (o) (q as unknown as Record<string, string>)[o[1].toLowerCase()] = o[2];
      else qLines.push(line);
    }
    q.question = qLines.join("\n").replace(/^\d+[).]\s*/, "");
    if (!q.question || !q.a || !q.b || !q.correct) errors.push(`Question ${i + 1} is incomplete`);
    else qs.push(q);
  });
  return { qs, errors };
}

export default function AdminCbt() {
  const key = useAdminKey();
  const [classes, setClasses] = useState<Opt[]>([]);
  const [subjects, setSubjects] = useState<Opt[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [terms, setTerms] = useState<Record<string, unknown>[] | null>(null);
  const [asms, setAsms] = useState<Asm[]>([]);
  const [msg, setMsg] = useState("");
  const [f, setF] = useState({ termId: "", classId: "", subjectId: "", kind: "test1", maxScore: "40", duration: "30", startAt: "", endAt: "", instructions: "" });
  const [sel, setSel] = useState("");
  const [qtext, setQtext] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [qcount, setQcount] = useState(0);

  const h = { "Content-Type": "application/json", "x-admin-key": key };
  const post = async (body: object) => {
    const r = await fetch("/api/admin/cbt", { method: "POST", headers: h, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Failed");
    return d;
  };
  const name = (list: Opt[], id: string) => list.find((x) => x.id === id)?.name ?? "?";

  async function load() {
    const r = await fetch("/api/admin/cbt", { headers: h });
    const d = await r.json();
    if (!r.ok) return setMsg(d.error || "Failed");
    setClasses(d.classes); setSubjects(d.subjects); setLinks(d.classSubjects ?? []); setTerms(d.terms); setAsms(d.assessments);
  }

  async function create() {
    try {
      setMsg("Creating...");
      const d = await post({ action: "create", ...f });
      await load(); setSel(d.id);
      setMsg("Created. Now add questions below.");
    } catch (e) { setMsg("Could not create: " + (e as Error).message); }
  }
  async function addQuestions() {
    const { qs, errors } = parse(qtext);
    if (errors.length) return setMsg(errors.join("; "));
    try {
      const d = await post({ action: "questions", assessmentId: sel, questions: qs });
      setMsg(`${d.added} questions added.`); setQtext(""); loadResults();
    } catch (e) { setMsg((e as Error).message); }
  }
  async function publish(v: boolean) {
    try { await post({ action: "publish", assessmentId: sel, value: v }); setMsg(v ? "Published: students can see it." : "Unpublished."); load(); }
    catch (e) { setMsg((e as Error).message); }
  }
  async function loadResults() {
    try { const d = await post({ action: "results", assessmentId: sel }); setRows(d.rows); setQcount(d.questionCount); }
    catch (e) { setMsg((e as Error).message); }
  }
  async function finalize() {
    try { const d = await post({ action: "finalize", assessmentId: sel }); setMsg(`${d.finalized} overdue attempts finalized.`); loadResults(); }
    catch (e) { setMsg((e as Error).message); }
  }

  const [srcSel, setSrcSel] = useState<Set<string>>(new Set());
  const [pullN, setPullN] = useState("20");
  async function pull() {
    try { const d = await post({ action: "pull", assessmentId: sel, sourceIds: [...srcSel], count: Number(pullN) });
      setMsg(`${d.added} questions pulled into this exam (${d.available} were available).`); loadResults(); }
    catch (e) { setMsg((e as Error).message); }
  }
  const classSubjects = subjects.filter((s) => links.some((l) => l.class_id === f.classId && l.subject_id === s.id));
  const cur = asms.find((a) => a.id === sel);
  const termLabel = (t: Record<string, unknown>) =>
    t.term && t.session ? `${t.term} — ${t.session}` : String(t.name ?? t.term ?? t.label ?? t.id);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const labelStyle = { display: "block", fontSize: ".85rem", color: "#687385", marginBottom: 4 } as const;

  return (
    <div className="adm">
      <h1>Tests &amp; Exams (CBT) — Admin</h1>
      
      {msg && <p className="adm-msg">{msg}</p>}

      {classes.length > 0 && (
        <>
          <h2>1. New test / exam</h2>
          {terms ? (
            <select value={f.termId} onChange={(e) => setF({ ...f, termId: e.target.value })}>
              <option value="">Select term</option>
              {terms.map((t) => <option key={String(t.id)} value={String(t.id)}>{termLabel(t)}</option>)}
            </select>
          ) : (
            <input placeholder="Term ID (uuid from your terms table)" value={f.termId} onChange={(e) => setF({ ...f, termId: e.target.value })} />
          )}
          <select value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value, subjectId: "" })}>
            <option value="">Select class</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}>
            <option value="">{!f.classId ? "Select class first" : classSubjects.length ? "Select subject" : "No subjects set for this class"}</option>
            {classSubjects.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, maxScore: e.target.value === "exam" ? "60" : "40" })}><option value="test1">Test (40 marks)</option><option value="exam">Exam (60 marks)</option></select>
          <div className="adm-row">
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Maximum score (set by Test / Exam)</label>
              <input value={f.maxScore} readOnly />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Time allowed (minutes)</label>
              <input value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} />
            </div>
          </div>
          <textarea rows={2} placeholder="Instructions shown to students (optional)" value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} />
          <button disabled={!f.termId || !f.classId || !f.subjectId} onClick={create}>Create</button>
          {msg && <p className="adm-msg">{msg}</p>}

          <h2>2. Manage</h2>
          <select value={sel} onChange={(e) => { setSel(e.target.value); setRows([]); }}>
            <option value="">Select a test/exam</option>
            {asms.map((a) => <option key={a.id} value={a.id}>{a.kind === "exam" ? "Exam" : "Test"} · {name(classes, a.class_id)} · {name(subjects, a.subject_id)} {a.is_published ? "(published)" : "(draft)"}</option>)}
          </select>

          {sel && (
            <>
              <div className="adm-row" style={{ margin: "8px 0" }}>
                <button onClick={() => publish(!cur?.is_published)}>{cur?.is_published ? "Unpublish" : "Publish"}</button>
                <button onClick={loadResults}>View results</button>
                <button onClick={finalize}>Finalize overdue</button>
              </div>
              <h3>Add questions</h3>
              <p style={{ fontSize: ".85rem", color: "#687385" }}>One block per question, blank line between blocks:<br />What is 2+2?<br />A) 3<br />B) 4<br />C) 5<br />D) 6<br />Answer: B</p>
              <textarea rows={12} value={qtext} onChange={(e) => setQtext(e.target.value)} />
              <button disabled={!qtext.trim()} onClick={addQuestions}>Add questions</button>

              {cur?.kind === "exam" && (
                <>
                  <h3>Build exam from tests (question bank)</h3>
                  <p style={{ fontSize: ".85rem", color: "#687385" }}>Tick source tests, choose how many random questions to pull. Duplicates are skipped.</p>
                  {asms.filter((a) => a.kind === "test1" && a.subject_id === cur.subject_id).map((a) => (
                    <label key={a.id} style={{ display: "block" }}>
                      <input type="checkbox" style={{ width: "auto", marginRight: 8 }} checked={srcSel.has(a.id)}
                        onChange={() => { const n = new Set(srcSel); n.has(a.id) ? n.delete(a.id) : n.add(a.id); setSrcSel(n); }} />
                      {name(classes, a.class_id)} test
                    </label>
                  ))}
                  <div className="adm-row" style={{ marginTop: 8 }}>
                    <input value={pullN} onChange={(e) => setPullN(e.target.value)} placeholder="How many" />
                    <button disabled={!srcSel.size} onClick={pull}>Pull random questions</button>
                  </div>
                </>
              )}

              {rows.length > 0 || qcount > 0 ? (
                <>
                  <h3>Results ({qcount} questions)</h3>
                  <table>
                    <thead><tr><th>Name</th><th>Login ID</th><th>Status</th><th>Score</th></tr></thead>
                    <tbody>{rows.map((r) => <tr key={r.id}><td>{r.name}</td><td>{r.loginId}</td><td>{r.submitted_at ? "Submitted" : "In progress"}</td><td>{r.score ?? "-"}</td></tr>)}</tbody>
                  </table>
                </>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
