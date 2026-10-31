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
  const [selClass, setSelClass] = useState("");
  const [stick, setStick] = useState<Set<string>>(new Set());
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

  async function addTeacher() {
    const ok = await act({ action: "create", ...nf }, `Teacher added: ${nf.name}. Give them their email and password.`);
    if (ok) setNf({ name: "", email: "", password: "" });
  }

  function toggleOpen(t: T) {
    if (openId === t.id) { setOpenId(""); return; }
    setOpenId(t.id);
    setCtick(new Set(t.classTeacher));
    setSelClass(""); setStick(new Set()); setPw("");
  }
  function pickClass(t: T, cid: string) {
    setSelClass(cid);
    setStick(new Set(t.subjects.filter((s) => s.class_id === cid).map((s) => s.subject_id)));
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

  const eligible = classes.filter((c) => c.sort_order <= maxOrder);
  const classSubs = (cid: string) => links.filter((l) => l.class_id === cid).map((l) => l.subject_id);

  return (
    <div className="adm">
      <h1>Teachers</h1>
      <p>
        A <b>subject teacher</b> works only with the subjects you assign to them, in the classes you choose. A <b>class teacher</b> (Creche to Basic 6 only)
        covers every subject of their class. One person can be both.
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
        const byClass = classes
          .map((c) => ({ c, subs: t.subjects.filter((s) => s.class_id === c.id).map((s) => sname(s.subject_id)) }))
          .filter((x) => x.subs.length);
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
              <div><b>Class teacher of:</b> {t.classTeacher.length ? t.classTeacher.map(cname).join(", ") : "none"}</div>
              <div>
                <b>Subject teacher:</b>{" "}
                {byClass.length ? byClass.map((x) => `${x.c.name}: ${x.subs.join(", ")}`).join(" · ") : "none"}
              </div>
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

                <h3 style={{ margin: "16px 0 4px" }}>Subject teacher</h3>
                <select value={selClass} onChange={(e) => pickClass(t, e.target.value)}>
                  <option value="">Choose a class</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {selClass && (
                  <>
                    {classSubs(selClass).length === 0 ? (
                      <p>No subjects are set for this class yet.</p>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", marginTop: 8 }}>
                        {classSubs(selClass).map((sid) => (
                          <label key={sid} style={{ display: "flex", alignItems: "center" }}>
                            <input type="checkbox" style={chk} checked={stick.has(sid)} onChange={() => setStick(flip(stick, sid))} />
                            {sname(sid)}
                          </label>
                        ))}
                      </div>
                    )}
                    <button disabled={busy} style={{ marginTop: 8 }} onClick={() => act({ action: "setSubjects", id: t.id, classId: selClass, subjectIds: [...stick] }, `Subjects saved for ${cname(selClass)}.`)}>
                      Save subjects for {cname(selClass)}
                    </button>
                    <p style={{ fontSize: ".85rem", color: "#687385" }}>
                      This replaces the subjects this teacher has in {cname(selClass)}. Untick a subject and save to take it away.
                    </p>
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
