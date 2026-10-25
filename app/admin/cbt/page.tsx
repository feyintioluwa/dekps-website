"use client";

import { useEffect, useState } from "react";
import "../students/admin.css";
import { useAdminKey } from "../AdminShell";
import { useConfirm } from "../Dialog";

type Opt = { id: string; name: string };
type Asm = { id: string; kind: string; class_id: string; subject_id: string; max_score: number; duration_minutes: number; start_at: string | null; end_at: string | null; is_published: boolean; instructions: string | null };
type Link = { class_id: string; subject_id: string };
type QRow = { id: string; position: number | null; question: string; option_a: string; option_b: string; option_c: string; option_d: string; correct: string; pulled: boolean };
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
  const ask = useConfirm();
  const [classes, setClasses] = useState<Opt[]>([]);
  const [subjects, setSubjects] = useState<Opt[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [terms, setTerms] = useState<Record<string, unknown>[] | null>(null);
  const [asms, setAsms] = useState<Asm[]>([]);
  const [msg, setMsg] = useState("");
  const [f, setF] = useState({ termId: "", subjectId: "", kind: "test1", maxScore: "40", duration: "30", startAt: "", endAt: "", instructions: "" });
  const [classIds, setClassIds] = useState<string[]>([]);
  const [alsoSel, setAlsoSel] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState("");
  const [qtext, setQtext] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [qcount, setQcount] = useState(0);
  const [qlist, setQlist] = useState<QRow[]>([]);
  const [editQ, setEditQ] = useState<string | null>(null);
  const [editQText, setEditQText] = useState("");
  const [editDur, setEditDur] = useState("");
  const [editInstr, setEditInstr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showQs, setShowQs] = useState(false); // question list is hidden until you open it

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

  function toggleClass(id: string) {
    setClassIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setF((p) => ({ ...p, subjectId: "" }));
  }

  async function create() {
    try {
      setMsg("Creating...");
      const d = await post({ action: "createMany", ...f, classIds });
      await load();
      selectAsm(d.ids[0], f.duration, f.instructions);
      setAlsoSel(new Set<string>(d.ids.slice(1)));
      setMsg(
        `Created for ${d.ids.length} class(es). Now add questions below.` +
        (d.skipped?.length ? ` Skipped (they do not take this subject): ${d.skipped.join(", ")}.` : "")
      );
    } catch (e) { setMsg("Could not create: " + (e as Error).message); }
  }
  async function addQuestions() {
    const { qs, errors } = parse(qtext);
    if (errors.length) return setMsg(errors.join("; "));
    if (busy) return;
    setBusy(true);
    try {
      const d = await post({ action: "questions", assessmentId: sel, alsoIds: [...alsoSel], questions: qs });
      setMsg(`${d.added} questions added to ${d.tests} test(s).` + (d.skipped ? ` ${d.skipped} skipped because students already started.` : ""));
      setQtext(""); loadResults(); loadQuestions();
    } catch (e) { setMsg((e as Error).message); }
    finally { setBusy(false); }
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

  async function loadQuestions(id: string = sel) {
    if (!id) return;
    try { const d = await post({ action: "listQuestions", assessmentId: id }); setQlist(d.questions); }
    catch (e) { setMsg((e as Error).message); }
  }
  function selectAsm(id: string, dur?: string, instr?: string) {
    const a = asms.find((x) => x.id === id);
    setSel(id); setRows([]); setQlist([]); setEditQ(null); setAlsoSel(new Set()); setShowQs(false);
    setEditDur(dur ?? String(a?.duration_minutes ?? ""));
    setEditInstr(instr ?? a?.instructions ?? "");
    if (id) loadQuestions(id);
  }
  async function guard(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  const saveDetails = () => guard(async () => {
    await post({ action: "updateAssessment", assessmentId: sel, duration: editDur, instructions: editInstr });
    await load(); setMsg("Details saved.");
  });
  const deleteTest = () => guard(async () => {
    if (!(await ask({ title: "Delete this test/exam?", message: "This deletes the test/exam and all its questions. This cannot be undone.", confirmText: "Delete", danger: true }))) return;
    await post({ action: "deleteAssessment", assessmentId: sel });
    setSel(""); setQlist([]); setRows([]); await load(); setMsg("Deleted.");
  });
  const deleteEverything = () => guard(async () => {
    if (!(await ask({
      title: "Delete permanently?",
      message: `This permanently deletes this ${cur?.kind === "exam" ? "exam" : "test"}, its questions, and ALL student attempts and answers. It cannot be undone.`,
      confirmText: "Delete permanently",
      danger: true,
      typeToConfirm: "DELETE",
    }))) return;
    await post({ action: "deleteAll", assessmentId: sel, confirm: "DELETE" });
    setSel(""); setQlist([]); setRows([]); setEditQ(null);
    await load();
    setMsg("Deleted, including the students' attempts and answers.");
  });
  const clearDrafts = () => guard(async () => {
    const n = asms.filter((a) => !a.is_published).length;
    if (!(await ask({ title: `Delete all ${n} draft tests/exams?`, message: "Drafts that students have started, or whose questions are used in an exam, are kept. This cannot be undone.", confirmText: "Delete drafts", danger: true }))) return;
    const d = await post({ action: "deleteDrafts" });
    setSel(""); setQlist([]); setRows([]); setEditQ(null);
    await load();
    setMsg(`${d.deleted} draft(s) deleted` + (d.skipped ? `, ${d.skipped} kept (started by students or used in an exam).` : "."));
  });
  const toText = (q: QRow) =>
    `${q.question}\nA) ${q.option_a}\nB) ${q.option_b}${q.option_c ? `\nC) ${q.option_c}` : ""}${q.option_d ? `\nD) ${q.option_d}` : ""}\nAnswer: ${q.correct}`;
  const saveQuestion = (id: string) => guard(async () => {
    const { qs, errors } = parse(editQText);
    if (errors.length || qs.length !== 1) { setMsg("Keep one question: the question, A) to D) lines, then Answer: B"); return; }
    await post({ action: "updateQuestion", question: { id, ...qs[0] } });
    setEditQ(null); await loadQuestions(); setMsg("Question saved.");
  });
  const deleteQuestion = (id: string) => guard(async () => {
    if (!(await ask({ title: "Delete this question?", message: "This cannot be undone.", confirmText: "Delete", danger: true }))) return;
    await post({ action: "deleteQuestion", questionId: id });
    await loadQuestions(); loadResults(); setMsg("Question deleted.");
  });
  const removePulled = (id: string) => guard(async () => {
    if (!(await ask({ title: "Remove from exam?", message: "The question stays in its original test.", confirmText: "Remove" }))) return;
    await post({ action: "removeFromExam", examId: sel, questionId: id });
    await loadQuestions(); loadResults(); setMsg("Removed from the exam.");
  });

  const [srcSel, setSrcSel] = useState<Set<string>>(new Set());
  const [pullN, setPullN] = useState("20");
  async function pull() {
    try { const d = await post({ action: "pull", assessmentId: sel, sourceIds: [...srcSel], count: Number(pullN) });
      setMsg(`${d.added} questions pulled into this exam (${d.available} were available).`); loadResults(); loadQuestions(); }
    catch (e) { setMsg((e as Error).message); }
  }

  // Subjects taken by at least one ticked class (the server skips classes that don't take it)
  const classSubjects = subjects.filter((s) => links.some((l) => classIds.includes(l.class_id) && l.subject_id === s.id));
  const cur = asms.find((a) => a.id === sel);
  // Other drafts of the same subject and kind: questions can be added to them in one go
  const siblings = cur ? asms.filter((a) => a.id !== sel && a.subject_id === cur.subject_id && a.kind === cur.kind && !a.is_published) : [];
  const termLabel = (t: Record<string, unknown>) =>
    t.term && t.session ? `${t.term} — ${t.session}` : String(t.name ?? t.term ?? t.label ?? t.id);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  const labelStyle = { display: "block", fontSize: ".85rem", color: "#687385", marginBottom: 4 } as const;
  const chk = { width: "auto", marginRight: 8 } as const;

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
            {classSubjects.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, maxScore: e.target.value === "exam" ? "60" : "40" })}><option value="test1">Test</option><option value="exam">Exam (60 marks)</option></select>
          <div className="adm-row">
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Maximum score (marks)</label>
              {f.kind === "exam" ? (
                <input value="60" readOnly />
              ) : (
                <select value={f.maxScore} onChange={(e) => setF({ ...f, maxScore: e.target.value })}>
                  <option value="20">20 marks</option>
                  <option value="40">40 marks</option>
                </select>
              )}
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Time allowed (minutes)</label>
              <input value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} />
            </div>
          </div>
          <textarea rows={2} placeholder="Instructions shown to students (optional)" value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} />
          <button disabled={!f.termId || !classIds.length || !f.subjectId} onClick={create}>
            {classIds.length > 1 ? `Create for ${classIds.length} classes` : "Create"}
          </button>

          <h2>2. Manage</h2>
          <select value={sel} onChange={(e) => selectAsm(e.target.value)}>
            <option value="">Select a test/exam</option>
            {asms.map((a) => <option key={a.id} value={a.id}>{a.kind === "exam" ? "Exam" : "Test"} · {name(classes, a.class_id)} · {name(subjects, a.subject_id)} {a.is_published ? "(published)" : "(draft)"}</option>)}
          </select>

          {asms.some((a) => !a.is_published) && (
            <button style={{ background: "#9e1824" }} disabled={busy} onClick={clearDrafts}>Clear all drafts</button>
          )}

          {sel && (
            <>
              <div className="adm-row" style={{ margin: "8px 0" }}>
                <button onClick={() => publish(!cur?.is_published)}>{cur?.is_published ? "Unpublish" : "Publish"}</button>
                <button onClick={loadResults}>View results</button>
                <button onClick={finalize}>Finalize overdue</button>
              </div>
              <h3>Test details</h3>
              <div className="adm-row">
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Time allowed (minutes)</label>
                  <input value={editDur} onChange={(e) => setEditDur(e.target.value)} />
                </div>
              </div>
              <textarea rows={2} placeholder="Instructions shown to students (optional)" value={editInstr} onChange={(e) => setEditInstr(e.target.value)} />
              <div className="adm-row">
                <button disabled={busy} onClick={saveDetails}>Save details</button>
                <button style={{ background: "#9e1824" }} disabled={busy} onClick={deleteTest}>Delete this {cur?.kind === "exam" ? "exam" : "test"}</button>
                <button
                  style={{ background: "#5c0f17" }}
                  disabled={busy || !!cur?.is_published}
                  title={cur?.is_published ? "Unpublish it first" : ""}
                  onClick={deleteEverything}
                >
                  Delete with student work
                </button>
              </div>
              {cur?.is_published && (
                <p style={{ fontSize: ".8rem", color: "#687385" }}>To delete with student work, unpublish it first.</p>
              )}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <h3>Questions ({qlist.length})</h3>
                <button type="button" onClick={() => setShowQs((v) => !v)}>
                  {showQs ? "Hide questions" : "Show questions"}
                </button>
              </div>
              {showQs && qlist.length === 0 && <p>No questions yet.</p>}
              {showQs && qlist.map((q, i) => (
                <div key={q.id} style={{ border: "1px solid #dfe4ea", borderRadius: 10, padding: 12, marginBottom: 10 }}>
                  {editQ === q.id ? (
                    <>
                      <textarea rows={7} value={editQText} onChange={(e) => setEditQText(e.target.value)} />
                      <div className="adm-row">
                        <button disabled={busy} onClick={() => saveQuestion(q.id)}>Save question</button>
                        <button disabled={busy} onClick={() => setEditQ(null)}>Cancel</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p style={{ color: "#18212f", fontWeight: 600, whiteSpace: "pre-wrap" }}>{i + 1}. {q.question}{q.pulled ? " (pulled from a test)" : ""}</p>
                      {(["A", "B", "C", "D"] as const).map((L) => {
                        const t = q[`option_${L.toLowerCase()}` as "option_a"];
                        return t ? <p key={L} style={{ fontWeight: q.correct === L ? 700 : 400, color: q.correct === L ? "#1b7a3a" : "#687385" }}>{L}) {t}{q.correct === L ? " ✓" : ""}</p> : null;
                      })}
                      <div className="adm-row" style={{ marginTop: 8 }}>
                        {!q.pulled && <button disabled={busy} onClick={() => { setEditQ(q.id); setEditQText(toText(q)); }}>Edit</button>}
                        {q.pulled
                          ? <button style={{ background: "#9e1824" }} disabled={busy} onClick={() => removePulled(q.id)}>Remove from exam</button>
                          : <button style={{ background: "#9e1824" }} disabled={busy} onClick={() => deleteQuestion(q.id)}>Delete</button>}
                      </div>
                    </>
                  )}
                </div>
              ))}

              <h3>Add questions</h3>
              <p style={{ fontSize: ".85rem", color: "#687385" }}>One block per question, blank line between blocks:<br />What is 2+2?<br />A) 3<br />B) 4<br />C) 5<br />D) 6<br />Answer: B</p>

              {siblings.length > 0 && (
                <div style={{ border: "1px solid #dfe4ea", borderRadius: 10, padding: 12, marginBottom: 10 }}>
                  <p style={{ fontSize: ".85rem", color: "#687385", marginBottom: 6 }}>
                    Also add these questions to the same {cur?.kind === "exam" ? "exam" : "test"} for:
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
                    {siblings.map((a) => (
                      <label key={a.id} style={{ display: "flex", alignItems: "center" }}>
                        <input type="checkbox" style={chk} checked={alsoSel.has(a.id)}
                          onChange={() => { const n = new Set(alsoSel); n.has(a.id) ? n.delete(a.id) : n.add(a.id); setAlsoSel(n); }} />
                        {name(classes, a.class_id)}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <textarea rows={12} value={qtext} onChange={(e) => setQtext(e.target.value)} />
              <button disabled={!qtext.trim() || busy} onClick={addQuestions}>{busy ? "Adding..." : "Add questions"}</button>

              {cur?.kind === "exam" && (
                <>
                  <h3>Build exam from tests (question bank)</h3>
                  <p style={{ fontSize: ".85rem", color: "#687385" }}>Tick source tests, choose how many random questions to pull. Duplicates are skipped.</p>
                  {asms.filter((a) => a.kind === "test1" && a.subject_id === cur.subject_id).map((a) => (
                    <label key={a.id} style={{ display: "block" }}>
                      <input type="checkbox" style={chk} checked={srcSel.has(a.id)}
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