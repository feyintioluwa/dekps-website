"use client";

import { useEffect, useState } from "react";
import "../students/admin.css";
import { useAdminKey } from "../AdminShell";
import { useConfirm } from "../Dialog";

type Cls = { id: string; name: string; sort_order: number };
type Opt = { id: string; name: string };
type Pair = { class_id: string; subject_id: string };
type T = {
  id: string; name: string; email: string; is_active: boolean;
  classTeacher: string[];
  subjects: Pair[];
};

const chk = { width: "auto", marginRight: 8 } as const;
const box = { border: "1px solid #dfe4ea", borderRadius: 10, padding: 12, margin: "10px 0" } as const;
const key = (c: string, s: string) => `${c}|${s}`;
// JSS classes start with J (JSS 1...). Every other class after Basic 6 is SSS.
const groupOf = (n: string): "JSS" | "SSS" => (/^\s*j/i.test(n) ? "JSS" : "SSS");
const TITLES = ["Mr", "Mrs", "Miss"];

export default function AdminTeachers() {
  const adminKey = useAdminKey();
  const ask = useConfirm();
  const [classes, setClasses] = useState<Cls[]>([]);
  const [subjects, setSubjects] = useState<Opt[]>([]);
  const [links, setLinks] = useState<Pair[]>([]);
  const [maxOrder, setMaxOrder] = useState(85);
  const [teachers, setTeachers] = useState<T[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [nf, setNf] = useState({ title: "", name: "", email: "", password: "" });
  const [openId, setOpenId] = useState("");
  const [ctick, setCtick] = useState<Set<string>>(new Set());
  const [psel, setPsel] = useState<Set<string>>(new Set()); // "classId|subjectId" ticks for the open teacher
  const [moveSel, setMoveSel] = useState<Set<string>>(new Set());
  const [moveTo, setMoveTo] = useState("");
  const [pw, setPw] = useState("");
  const [nm, setNm] = useState("");
  const [em, setEm] = useState("");

  const h = { "Content-Type": "application/json", "x-admin-key": adminKey };

  async function load() {
    const r = await fetch("/api/admin/teachers", { headers: h });
    const d = await r.json();
    if (!r.ok) return setMsg(d.error || "Could not load teachers");
    setClasses(d.classes); setSubjects(d.subjects); setLinks(d.classSubjects);
    setMaxOrder(d.classTeacherMaxOrder); setTeachers(d.teachers);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);

  async function act(payload: object, done: string) {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/admin/teachers", { method: "POST", headers: h, body: JSON.stringify(payload) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      await load();
      setMsg(done);
      return true;
    } catch (e) { setMsg((e as Error).message); return false; }
    finally { setBusy(false); }
  }

  const cname = (id: string) => classes.find((c) => c.id === id)?.name ?? "?";
  const sname = (id: string) => subjects.find((s) => s.id === id)?.name ?? "?";

  // Creche to Basic 6 have CLASS teachers. JSS and SSS have SUBJECT teachers, one per subject per class.
  const eligible = classes.filter((c) => c.sort_order <= maxOrder);
  const sec = classes.filter((c) => c.sort_order > maxOrder);
  const secIds = new Set(sec.map((c) => c.id));
  const takes = new Set(links.filter((l) => secIds.has(l.class_id)).map((l) => key(l.class_id, l.subject_id)));
  const taughtSubjects = subjects.filter((s) => sec.some((c) => takes.has(key(c.id, s.id))));

  // Who owns which (class, subject)
  const ownerOf = new Map<string, string>();
  for (const t of teachers) for (const r of t.subjects) if (secIds.has(r.class_id)) ownerOf.set(key(r.class_id, r.subject_id), t.id);
  const tname = (id: string) => teachers.find((x) => x.id === id)?.name ?? "another teacher";
  const mySec = (t: T) => t.subjects.filter((r) => secIds.has(r.class_id));
  const ownedSubjectIds = (t: T) => [...new Set(mySec(t).map((r) => r.subject_id))];

  // "Mathematics (All JSS)", "English (JSS 1, SS 2)"
  function summaryOf(t: T): string[] {
    return ownedSubjectIds(t).map((sid) => {
      const held = new Set(mySec(t).filter((r) => r.subject_id === sid).map((r) => r.class_id));
      const parts: string[] = [];
      for (const g of ["JSS", "SSS"] as const) {
        const avail = sec.filter((c) => groupOf(c.name) === g && takes.has(key(c.id, sid)));
        const mine = avail.filter((c) => held.has(c.id));
        if (!mine.length) continue;
        parts.push(mine.length === avail.length ? `All ${g}` : mine.map((c) => c.name).join(", "));
      }
      return `${sname(sid)} (${parts.join(" + ")})`;
    });
  }

  const flip = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };
  const freeFor = (t: T, c: string, s: string) => { const o = ownerOf.get(key(c, s)); return !o || o === t.id; };
  const groupAvail = (t: T, sid: string, g: "JSS" | "SSS") =>
    sec.filter((c) => groupOf(c.name) === g && takes.has(key(c.id, sid)) && freeFor(t, c.id, sid));
  const groupAllOn = (t: T, sid: string, g: "JSS" | "SSS") => {
    const a = groupAvail(t, sid, g);
    return a.length > 0 && a.every((c) => psel.has(key(c.id, sid)));
  };
  function toggleGroup(t: T, sid: string, g: "JSS" | "SSS") {
    const on = !groupAllOn(t, sid, g);
    const n = new Set(psel);
    for (const c of groupAvail(t, sid, g)) { if (on) n.add(key(c.id, sid)); else n.delete(key(c.id, sid)); }
    setPsel(n);
  }

  async function addTeacher() {
    const full = `${nf.title} ${nf.name}`.trim();
    const ok = await act({ action: "create", name: full, email: nf.email, password: nf.password }, `Teacher added: ${full}. Give them their email and password.`);
    if (ok) setNf({ title: "", name: "", email: "", password: "" });
  }

  function toggleOpen(t: T) {
    if (openId === t.id) { setOpenId(""); return; }
    setOpenId(t.id);
    setNm(t.name);
    setEm(t.email);
    setCtick(new Set(t.classTeacher));
    setPsel(new Set(mySec(t).map((r) => key(r.class_id, r.subject_id))));
    setMoveSel(new Set()); setMoveTo(""); setPw("");
  }

  const titleOf = (n: string) => TITLES.find((x) => n.toLowerCase().startsWith(x.toLowerCase() + " ")) ?? "";
  function setTitle(v: string) {
    const rest = nm.replace(/^(mr|mrs|miss|ms)\.?\s+/i, "");
    setNm(v ? `${v} ${rest}` : rest);
  }

  async function toggleActive(t: T) {
    if (t.is_active && !(await ask({
      title: "Deactivate this teacher?",
      message: `${t.name} will no longer be able to sign in. Nothing is deleted, and you can switch them back on.`,
      confirmText: "Deactivate", danger: true,
    }))) return;
    await act({ action: "setActive", id: t.id, value: !t.is_active }, t.is_active ? "Teacher deactivated." : "Teacher activated.");
  }
  async function resetPassword(t: T) {
    if (!(await ask({
      title: "Set a new password?",
      message: `The old password for ${t.name} will stop working. Give them the new one.`,
      confirmText: "Set password",
    }))) return;
    const ok = await act({ action: "resetPassword", id: t.id, password: pw }, "Password changed.");
    if (ok) setPw("");
  }
  async function changeEmail(t: T) {
    if (!(await ask({
      title: "Change email?",
      message: `${t.name} must use ${em.trim().toLowerCase()} to sign in from now on. Their password stays the same.`,
      confirmText: "Change email",
    }))) return;
    await act({ action: "setEmail", id: t.id, email: em }, "Email changed.");
  }
  async function renameTeacher(t: T) {
    await act({ action: "rename", id: t.id, name: nm }, `Name changed to ${nm.trim()}.`);
  }
  async function saveSubjects(t: T) {
    const pairs = [...psel].map((k) => { const [class_id, subject_id] = k.split("|"); return { class_id, subject_id }; });
    await act({ action: "setTeacherPairs", id: t.id, pairs }, `Subjects saved for ${t.name}.`);
  }
  async function moveSubjects(t: T) {
    const to = teachers.find((x) => x.id === moveTo);
    if (!to || !moveSel.size) return;
    const names = [...moveSel].map(sname).join(", ");
    if (!(await ask({
      title: "Move subjects?",
      message: `Move ${names} from ${t.name} to ${to.name}? ${t.name} will lose them in every class, and ${to.name} will teach them in those classes. Marks and past work are not changed.`,
      confirmText: "Move",
    }))) return;
    const ok = await act({ action: "moveSubjects", fromId: t.id, toId: to.id, subjectIds: [...moveSel] }, `Moved ${names} from ${t.name} to ${to.name}.`);
    if (ok) { setOpenId(""); setMoveSel(new Set()); setMoveTo(""); }
  }

  return (
    <div className="adm">
      <h1>Teachers</h1>
      <p>
        A <b>class teacher</b> (Creche to Basic 6) covers every subject of their class.
        A <b>subject teacher</b> (JSS and SSS) teaches the subjects you give them in the classes you choose. Each subject in each class has one teacher, so Mathematics in JSS can be one teacher and Mathematics in SSS another.
      </p>
      {msg && <p className="adm-msg">{msg}</p>}

      <h2>1. Add a teacher</h2>
      <div className="adm-row">
        <select value={nf.title} onChange={(e) => setNf({ ...nf, title: e.target.value })}>
          <option value="">Title</option>
          <option>Mr</option>
          <option>Mrs</option>
          <option>Miss</option>
        </select>
        <input placeholder="Full name" value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} />
        <input placeholder="Email address" type="email" value={nf.email} onChange={(e) => setNf({ ...nf, email: e.target.value })} />
        <input placeholder="Temporary password (8+ characters)" value={nf.password} onChange={(e) => setNf({ ...nf, password: e.target.value })} />
      </div>
      <button disabled={busy || !nf.name.trim() || !nf.email.trim() || nf.password.length < 8} onClick={addTeacher} style={{ marginTop: 8 }}>Add teacher</button>
      <p style={{ fontSize: ".85rem", color: "#687385" }}>
        The teacher signs in with this email and password. They will be able to change the password themselves later.
      </p>

      <h2>2. Teachers ({teachers.length})</h2>
      {teachers.length === 0 && <p>No teachers yet.</p>}
      {teachers.map((t) => {
        const open = openId === t.id;
        const summary = summaryOf(t);
        const mine = ownedSubjectIds(t);
        const others = teachers.filter((x) => x.id !== t.id && x.is_active);
        return (
          <div key={t.id} style={{ ...box, opacity: t.is_active ? 1 : 0.6 }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
              <div>
                <strong>{t.name}</strong>{!t.is_active && <span style={{ color: "#9e1824" }}> (deactivated)</span>}
                <div style={{ color: "#687385", fontSize: ".85rem" }}>{t.email}</div>
              </div>
              <div className="adm-row">
                <button onClick={() => toggleOpen(t)}>{open ? "Close" : "Classes & subjects"}</button>
                <button disabled={busy} onClick={() => toggleActive(t)}>{t.is_active ? "Deactivate" : "Activate"}</button>
              </div>
            </div>
            <div style={{ fontSize: ".9rem", marginTop: 6 }}>
              {t.classTeacher.length > 0 && <div><b>Class teacher of:</b> {t.classTeacher.map(cname).join(", ")}</div>}
              {summary.length > 0 && <div><b>Subject teacher:</b> {summary.join(", ")}</div>}
              {t.classTeacher.length === 0 && summary.length === 0 && <div>No class or subject yet</div>}
            </div>

            {open && (
              <div style={{ marginTop: 12 }}>
                <h3 style={{ margin: "8px 0 4px" }}>Class teacher (Creche to Basic 6)</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
                  {eligible.map((c) => (
                    <label key={c.id} style={{ display: "flex", alignItems: "center" }}>
                      <input type="checkbox" style={chk} checked={ctick.has(c.id)} onChange={() => setCtick(flip(ctick, c.id))} />
                      {c.name}
                    </label>
                  ))}
                </div>
                <button disabled={busy} style={{ marginTop: 8 }} onClick={() => act({ action: "setClassTeacher", id: t.id, classIds: [...ctick] }, "Class teacher saved.")}>
                  Save class teacher
                </button>

                <h3 style={{ margin: "16px 0 4px" }}>Subject teacher (JSS and SSS)</h3>
                <p style={{ fontSize: ".85rem", color: "#687385", margin: "0 0 6px" }}>
                  Tick the classes this teacher teaches each subject in, or use <b>All JSS</b> / <b>All SSS</b>. A class that is greyed out already has another teacher for that subject: use <b>Move subjects</b> on that teacher to change it.
                </p>
                {taughtSubjects.length === 0 && <p>No subjects are set for JSS or SSS classes yet.</p>}
                {taughtSubjects.map((s) => {
                  const rowClasses = sec.filter((c) => takes.has(key(c.id, s.id)));
                  const groups = (["JSS", "SSS"] as const).filter((g) => rowClasses.some((c) => groupOf(c.name) === g));
                  return (
                    <div key={s.id} style={{ borderTop: "1px solid #eef1f5", padding: "8px 0" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <strong>{s.name}</strong>
                        <div className="adm-row">
                          {groups.map((g) => {
                            const none = groupAvail(t, s.id, g).length === 0;
                            return (
                              <button key={g} type="button" disabled={none} onClick={() => toggleGroup(t, s.id, g)}>
                                {groupAllOn(t, s.id, g) ? `Clear ${g}` : `All ${g}`}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", marginTop: 6 }}>
                        {rowClasses.map((c) => {
                          const k = key(c.id, s.id);
                          const owner = ownerOf.get(k);
                          const taken = !!owner && owner !== t.id;
                          return (
                            <label key={c.id} style={{ display: "flex", alignItems: "center", opacity: taken ? 0.55 : 1 }}>
                              <input type="checkbox" style={chk} disabled={taken} checked={psel.has(k)} onChange={() => setPsel(flip(psel, k))} />
                              {c.name}
                              {taken && owner && <span style={{ color: "#9e1824", fontSize: ".78rem", marginLeft: 6 }}>({tname(owner)})</span>}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                <button disabled={busy} style={{ marginTop: 10 }} onClick={() => saveSubjects(t)}>
                  Save subjects
                </button>

                <h3 style={{ margin: "16px 0 4px" }}>Move subjects to another teacher</h3>
                {mine.length === 0 ? (
                  <p>{t.name} has no JSS or SSS subjects to move.</p>
                ) : (
                  <>
                    <p style={{ fontSize: ".85rem", color: "#687385", margin: "0 0 6px" }}>
                      A ticked subject moves in every class where {t.name} teaches it.
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
                      {mine.map((sid) => (
                        <label key={sid} style={{ display: "flex", alignItems: "center" }}>
                          <input type="checkbox" style={chk} checked={moveSel.has(sid)} onChange={() => setMoveSel(flip(moveSel, sid))} />
                          {sname(sid)}
                        </label>
                      ))}
                    </div>
                    <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} style={{ marginTop: 8 }}>
                      <option value="">Move to which teacher?</option>
                      {others.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                    <button disabled={busy || !moveSel.size || !moveTo} style={{ marginTop: 8 }} onClick={() => moveSubjects(t)}>
                      Move {moveSel.size ? `${moveSel.size} subject${moveSel.size === 1 ? "" : "s"}` : "subjects"}
                    </button>
                  </>
                )}

                <h3 style={{ margin: "16px 0 4px" }}>Name</h3>
                <div className="adm-row">
                  <select value={titleOf(nm)} onChange={(e) => setTitle(e.target.value)}>
                    <option value="">Title</option>
                    <option>Mr</option>
                    <option>Mrs</option>
                    <option>Miss</option>
                  </select>
                  <input placeholder="e.g. Mr Adewale John" value={nm} onChange={(e) => setNm(e.target.value)} />
                  <button disabled={busy || !nm.trim() || nm.trim() === t.name} onClick={() => renameTeacher(t)}>Save name</button>
                </div>

                <h3 style={{ margin: "16px 0 4px" }}>Email</h3>
                <div className="adm-row">
                  <input type="email" value={em} onChange={(e) => setEm(e.target.value)} />
                  <button disabled={busy || !em.trim() || em.trim().toLowerCase() === t.email} onClick={() => changeEmail(t)}>Save email</button>
                </div>

                <h3 style={{ margin: "16px 0 4px" }}>Password</h3>
                <div className="adm-row">
                  <input placeholder="New password (8+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} />
                  <button disabled={busy || pw.length < 8} onClick={() => resetPassword(t)}>Set new password</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
