"use client";

import { useEffect, useState } from "react";
import "../../admin/students/admin.css";
import "../teacher.css";
import { DialogProvider, useConfirm } from "@/lib/dialog";

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
type Filter = "submitted" | "tomark" | "unsub" | "all";
type Status = "draft" | "open" | "closed";

const API = "/api/teacher/assignments";
const nowMs = () => Date.now();
const QUICK = ["Excellent work", "Good work", "Well done", "Needs more detail", "Shallow points, you can do better", "See me"];

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) : "No deadline";
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function countdown(iso: string): string {
  const ms = new Date(iso).getTime() - nowMs();
  if (ms <= 0) return "now";
  const h = ms / 3600000;
  if (h < 1) return "in less than an hour";
  if (h < 24) { const n = Math.floor(h); return `in ${n} hour${n === 1 ? "" : "s"}`; }
  const d = Math.floor(h / 24);
  return `in ${d} day${d === 1 ? "" : "s"}`;
}
const statusOf = (a: Asg): Status =>
  !a.is_published ? "draft" : a.due_at && new Date(a.due_at).getTime() <= nowMs() ? "closed" : "open";
const pillStyle = (s: Status) =>
  s === "open" ? { background: "#e8f6ee", color: "#17621f", border: "1px solid #8fcf8f" }
  : s === "draft" ? { background: "#eef1f5", color: "#55627a", border: "1px solid #cfd6df" }
  : { background: "#fdeaea", color: "#9e1824", border: "1px solid #f2c7cb" };
const pillText = { draft: "Draft", open: "Open", closed: "Closed" } as const;

export default function TeacherAssignmentsPage() {
  // watchMessages: the message at the top of the page also pops up as a toast
  return (
    <DialogProvider watchMessages>
      <TeacherAssignments />
    </DialogProvider>
  );
}

