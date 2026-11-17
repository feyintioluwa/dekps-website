"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import "../teacher.css";
import "../classes/teacher-arrangement.css";
import "./subject-arrangement.css";

type Opt = { id: string; name: string };
type Cls = { id: string; name: string; isClassTeacher: boolean };
type ResponseData = { subjects: Opt[]; canArrange: boolean; scope: "class" | "personal"; className: string };
export default function SubjectArrangementPage() {
  const [classes, setClasses] = useState<Cls[]>([]);
  const [classId, setClassId] = useState("");
  const [items, setItems] = useState<Opt[]>([]);
  const [original, setOriginal] = useState<Opt[]>([]);
  const [scope, setScope] = useState<"class" | "personal">("personal");
  const [canArrange, setCanArrange] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/teacher/me", { signal: c.signal, cache: "no-store" })
      .then(async r => { const d = await r.json(); if (!r.ok) throw Error(d.error ?? "Could not load classes."); return d; })
      .then(d => { if (!c.signal.aborted) { setClasses(d.classes ?? []); setClassId(d.classes?.[0]?.id ?? ""); if (!d.classes?.length) setLoading(false); } })
      .catch(e => { if (!c.signal.aborted) { setError(e.message); setLoading(false); } });
    return () => c.abort();
  }, []);
  useEffect(() => {
    if (!classId) return;
    const c = new AbortController();
    setLoading(true); setError(""); setNotice(""); setEditing(false);
    fetch(`/api/teacher/subject-arrangement?classId=${encodeURIComponent(classId)}`, { signal: c.signal, cache: "no-store" })
      .then(async r => { const d = await r.json(); if (!r.ok) throw Error(d.error ?? "Could not load subjects."); return d as ResponseData; })
      .then(d => { if (!c.signal.aborted) { setItems(d.subjects); setOriginal(d.subjects); setScope(d.scope); setCanArrange(d.canArrange); } })
      .catch(e => { if (!c.signal.aborted) setError(e.message); })
      .finally(() => { if (!c.signal.aborted) setLoading(false); });
    return () => c.abort();
  }, [classId]);
  const dirty = items.some((x, i) => x.id !== original[i]?.id);
  function move(index: number, dir: -1 | 1) {
    setItems(old => { const next = [...old], j = index + dir; if (j < 0 || j >= next.length) return old; [next[index], next[j]] = [next[j], next[index]]; return next; });
  }
  async function save() {
    if (!canArrange || !dirty || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const r = await fetch("/api/teacher/subject-arrangement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classId, order: items.map(x => x.id) }) });
      const d = await r.json(); if (!r.ok) throw Error(d.error ?? "Could not save order.");
      setOriginal([...items]); setEditing(false); setNotice(scope === "class" ? "Class subject order saved for everyone." : "Your personal subject order has been saved.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save order."); }
    finally { setSaving(false); }
  }
  const controls = (s: Opt, i: number) => <div className="tch-arrange-controls">
    <button className="tch-arrange-arrow" type="button" aria-label={`Move ${s.name} up`} disabled={saving || i === 0} onClick={() => move(i, -1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6" /></svg></button>
    <button className="tch-arrange-arrow" type="button" aria-label={`Move ${s.name} down`} disabled={saving || i === items.length - 1} onClick={() => move(i, 1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 10 6 6 6-6" /></svg></button>
  </div>;
  return <div className="tch">
    <header className="tch-header"><div className="tch-header-in"><div className="tch-brand"><img src="/assets/kps-logo.png" alt="School logo" /><div><strong>DE KINGS PERFECTION PRIVATE SCHOOL</strong><small>TEACHER PORTAL</small></div></div></div></header>
    <main className="tch-main tch-subject-page">
      <Link href="/teacher/classes" className="tch-link tch-back">← Back to my classes</Link>
      <div className="tch-subject-heading"><div><span className="tch-subject-eyebrow">TEACHER TOOLS</span><h1>Subject Arrangement</h1><p className="tch-muted">Set the order subjects appear in your online broadsheet.</p></div><span className="tch-subject-mark">↕</span></div>
      <section className="tch-card tch-subject-panel"><label className="tch-subject-label" htmlFor="subject-class">Choose class</label>
        <select id="subject-class" className="tch-subject-select" value={classId} disabled={saving || editing} onChange={e => setClassId(e.target.value)}>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        {!loading && classId && <p className="tch-subject-scope">{scope === "class" ? "Class-wide order · Crèche to Basic 6" : "Personal order · JSS 1 to SSS 3"}</p>}
        {scope === "class" && !canArrange && !loading && <p className="tch-arrange-hint">Only the assigned class teacher can change this class-wide arrangement.</p>}
        {error && <p className="tch-error" role="alert">{error}</p>}{notice && <p className="tch-subject-success" role="status">{notice}</p>}
        <div className="tch-subject-bar"><div><h2>Subject order</h2><p className="tch-muted">{items.length} subject{items.length === 1 ? "" : "s"}</p></div>
          {canArrange && !loading && (editing ? <div className="tch-arrange-toolbar"><button className="tch-btn" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save order"}</button><button className="tch-arrange-cancel" disabled={saving} onClick={() => { setItems([...original]); setEditing(false); }}>Cancel</button></div> : <button className="tch-btn" disabled={!items.length} onClick={() => { setEditing(true); setNotice(""); }}>Arrange subjects</button>)}
        </div>
        {editing && <p className="tch-arrange-hint">Use the arrows to change the order, then select Save order. This does not change subject names or scores.</p>}
        {loading ? <p className="tch-muted">Loading subjects…</p> : !items.length ? <p className="tch-muted">No subjects available for this class.</p> : editing ? <>
          <div className="tch-table-wrap"><table className="tch-arrange-table"><thead><tr><th>Position</th><th>Subject</th><th style={{ textAlign: "right" }}>Move</th></tr></thead><tbody>{items.map((s,i) => <tr key={s.id}><td><span className="tch-arrange-number">{i+1}</span></td><td className="tch-arrange-name">{s.name}</td><td>{controls(s,i)}</td></tr>)}</tbody></table></div>
          <div className="tch-arrange-mobile-list">{items.map((s,i) => <div className="tch-arrange-mobile-card" key={s.id}><span className="tch-arrange-number">{i+1}</span><div className="tch-arrange-mobile-info"><strong>{s.name}</strong></div>{controls(s,i)}</div>)}</div>
        </> : <div className="tch-subject-preview">{items.map((s,i) => <div key={s.id} className="tch-subject-row"><span className="tch-arrange-number">{i+1}</span><strong>{s.name}</strong></div>)}</div>}
      </section>
    </main>
  </div>;
}
