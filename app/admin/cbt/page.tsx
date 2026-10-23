"use client";

import { useEffect, useState } from "react";
import "../students/admin.css";
import { useAdminKey } from "../AdminShell";

type Opt = { id: string; name: string };
type Asm = { id: string; kind: string; class_id: string; subject_id: string; term_id: string; max_score: number; duration_minutes: number; start_at: string | null; end_at: string | null; is_published: boolean };
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
  const [f, setF] = useState({ termId: "", classIds: [] as string[], subjectId: "", kind: "test1", maxScore: "40", duration: "30", startAt: "", endAt: "", instructions: "" });
  const [sel, setSel] = useState("");
  const [qtext, setQtext] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [qcount, setQcount] = useState(0);
  const [also, setAlso] = useState<Set<string>>(new Set());

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
      await load();
      const ids: string[] = d.ids ?? [];
      const skipped: string[] = d.skipped ?? [];
      const note = skipped.length ? ` Already existed, so not created again: ${skipped.join(", ")}. Find them in Manage.` : "";
      if (!ids.length) {
        if (d.existingId) setSel(d.existingId);
        setAlso(new Set());
        setMsg("Nothing new was created." + note);
        return;
      }
      setSel(ids[0]);
      setAlso(new Set(ids.slice(1)));
      setMsg((ids.length > 1
        ? `${ids.length} tests created (one per class). Now add questions below: they will be added to all of them.`
        : "Created. Now add questions below.") + note);
    } catch (e) { setMsg("Could not create: " + (e as Error).message); }
  }
  async function addQuestions() {
    const { qs, errors } = parse(qtext);
    if (errors.length) return setMsg(errors.join("; "));
    try {
      const d = await post({ action: "questions", assessmentIds: [sel, ...also], questions: qs });
      setMsg(`${d.added} questions added to ${d.tests} test${d.tests > 1 ? "s" : ""}.`); setQtext(""); loadResults();
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

  async function removeTest() {
    if (!cur) return;
    if (!confirm(`Delete this ${cur.kind === "exam" ? "exam" : "test"} for ${name(classes, cur.class_id)} (${name(subjects, cur.subject_id)}) and its questions? This cannot be undone.`)) return;
    try {
      await post({ action: "delete", assessmentId: sel });
      setSel(""); setRows([]); setAlso(new Set());
      await load();
      setMsg("Deleted.");
    } catch (e) { setMsg((e as Error).message); }
  }

  async function copyQuestions() {
    if (!confirm("Copy this test's questions into the same test of the other classes? Classes that already have questions are skipped.")) return;
    try {
      const d = await post({ action: "copy", assessmentId: sel, targetIds: siblings.map((a) => a.id) });
      setMsg(`${d.questions} questions copied into ${d.copied} class${d.copied === 1 ? "" : "es"}.${d.skipped ? ` ${d.skipped} skipped (already had questions or students had started).` : ""}`);
    } catch (e) { setMsg((e as Error).message); }
  }

  const [srcSel, setSrcSel] = useState<Set<string>>(new Set());
  const [pullN, setPullN] = useState("20");
  async function pull() {
    try { const d = await post({ action: "pull", assessmentId: sel, sourceIds: [...srcSel], count: Number(pullN) });
      setMsg(`${d.added} questions pulled into this exam (${d.available} were available).`); loadResults(); }
    catch (e) { setMsg((e as Error).message); }
  }

  // Subjects that EVERY ticked class has
  const classSubjects = f.classIds.length
    ? subjects.filter((s) => f.classIds.every((cid) => links.some((l) => l.class_id === cid && l.subject_id === s.id)))
    : [];
  const cur = asms.find((a) => a.id === sel);
  // Other tests of the same kind, subject and term (the other classes' copies)
  const siblings = cur
    ? asms.filter((a) => a.id !== cur.id && a.kind === cur.kind && a.subject_id === cur.subject_id && a.term_id === cur.term_id)
    : [];
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
          <label style={labelStyle}>Classes (tick one or more; a separate test is made for each)</label>
          <div style={{ marginBottom: 8 }}>
            {classes.map((c) => (
              <label key={c.id} style={{ display: "inline-block", marginRight: 14, marginBottom: 4 }}>
                <input type="checkbox" style={{ width: "auto", marginRight: 6 }} checked={f.classIds.includes(c.id)}
                  onChange={() => {
                    const next = f.classIds.includes(c.id) ? f.classIds.filter((x) => x !== c.id) : [...f.classIds, c.id];
                    setF({ ...f, classIds: next, subjectId: "" });
                  }} />
                {c.name}
              </label>
            ))}
          </div>
          <select value={f.subjectId} onChange={(e) => setF({ ...f, subjectId: e.target.value })}>
            <option value="">{!f.classIds.length ? "Select class first" : classSubjects.length ? "Select subject" : "No subject is common to all ticked classes"}</option>
            {classSubjects.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, maxScore: e.target.value === "exam" ? "60" : "40" })}><option value="test1">Test</option><option value="exam">Exam (60 marks)</option></select>
          <div className="adm-row">
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Maximum score (set by Test / Exam)</label>
              {f.kind === "exam" ? (
                <input value="60" readOnly />
              ) : (
                <select value={f.maxScore} onChange={(e) => setF({ ...f, maxScore: e.target.value })}>
                  <option value="40">40 marks</option>
                  <option value="20">20 marks (practical is the other 20)</option>
                </select>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Time allowed (minutes)</label>
              <input value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} />
            </div>
          </div>
          <textarea rows={2} placeholder="Instructions shown to students (optional)" value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} />
          <button disabled={!f.termId || !f.classIds.length || !f.subjectId} onClick={create}>
            {f.classIds.length > 1 ? `Create ${f.classIds.length} tests` : "Create"}
          </button>
          {msg && <p className="adm-msg">{msg}</p>}

          <h2>2. Manage</h2>
          <select value={sel} onChange={(e) => { setSel(e.target.value); setRows([]); setAlso(new Set()); }}>
            <option value="">Select a test/exam</option>
            {asms.map((a) => <option key={a.id} value={a.id}>{a.kind === "exam" ? "Exam" : "Test"} · {name(classes, a.class_id)} · {name(subjects, a.subject_id)} {a.is_published ? "(published)" : "(draft)"}</option>)}
          </select>

          {sel && (
            <>
              <div className="adm-row" style={{ margin: "8px 0" }}>
                <button onClick={() => publish(!cur?.is_published)}>{cur?.is_published ? "Unpublish" : "Publish"}</button>
                <button onClick={loadResults}>View results</button>
                <button onClick={finalize}>Finalize overdue</button>
                <button onClick={removeTest}>Delete this test</button>
              </div>
              {siblings.length > 0 && (
                <>
                  <h3>Same questions for other classes</h3>
                  <p style={{ fontSize: ".85rem", color: "#687385" }}>
                    This same {cur?.kind === "exam" ? "exam" : "test"} also exists for: {siblings.map((a) => name(classes, a.class_id)).join(", ")}.
                    Add the questions to ONE class first, then press the button to copy them to the others. Classes that already have questions are skipped.
                  </p>
                  <button onClick={copyQuestions}>Copy these questions to the other classes</button>
                </>
              )}
              <h3>Add questions</h3>
              <p style={{ fontSize: ".85rem", color: "#687385" }}>One block per question, blank line between blocks:<br />What is 2+2?<br />A) 3<br />B) 4<br />C) 5<br />D) 6<br />Answer: B</p>
              <textarea rows={12} value={qtext} onChange={(e) => setQtext(e.target.value)} />
              {siblings.length > 0 && (
                <>
                  <p style={{ fontSize: ".85rem", color: "#687385", marginTop: 8 }}>
                    Also add these questions to the same {cur?.kind === "exam" ? "exam" : "test"} in other classes. Only tick a class whose copy does not already have these questions, and not one that students have already started.
                  </p>
                  {siblings.map((a) => (
                    <label key={a.id} style={{ display: "block" }}>
                      <input type="checkbox" style={{ width: "auto", marginRight: 8 }} checked={also.has(a.id)}
                        onChange={() => { const n = new Set(also); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); setAlso(n); }} />
                      {name(classes, a.class_id)} {a.is_published ? "(published)" : "(draft)"}
                    </label>
                  ))}
                </>
              )}
              <button disabled={!qtext.trim()} onClick={addQuestions}>
                {also.size ? `Add questions to ${also.size + 1} tests` : "Add questions"}
              </button>

              {cur?.kind === "exam" && (
                <>
                  <h3>Build exam from tests (question bank)</h3>
                  <p style={{ fontSize: ".85rem", color: "#687385" }}>Tick source tests, choose how many random questions to pull. Duplicates are skipped.</p>
                  {asms.filter((a) => a.kind === "test1" && a.subject_id === cur.subject_id).map((a) => (
                    <label key={a.id} style={{ display: "block" }}>
                      <input type="checkbox" style={{ width: "auto", marginRight: 8 }} checked={srcSel.has(a.id)}
                        onChange={() => { const n = new Set(srcSel); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); setSrcSel(n); }} />
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
