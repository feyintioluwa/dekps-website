"use client";

import { useEffect, useState } from "react";
import "../students/admin.css";
import { useAdminKey } from "../AdminShell";
import { useConfirm } from "../Dialog";

type Cls = { id: string; name: string; sort_order: number };
type Opt = { id: string; name: string };
type T = {
  id: string; name: string; email: string; is_active: boolean;
  classTeacher: string[];
  subjects: { class_id: string; subject_id: string }[];
};

const chk = { width: "auto", marginRight: 8 } as const;
const box = { border: "1px solid #dfe4ea", borderRadius: 10, padding: 12, margin: "10px 0" } as const;

export default function AdminTeachers() {
  const key = useAdminKey();
  const ask = useConfirm();
  const [classes, setClasses] = useState<Cls[]>([]);
  const [subjects, setSubjects] = useState<Opt[]>([]);
  const [links, setLinks] = useState<{ class_id: string; subject_id: string }[]>([]);
  const [maxOrder, setMaxOrder] = useState(85);
  const [teachers, setTeachers] = useState<T[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [nf, setNf] = useState({ name: "", email: "", password: "" });
  const [openId, setOpenId] = useState("");
  const [ctick, setCtick] = useState<Set<string>>(new Set());
  const [stick, setStick] = useState<Set<string>>(new Set());
  const [moveSel, setMoveSel] = useState<Set<string>>(new Set());
  const [moveTo, setMoveTo] = useState("");
  const [pw, setPw] = useState("");

  const h = { "Content-Type": "application/json", "x-admin-key": key };

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

  // Creche to Basic 6 have CLASS teachers. Subject teachers are for JSS and SSS only.
  const eligible = classes.filter((c) => c.sort_order <= maxOrder);
  const secIds = new Set(classes.filter((c) => c.sort_order > maxOrder).map((c) => c.id));
  const secLinks = links.filter((l) => secIds.has(l.class_id));
  const mySecRows = (t: T) => t.subjects.filter((r) => secIds.has(r.class_id));

  // Which teacher owns which subject (a subject belongs to one teacher, in every JSS/SSS class that takes it)
  const owner = new Map<string, string>();
  for (const t of teachers) for (const r of mySecRows(t)) owner.set(r.subject_id, t.id);
  const ownedIds = (t: T) => [...new Set(mySecRows(t).map((r) => r.subject_id))];
  const classCount = (sid: string) => secLinks.filter((l) => l.subject_id === sid).length;
  const heldCount = (t: T, sid: string) => mySecRows(t).filter((r) => r.subject_id === sid).length;
  const taught = subjects.filter((s) => secLinks.some((l) => l.subject_id === s.id));

  async function addTeacher() {
    const ok = await act({ action: "create", ...nf }, `Teacher added: ${nf.name}. Give them their email and password.`);
    if (ok) setNf({ name: "", email: "", password: "" });
  }

  function toggleOpen(t: T) {
    if (openId === t.id) { setOpenId(""); return; }
    setOpenId(t.id);
    setCtick(new Set(t.classTeacher));
    setStick(new Set(ownedIds(t)));
    setMoveSel(new Set()); setMoveTo(""); setPw("");
  }
  const flip = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };

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
  async function moveSubjects(t: T) {
    const to = teachers.find((x) => x.id === moveTo);
    if (!to || !moveSel.size) return;
    const names = [...moveSel].map(sname).join(", ");
    if (!(await ask({
      title: "Move subjects?",
      message: `Move ${names} from ${t.name} to ${to.name}? ${t.name} will lose them in every class, and ${to.name} will teach them in every class that takes them. Marks and past work are not changed.`,
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
        A <b>subject teacher</b> (JSS and SSS) teaches the subjects you give them in <b>every JSS and SSS class that takes them</b>, and a subject belongs to only one teacher.
      </p>
      {msg && <p className="adm-msg">{msg}</p>}

      <h2>1. Add a teacher</h2>
      <div className="adm-row">
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
        const mine = ownedIds(t);
        const summary = mine.map((sid) => {
          const hc = heldCount(t, sid), cc = classCount(sid);
          return hc < cc ? `${sname(sid)} (${hc} of ${cc} classes)` : sname(sid);
        });
        // Subjects this teacher can pick: their own, plus the ones nobody has
        const pickable = taught.filter((s) => !owner.has(s.id) || owner.get(s.id) === t.id);
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
              {summary.length > 0 && <div><b>Subject teacher (JSS/SSS):</b> {summary.join(", ")}</div>}
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
                  Only this teacher&apos;s subjects and subjects nobody has yet are shown. A subject another teacher has is hidden: use <b>Move subjects</b> below, on that teacher.
                </p>
                {pickable.length === 0 ? (
                  <p>Every subject already belongs to another teacher.</p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px" }}>
                    {pickable.map((s) => (
                      <label key={s.id} style={{ display: "flex", alignItems: "center" }}>
                        <input type="checkbox" style={chk} checked={stick.has(s.id)} onChange={() => setStick(flip(stick, s.id))} />
                        {s.name}
                      </label>
                    ))}
                  </div>
                )}
                <button disabled={busy} style={{ marginTop: 8 }} onClick={() => act({ action: "setTeacherSubjects", id: t.id, subjectIds: [...stick] }, `Subjects saved for ${t.name}.`)}>
                  Save subjects
                </button>
                <p style={{ fontSize: ".85rem", color: "#687385" }}>
                  Each ticked subject is given in every JSS and SSS class that takes it. Untick a subject and save to free it for another teacher.
                </p>

                <h3 style={{ margin: "16px 0 4px" }}>Move subjects to another teacher</h3>
                {mine.length === 0 ? (
                  <p>{t.name} has no subjects to move.</p>
                ) : (
                  <>
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
