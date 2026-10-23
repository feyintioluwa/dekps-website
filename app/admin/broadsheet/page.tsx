"use client";

import { ChangeEvent, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import "../students/admin.css";
import { useAdminKey } from "../AdminShell";

type Opt = { id: string; name: string };
type Stu = { id: string; login_id: string; name: string };
type Data = {
  students: Stu[]; subjects: Opt[];
  studentSubjects: { student_id: string; subject_id: string }[];
  scores: { student_id: string; subject_id: string; kind: string; score: number }[];
};
type Row = { loginId: string; scores: { subjectId: string; kind: string; score: number }[] };
type Group = { classId: string; className: string; rows: Row[] };

export default function Broadsheet() {
  const key = useAdminKey();
  const [classes, setClasses] = useState<Opt[]>([]);
  const [terms, setTerms] = useState<Record<string, unknown>[] | null>(null);
  const [classId, setClassId] = useState("all");
  const [termId, setTermId] = useState("");
  const [termLabel, setTermLabel] = useState("First Term");
  const [session, setSession] = useState("2026/2027");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Group[]>([]);
  const h = { "Content-Type": "application/json", "x-admin-key": key };

  async function unlock() {
    const r = await fetch("/api/admin/broadsheet", { headers: h });
    const d = await r.json();
    if (!r.ok) return setMsg(d.error);
    setClasses(d.classes); setTerms(d.terms); setMsg("");
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { unlock(); }, []);

  const targets = () => (classId === "all" ? classes : classes.filter((c) => c.id === classId));

  async function fetchClass(cid: string): Promise<Data | null> {
    const r = await fetch(`/api/admin/broadsheet?classId=${cid}&termId=${termId}`, { headers: h });
    const d = await r.json();
    if (!r.ok) { setMsg(d.error); return null; }
    return d;
  }
  const allowed = (d: Data, st: Stu, subId: string) => {
    const mine = d.studentSubjects.filter((x) => x.student_id === st.id);
    return mine.length === 0 || mine.some((x) => x.subject_id === subId);
  };

  async function template() {
    if (!termId) return setMsg("Choose the term first.");
    setBusy(true); setMsg("Preparing template…");
    const wb = XLSX.utils.book_new();
    let sheets = 0;
    for (const c of targets()) {
      const d = await fetchClass(c.id);
      if (!d) { setBusy(false); return; }
      if (!d.students.length) continue;
      const header = ["Login ID", "Name", ...d.subjects.flatMap((s) => [`${s.name} CA`, `${s.name} Exam`])];
      const rows = d.students.map((st) => [
        st.login_id, st.name,
        ...d.subjects.flatMap((s) => {
          if (!allowed(d, st, s.id)) return ["", ""];
          const g = (k: string) => d.scores.find((x) => x.student_id === st.id && x.subject_id === s.id && x.kind === k)?.score ?? "";
          return [g("ca"), g("exam")];
        }),
      ]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), c.name.slice(0, 31));
      sheets++;
    }
    setBusy(false);
    if (!sheets) return setMsg("No students found to put in the template.");
    const label = classId === "all" ? "All-Classes" : targets()[0]?.name ?? "Class";
    XLSX.writeFile(wb, `${label}-scores.xlsx`);
    setMsg(`Template downloaded (${sheets} sheet${sheets > 1 ? "s" : ""}). Fill CA and Exam (blank = no score). Do not edit Login ID, headers or tab names.`);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!termId) return setMsg("Choose the term first.");
    setBusy(true); setMsg("Reading file…");
    const wb = XLSX.read(await file.arrayBuffer());
    const groups: Group[] = [];
    const errors: string[] = [];
    const skipped: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const cls = classId === "all"
        ? classes.find((c) => c.name.trim().toLowerCase() === sheetName.trim().toLowerCase())
        : classes.find((c) => c.id === classId);
      if (!cls || (classId !== "all" && sheetName !== wb.SheetNames[0])) { skipped.push(sheetName); continue; }
      const d = await fetchClass(cls.id);
      if (!d) { setBusy(false); return; }
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: "" });
      const rows: Row[] = json.map((row) => {
        const loginId = String(row["Login ID"] ?? "").trim();
        const scores: Row["scores"] = [];
        for (const s of d.subjects) {
          for (const [col, kind] of [[`${s.name} CA`, "ca"], [`${s.name} Exam`, "exam"]] as const) {
            const raw = row[col];
            if (raw === "" || raw === undefined) continue;
            const n = Number(raw);
            if (!Number.isInteger(n) || n < 0 || n > 100) errors.push(`${cls.name} ${loginId}: ${col} = "${raw}"`);
            else scores.push({ subjectId: s.id, kind, score: n });
          }
        }
        return { loginId, scores };
      }).filter((r) => r.loginId);
      groups.push({ classId: cls.id, className: cls.name, rows });
    }
    setBusy(false);
    if (errors.length) {
      setPending([]);
      return setMsg(`Fix these and re-upload: ${errors.slice(0, 8).join("; ")}${errors.length > 8 ? "…" : ""}`);
    }
    setPending(groups);
    const n = groups.reduce((a, g) => a + g.rows.length, 0);
    setMsg(`${n} students read from ${groups.length} class${groups.length === 1 ? "" : "es"}.${skipped.length ? ` Skipped tabs (no matching class): ${skipped.join(", ")}.` : ""} Press Save scores.`);
  }

  async function post(cid: string, body: object) {
    const r = await fetch("/api/admin/broadsheet", { method: "POST", headers: h, body: JSON.stringify({ termId, classId: cid, ...body }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    return d;
  }
  async function save() {
    setBusy(true);
    try {
      let saved = 0; const unknown: string[] = [];
      for (const g of pending) {
        const d = await post(g.classId, { action: "save", rows: g.rows });
        saved += d.saved; unknown.push(...d.unknown);
      }
      setMsg(`${saved} scores saved.${unknown.length ? " Not in their class: " + unknown.join(", ") : ""}`);
      setPending([]);
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }
  async function publish() {
    if (!termId) return setMsg("Choose the term first.");
    if (!confirm(classId === "all" ? "Publish results for ALL classes?" : "Publish results for this class?")) return;
    setBusy(true);
    try {
      const lines: string[] = [];
      for (const c of targets()) {
        const d = await post(c.id, { action: "publish", termLabel, session });
        lines.push(`${c.name}: ${d.published}`);
      }
      setMsg(`Published — ${lines.join(", ")}`);
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }
  const label = (t: Record<string, unknown>) =>
    t.term && t.session ? `${t.term} — ${t.session}` : String(t.name ?? t.term ?? t.label ?? t.id);

  return (
    <div className="adm">
      <h1>Broadsheet — upload scores &amp; publish</h1>
      {msg && <p className="adm-msg">{msg}</p>}
      {classes.length > 0 && (
        <>
          {terms ? (
            <select value={termId} onChange={(e) => { setTermId(e.target.value); setPending([]); }}>
              <option value="">Select term</option>
              {terms.map((t) => <option key={String(t.id)} value={String(t.id)}>{label(t)}</option>)}
            </select>
          ) : <input placeholder="Term ID (uuid)" value={termId} onChange={(e) => setTermId(e.target.value)} />}
          <select value={classId} onChange={(e) => { setClassId(e.target.value); setPending([]); }}>
            <option value="all">All classes (one file, a tab per class)</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name} only</option>)}
          </select>
          <h2>1. Download template</h2>
          <button disabled={busy} onClick={template}>{busy ? "Working…" : "Download Excel template"}</button>
          <h2>2. Upload filled file</h2>
          <input type="file" accept=".xlsx,.xls" onChange={onFile} disabled={busy} />
          <button disabled={!pending.length || busy} onClick={save}>Save scores</button>
          <h2>3. Publish to portal</h2>
          <div className="adm-row"><input value={termLabel} onChange={(e) => setTermLabel(e.target.value)} placeholder="Term name e.g. First Term" /><input value={session} onChange={(e) => setSession(e.target.value)} placeholder="Session" /></div>
          <button disabled={busy} onClick={publish}>{classId === "all" ? "Publish all classes" : "Publish this class"}</button>
          <p style={{ fontSize: ".85rem", color: "#687385", marginTop: 10 }}>Totals, average and grade are computed from CA + Exam. Students with no scores are skipped. Re-publishing updates existing results.</p>
        </>
      )}
    </div>
  );
}