function TeacherAssignments() {
  const ask = useConfirm();
  const [signedOut, setSignedOut] = useState(false);
  const [classes, setClasses] = useState<Opt[]>([]);
  const [subjects, setSubjects] = useState<Opt[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [terms, setTerms] = useState<Record<string, unknown>[] | null>(null);
  const [list, setList] = useState<Asg[]>([]);
  const [stats, setStats] = useState<Record<string, { submitted: number; marked: number }>>({});
  const [classSize, setClassSize] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState("");
  const [f, setF] = useState({ termId: "", subjectId: "", title: "", instructions: "", maxScore: "10", dueAt: "" });
  const [classIds, setClassIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [viewClass, setViewClass] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [search, setSearch] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [sel, setSel] = useState("");
  const [subs, setSubs] = useState<Sub[]>([]);
  const [filter, setFilter] = useState<Filter>("submitted");
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [edit, setEdit] = useState<Record<string, { score: string; comment: string }>>({});
  const [saved, setSaved] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [editing, setEditing] = useState(false);
  const [editF, setEditF] = useState({ title: "", instructions: "", maxScore: "", dueAt: "" });
  const [copying, setCopying] = useState(false);
  const [copyIds, setCopyIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  const post = async (body: object) => {
    const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { setSignedOut(true); throw new Error("Your session ended. Please sign in again."); }
    if (!r.ok) throw new Error(d.error || "Failed");
    return d;
  };
    const name = (l: Opt[], id: string) => l.find((x) => x.id === id)?.name ?? "?";
  async function signOut() {
    await fetch("/api/teacher/session", { method: "DELETE" }).catch(() => {});
    window.location.href = "/teacher";
  }

  async function load() {
    try {
      const r = await fetch(API);
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { setSignedOut(true); return; }
      if (!r.ok) return setMsg(d.error || "Failed");
      setClasses(d.classes); setSubjects(d.subjects); setLinks(d.classSubjects ?? []);
      setTerms(d.terms); setList(d.assignments);
      setStats(d.stats ?? {}); setClassSize(d.classSize ?? {});
    } catch {
      setMsg("Could not reach the server. Check your internet and try again.");
    } finally {
      setLoaded(true);
    }
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
      setF({ ...f, title: "", instructions: "", dueAt: "" });
      setCreating(false);
      setMsg(
        `Created for ${d.ids.length} class${d.ids.length === 1 ? "" : "es"} as drafts. Open each one and press Publish when students should see it.` +
        (d.skipped?.length ? ` Skipped (you do not teach this subject there): ${d.skipped.join(", ")}.` : "")
      );
    } catch (e) { setMsg("Could not create: " + (e as Error).message); }
  }

  // Opening an assignment shows its detail and loads who has submitted
  function openAsg(a: Asg) {
    setSel(a.id); setSubs([]); setFilter("submitted"); setMsg("");
    setEditing(false); setCopying(false); setCopyIds([]);
    setEditF({ title: a.title, instructions: a.instructions ?? "", maxScore: String(a.max_score), dueAt: toLocalInput(a.due_at) });
    loadSubs(a.id);
    window.scrollTo({ top: 0 });
  }
  function backToList() {
    setSel(""); setSubs([]); setEditing(false); setCopying(false);
    load();
  }

  async function publish(v: boolean) {
    try {
      await post({ action: "publish", assignmentId: sel, value: v });
      setMsg(v ? "Published: students can see it." : "Unpublished: hidden from students.");
      load();
    } catch (e) { setMsg((e as Error).message); }
  }
  async function closeNow() {
    if (!cur) return;
    if (!(await ask({ title: "Close this assignment now?", message: `Students will no longer be able to submit "${cur.title}". To open it again, set a new deadline with Edit.`, confirmText: "Close now", danger: true }))) return;
    try {
      await post({ action: "closeNow", assignmentId: sel });
      setMsg("Closed. Students can no longer submit.");
      load();
    } catch (e) { setMsg((e as Error).message); }
  }
  async function saveEdit() {
    try {
      await post({
        action: "update", assignmentId: sel, ...editF,
        dueAt: editF.dueAt ? new Date(editF.dueAt).toISOString() : null,
      });
      setEditing(false); setMsg("Changes saved.");
      load();
    } catch (e) { setMsg((e as Error).message); }
  }
  async function copyOut() {
    try {
      const d = await post({ action: "copy", assignmentId: sel, classIds: copyIds });
      setCopying(false); setCopyIds([]);
      setMsg(
        `Copied to ${d.created} class${d.created === 1 ? "" : "es"} as drafts.` +
        (d.already?.length ? ` Already there: ${d.already.join(", ")}.` : "") +
        (d.notTaking?.length ? ` Skipped (you do not teach this subject there): ${d.notTaking.join(", ")}.` : "")
      );
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

  // Loads the submissions of an assignment
  async function loadSubs(id: string = sel) {
    if (!id) return;
    setLoadingSubs(true);
    try {
      const d = await post({ action: "submissions", assignmentId: id });
      setSubs(d.rows);
      const m: Record<string, { score: string; comment: string }> = {};
      for (const r of d.rows as Sub[]) m[r.studentId] = { score: r.score === null ? "" : String(r.score), comment: r.comment ?? "" };
      setEdit(m);
      setSaved({});
    } catch (e) { setMsg((e as Error).message); }
    finally { setLoadingSubs(false); }
  }

  // Saves one student's mark; returns true if it worked
  async function saveOne(studentId: string): Promise<boolean> {
    const e = edit[studentId] ?? { score: "", comment: "" };
    setSaved((s) => ({ ...s, [studentId]: { ok: true, text: "Saving..." } }));
    try {
      await post({ action: "mark", assignmentId: sel, studentId, score: e.score, comment: e.comment });
      const max = cur?.max_score ?? "";
      setSaved((s) => ({ ...s, [studentId]: { ok: true, text: e.score.trim() === "" ? "Saved (no mark)" : `Saved: ${e.score}/${max}` } }));
      setSubs((p) => p.map((r) => (r.studentId === studentId
        ? { ...r, score: e.score.trim() === "" ? null : Number(e.score), comment: e.comment.trim() || null }
        : r)));
      return true;
    } catch (er) {
      setSaved((s) => ({ ...s, [studentId]: { ok: false, text: (er as Error).message } }));
      return false;
    }
  }

  // Saves every student whose mark or comment was changed
  async function saveAll() {
    setMsg(""); setSavingAll(true);
    let ok = 0, bad = 0;
    for (const r of changed) { if (await saveOne(r.studentId)) ok++; else bad++; }
    setSavingAll(false);
    setMsg(`${ok} saved.${bad ? ` ${bad} could not be saved: see the red messages.` : ""}`);
  }

  // Jump to the next student's mark box
  function focusNext(el: HTMLInputElement) {
    const all = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-mark]"));
    const i = all.indexOf(el);
    if (i >= 0 && all[i + 1]) all[i + 1].focus();
  }
  function addQuick(studentId: string, text: string) {
    setEdit((p) => {
      const cur0 = p[studentId] ?? { score: "", comment: "" };
      const comment = !cur0.comment ? text : cur0.comment.includes(text) ? cur0.comment : `${cur0.comment}. ${text}`;
      return { ...p, [studentId]: { ...cur0, comment } };
    });
  }

  // ---------- derived ----------
  const classSubjects = subjects.filter((s) => classIds.some((cid) => links.some((l) => l.class_id === cid && l.subject_id === s.id)));
  const cur = list.find((a) => a.id === sel);
  const submittedN = subs.filter((r) => r.submittedAt).length;
  const markedN = subs.filter((r) => r.submittedAt && r.score !== null).length;
  const toMarkN = submittedN - markedN;
  const notN = subs.length - submittedN;
  const shown = subs.filter((r) =>
    filter === "all" ? true
      : filter === "submitted" ? !!r.submittedAt
      : filter === "tomark" ? !!r.submittedAt && r.score === null
      : !r.submittedAt);
  const changed = subs.filter((r) => r.submittedAt && (
    (edit[r.studentId]?.score ?? "") !== (r.score === null ? "" : String(r.score)) ||
    (edit[r.studentId]?.comment ?? "") !== (r.comment ?? "")));
  const termLabel = (t: Record<string, unknown>) =>
    t.term && t.session ? `${t.term} — ${t.session}` : String(t.name ?? t.term ?? t.label ?? t.id);
  const labelStyle = { display: "block", fontSize: ".85rem", color: "#687385", marginBottom: 4 } as const;
  const chk = { width: "auto", marginRight: 8 } as const;
  const tab = (on: boolean) => (on ? { background: "#071f3d" } : { background: "#e3e8ef", color: "#071f3d" });
  const pill = (s: Status) => (
    <span style={{ ...pillStyle(s), padding: "2px 10px", borderRadius: 999, fontSize: ".78rem", fontWeight: 700 }}>{pillText[s]}</span>
  );

  // List view: filter, order by deadline (open first, then drafts, then closed)
  const rank = { open: 0, draft: 1, closed: 2 } as const;
  const dueMs = (a: Asg) => (a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER);
  const q = search.trim().toLowerCase();
  const filtered = list
    .filter((a) => !viewClass || a.class_id === viewClass)
    .filter((a) => statusFilter === "all" || statusOf(a) === statusFilter)
    .filter((a) => !q || a.title.toLowerCase().includes(q) || name(subjects, a.subject_id).toLowerCase().includes(q))
    .sort((x, y) => {
      const rx = rank[statusOf(x)], ry = rank[statusOf(y)];
      if (rx !== ry) return rx - ry;
      return rx === 2 ? dueMs(y) - dueMs(x) : dueMs(x) - dueMs(y);
    });
  const hideClosed = statusFilter === "all" && !showClosed;
  const closedHidden = hideClosed ? filtered.filter((a) => statusOf(a) === "closed").length : 0;
  const visible = hideClosed ? filtered.filter((a) => statusOf(a) !== "closed") : filtered;
  const groups = (viewClass ? classes.filter((c) => c.id === viewClass) : classes)
    .map((c) => ({ c, items: visible.filter((a) => a.class_id === c.id) }))
    .filter((g) => g.items.length);

  // Classes this assignment can be copied to (same subject, and the teacher teaches it there)
  const copyTargets = cur
    ? classes.filter((c) => c.id !== cur.class_id && links.some((l) => l.class_id === c.id && l.subject_id === cur.subject_id))
    : [];

  function card(a: Asg) {
    const st = stats[a.id] ?? { submitted: 0, marked: 0 };
    const size = classSize[a.class_id] ?? 0;
    const s = statusOf(a);
    return (
      <div key={a.id} style={{ border: "1px solid #e3e8ef", borderRadius: 12, padding: 14, marginBottom: 10, background: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "#687385", fontSize: ".82rem" }}>{name(subjects, a.subject_id)}</div>
            <div style={{ fontWeight: 700, color: "#071f3d", wordBreak: "break-word" }}>{a.title}</div>
          </div>
          {pill(s)}
        </div>
        <div style={{ fontSize: ".85rem", color: "#687385", margin: "6px 0" }}>
          {a.due_at ? `Due ${fmtDate(a.due_at)}` : "No deadline"}
          {s === "open" && a.due_at && <b style={{ color: "#071f3d" }}> · {countdown(a.due_at)}</b>}
          {` · out of ${a.max_score}`}
        </div>
        {s !== "draft" && (
          <>
            <div style={{ fontSize: ".85rem", color: "#18212f" }}>
              {st.submitted} of {size} submitted · {st.marked} marked{st.submitted - st.marked > 0 ? ` · ${st.submitted - st.marked} to mark` : ""}
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "#e8edf4", overflow: "hidden", margin: "6px 0 2px" }}>
              <div style={{ height: "100%", width: `${size ? Math.min(100, (st.submitted / size) * 100) : 0}%`, background: "#1e5c98" }} />
            </div>
          </>
        )}
        <button style={{ marginTop: 8 }} onClick={() => openAsg(a)}>{s === "draft" ? "Open" : "Open and mark"}</button>
      </div>
    );
  }

  return (
    <>
      <div className="tch" style={{ minHeight: 0, background: "transparent" }}>
        <header className="tch-header">
          <div className="tch-header-in">
            <div className="tch-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/kps-logo.png" alt="School logo" />
              <div>
                <strong>DE KINGS PERFECTION PRIVATE SCHOOL</strong>
                <small>TEACHER PORTAL</small>
              </div>
            </div>
              <div className="tch-me">
              <a className="tch-btn tch-light tch-back-link" href="/teacher" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
                ← My classes
              </a>
              <button className="tch-btn tch-light" onClick={signOut}>Log out</button>
            </div>
          </div>
        </header>
      </div>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px 60px" }}>
        <div className="adm">
          <h1>Assignments</h1>
          {msg && <p className="adm-msg">{msg}</p>}

          {signedOut && (
            <p>
              Your session ended. <a href="/teacher">Sign in again</a>.
            </p>
          )}
          {!signedOut && !loaded && <p>Loading...</p>}
          {!signedOut && loaded && classes.length === 0 && (
            <p>You have no classes or subjects yet. Please see the school admin.</p>
          )}

          {classes.length > 0 && !cur && (
            <>
              {/* ---------------- New assignment (collapsed by default) ---------------- */}
              <div className="adm-row" style={{ margin: "10px 0" }}>
                <button onClick={() => setCreating((v) => !v)}>{creating ? "Close the form" : "+ New assignment"}</button>
              </div>
              {creating && (
                <>
                  <h2>New assignment</h2>
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
                    <option value="">{!classIds.length ? "Tick a class first" : classSubjects.length ? "Select subject" : "No subjects of yours in these classes"}</option>
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
                </>
              )}

              {/* ---------------- Manage: list ---------------- */}
              <h2>Your assignments</h2>
              <div className="adm-row">
                <select value={viewClass} onChange={(e) => setViewClass(e.target.value)}>
                  <option value="">All classes</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | Status)}>
                  <option value="all">All statuses</option>
                  <option value="open">Open</option>
                  <option value="draft">Draft</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <input placeholder="Search by title or subject" value={search} onChange={(e) => setSearch(e.target.value)} />
              <p style={{ fontSize: ".85rem" }}>Nearest deadline first. Open assignments, then drafts, then closed ones.</p>

              {groups.length === 0 && (
                <p>{list.length === 0 ? "No assignments yet. Press + New assignment to make the first one." : "No assignments match these filters."}</p>
              )}
              {groups.map((g) => (
                <div key={g.c.id}>
                  <h3>{g.c.name} <span style={{ color: "#687385", fontWeight: 400, fontSize: ".85rem" }}>({g.items.length})</span></h3>
                  {g.items.map(card)}
                </div>
              ))}
              {closedHidden > 0 && (
                <button style={{ background: "#e3e8ef", color: "#071f3d" }} onClick={() => setShowClosed(true)}>Show {closedHidden} closed assignment{closedHidden === 1 ? "" : "s"}</button>
              )}
              {showClosed && statusFilter === "all" && (
                <button style={{ background: "#e3e8ef", color: "#071f3d" }} onClick={() => setShowClosed(false)}>Hide closed assignments</button>
              )}
            </>
          )}

          {/* ---------------- Detail view ---------------- */}
          {classes.length > 0 && cur && (
            <>
              <button style={{ background: "#e3e8ef", color: "#071f3d" }} onClick={backToList}>← Back to all assignments</button>
              <h2 style={{ marginTop: 14 }}>{cur.title}</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 6 }}>
                {pill(statusOf(cur))}
                <span style={{ fontSize: ".9rem", color: "#687385" }}>
                  {name(classes, cur.class_id)} · {name(subjects, cur.subject_id)} · out of {cur.max_score}
                </span>
              </div>
              <p style={{ fontSize: ".9rem" }}>
                {cur.due_at ? `Deadline: ${fmtDate(cur.due_at)}` : "No deadline."}
                {statusOf(cur) === "open" && cur.due_at ? ` (${countdown(cur.due_at)})` : ""}
              </p>
              {cur.instructions && <p style={{ whiteSpace: "pre-wrap" }}>{cur.instructions}</p>}

              <div className="adm-row" style={{ margin: "8px 0" }}>
                <button onClick={() => publish(!cur.is_published)}>{cur.is_published ? "Unpublish" : "Publish"}</button>
                {statusOf(cur) === "open" && <button onClick={closeNow}>Close now</button>}
                <button onClick={() => { setEditing((v) => !v); setCopying(false); }}>{editing ? "Cancel edit" : statusOf(cur) === "closed" ? "Edit / reopen" : "Edit"}</button>
                <button onClick={() => { setCopying((v) => !v); setEditing(false); }}>{copying ? "Cancel copy" : "Copy to other classes"}</button>
                <button onClick={() => loadSubs()}>Refresh</button>
              </div>

              {editing && (
                <div style={{ border: "1px solid #dfe4ea", borderRadius: 10, padding: 12, marginBottom: 12 }}>
                  <label style={labelStyle}>Title</label>
                  <input value={editF.title} onChange={(e) => setEditF({ ...editF, title: e.target.value })} />
                  <label style={labelStyle}>Instructions</label>
                  <textarea rows={4} value={editF.instructions} onChange={(e) => setEditF({ ...editF, instructions: e.target.value })} />
                  <div className="adm-row">
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Marks it is out of{submittedN > 0 ? " (locked: students have submitted)" : ""}</label>
                      <input value={editF.maxScore} disabled={submittedN > 0} onChange={(e) => setEditF({ ...editF, maxScore: e.target.value })} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Deadline{statusOf(cur) === "closed" ? " (set a new date to reopen)" : ""}</label>
                      <input type="datetime-local" value={editF.dueAt} onChange={(e) => setEditF({ ...editF, dueAt: e.target.value })} />
                    </div>
                  </div>
                  <button disabled={!editF.title.trim()} onClick={saveEdit}>Save changes</button>
                </div>
              )}

              {copying && (
                <div style={{ border: "1px solid #dfe4ea", borderRadius: 10, padding: 12, marginBottom: 12 }}>
                  <p style={{ margin: "0 0 8px" }}>Copies the title, instructions, marks and deadline as <b>drafts</b>. Student answers are never copied. Only classes where you teach {name(subjects, cur.subject_id)} are listed.</p>
                  {copyTargets.length === 0 && <p>You teach this subject in no other class.</p>}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
                    {copyTargets.map((c) => (
                      <label key={c.id} style={{ display: "flex", alignItems: "center" }}>
                        <input type="checkbox" style={chk} checked={copyIds.includes(c.id)}
                          onChange={() => setCopyIds((p) => (p.includes(c.id) ? p.filter((x) => x !== c.id) : [...p, c.id]))} />
                        {c.name}
                      </label>
                    ))}
                  </div>
                  <button style={{ marginTop: 10 }} disabled={!copyIds.length} onClick={copyOut}>
                    {copyIds.length > 1 ? `Copy to ${copyIds.length} classes` : "Copy"}
                  </button>
                </div>
              )}

              {loadingSubs && <p>Loading submissions…</p>}

              {!loadingSubs && subs.length > 0 && (
                <>
                  <p style={{ fontWeight: 600, margin: "8px 0" }}>
                    {submittedN} of {subs.length} submitted · {markedN} marked · {toMarkN} still to mark
                  </p>
                  <div className="adm-row" style={{ margin: "6px 0" }}>
                    <button style={tab(filter === "submitted")} onClick={() => setFilter("submitted")}>Submitted ({submittedN})</button>
                    <button style={tab(filter === "tomark")} onClick={() => setFilter("tomark")}>To mark ({toMarkN})</button>
                    <button style={tab(filter === "unsub")} onClick={() => setFilter("unsub")}>Missing ({notN})</button>
                    <button style={tab(filter === "all")} onClick={() => setFilter("all")}>All ({subs.length})</button>
                  </div>
                  {changed.length > 0 && (
                    <button disabled={savingAll} onClick={saveAll}>
                      {savingAll ? "Saving..." : `Save all changes (${changed.length})`}
                    </button>
                  )}
                  {shown.length === 0 && <p>No students in this view.</p>}
                </>
              )}

              {!loadingSubs && shown.map((r) => (
                <div key={r.studentId} data-card="1" style={{ border: "1px solid #e3e8ef", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                  <strong>{r.name}</strong> <span style={{ color: "#687385", fontSize: ".85rem" }}>{r.loginId}</span>
                  <div style={{ fontSize: ".85rem", color: r.submittedAt ? "#1a7f4b" : "#a33" }}>
                    {r.submittedAt ? `Submitted ${fmtDate(r.submittedAt)}` : "Missing: not submitted"}
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
                        <input data-mark="1" placeholder={`Mark /${cur.max_score}`} style={{ maxWidth: 110 }}
                          value={edit[r.studentId]?.score ?? ""}
                          onChange={(e) => setEdit({ ...edit, [r.studentId]: { score: e.target.value, comment: edit[r.studentId]?.comment ?? "" } })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); const el = e.currentTarget; void saveOne(r.studentId); focusNext(el); }
                          }} />
                        <input placeholder="Comment (optional)"
                          value={edit[r.studentId]?.comment ?? ""}
                          onChange={(e) => setEdit({ ...edit, [r.studentId]: { score: edit[r.studentId]?.score ?? "", comment: e.target.value } })}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void saveOne(r.studentId); } }} />
                        <button onClick={async (ev) => {
                          const el = ev.currentTarget.closest("[data-card]")?.querySelector<HTMLInputElement>("input[data-mark]");
                          const ok = await saveOne(r.studentId);
                          if (ok && el) focusNext(el);
                        }}>Save and next</button>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "2px 0 4px" }}>
                        {QUICK.map((t) => (
                          <button key={t} type="button" onClick={() => addQuick(r.studentId, t)}
                            style={{ background: "#eef3fa", color: "#071f3d", padding: "5px 10px", fontSize: ".78rem", fontWeight: 500, marginBottom: 0 }}>{t}</button>
                        ))}
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

              {!loadingSubs && changed.length > 0 && shown.length > 4 && (
                <button disabled={savingAll} onClick={saveAll}>
                  {savingAll ? "Saving..." : `Save all changes (${changed.length})`}
                </button>
              )}

              <h3>Delete</h3>
              <div className="adm-row">
                <button disabled={cur.is_published} onClick={remove}>Delete</button>
              </div>
              <p style={{ fontSize: ".85rem" }}>
                {cur.is_published
                  ? "To delete, press Unpublish first."
                  : "You can only delete an assignment that no student has submitted."}
              </p>
            </>
          )}
        </div>
      </main>
    </>
  );
}
