"use client";

import { useEffect, useState } from "react";
import "../students/admin.css";
import { useAdminKey } from "../AdminShell";

type Opt = { id: string; name: string };
type Stu = { id: string; login_id: string; name: string; stream: string | null };

export default function Electives() {
  const key = useAdminKey();
  const [classes, setClasses] = useState<Opt[]>([]);
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<Stu[]>([]);
  const [subjects, setSubjects] = useState<Opt[]>([]);
  const [links, setLinks] = useState<{ student_id: string; subject_id: string }[]>([]);
  const [pickS, setPickS] = useState<Set<string>>(new Set());
  const [pickSub, setPickSub] = useState<Set<string>>(new Set());
  const [stream, setStream] = useState("Science");
  const [msg, setMsg] = useState("");
  const h = { "Content-Type": "application/json", "x-admin-key": key };

  const toggle = (set: Set<string>, id: string, fn: (s: Set<string>) => void) => {
    const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); fn(n);
  };
  async function unlock() {
    const r = await fetch("/api/admin/electives", { headers: h }); const d = await r.json();
    if (!r.ok) return setMsg(d.error);
    const sss = (d.classes as Opt[]).filter((c) => c.name.toUpperCase().startsWith("SSS"));
    setClasses(sss); setClassId(sss[0]?.id ?? ""); setMsg("");
  }
  async function load() {
    const r = await fetch(`/api/admin/electives?classId=${classId}`, { headers: h }); const d = await r.json();
    if (!r.ok) return setMsg(d.error);
    setStudents(d.students); setSubjects(d.subjects); setLinks(d.studentSubjects); setPickS(new Set()); setPickSub(new Set());
  }
  async function apply(clear = false) {
    const r = await fetch("/api/admin/electives", { method: "POST", headers: h, body: JSON.stringify({ studentIds: [...pickS], subjectIds: [...pickSub], stream: clear ? null : stream, clear }) });
    const d = await r.json();
    setMsg(r.ok ? (clear ? "Reset to full class subject list." : "Saved.") : d.error);
    if (r.ok) load();
  }
  const count = (id: string) => links.filter((l) => l.student_id === id).length;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { unlock(); }, []);

  return (
    <div className="adm">
      <h1>SSS Subjects by Stream</h1>
      
      {msg && <p className="adm-msg">{msg}</p>}
      {classes.length > 0 && (
        <>
          <div className="adm-row" style={{ margin: "10px 0" }}>
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <button onClick={load}>Load</button>
          </div>
          {students.length > 0 && (
            <>
              <h2>1. Tick the subjects this group offers (core + electives)</h2>
              {subjects.map((s) => <label key={s.id} style={{ display: "block" }}><input type="checkbox" style={{ width: "auto", marginRight: 8 }} checked={pickSub.has(s.id)} onChange={() => toggle(pickSub, s.id, setPickSub)} />{s.name}</label>)}
              <h2>2. Tick the students</h2>
              <button onClick={() => setPickS(new Set(students.map((s) => s.id)))}>Select all</button>
              {students.map((s) => (
                <label key={s.id} style={{ display: "block", margin: "4px 0" }}>
                  <input type="checkbox" style={{ width: "auto", marginRight: 8 }} checked={pickS.has(s.id)} onChange={() => toggle(pickS, s.id, setPickS)} />
                  {s.name} <small>({s.login_id}) · {s.stream ?? "no stream"} · {count(s.id) ? `${count(s.id)} subjects` : "all class subjects"}</small>
                </label>
              ))}
              <h2>3. Stream &amp; apply</h2>
              <select value={stream} onChange={(e) => setStream(e.target.value)}><option>Science</option><option>Art</option><option>Commercial</option></select>
              <div className="adm-row">
                <button disabled={!pickS.size || !pickSub.size} onClick={() => apply(false)}>Apply to selected</button>
                <button disabled={!pickS.size} onClick={() => apply(true)}>Reset selected</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
