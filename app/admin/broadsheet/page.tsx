"use client";

import { ChangeEvent, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import "../students/admin.css";
import { useAdminKey } from "../AdminShell";
import { useConfirm } from "../Dialog";

type Opt = { id: string; name: string };
type Stu = { id: string; login_id: string; name: string };
type Data = {
  students: Stu[]; subjects: Opt[];
  studentSubjects: { student_id: string; subject_id: string }[];
  scores: { student_id: string; subject_id: string; kind: string; score: number }[];
};
type Row = { loginId: string; scores: { subjectId: string; kind: string; score: number }[] };
type Group = { classId: string; className: string; rows: Row[] };

// Compare names/subjects ignoring capitals and extra spaces
const norm = (v: unknown) => String(v ?? "").toUpperCase().replace(/\s+/g, " ").trim();

export default function Broadsheet() {
  const key = useAdminKey();
  const ask = useConfirm();
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

  // ---------- Template: CA (out of 40) and Exam (out of 60) for every subject ----------
  async function template() {
    if (!termId) return setMsg("Choose the term first.");
    setBusy(true); setMsg("Preparing template…");
    const wb = XLSX.utils.book_new();
    let sheets = 0;
    for (const c of targets()) {
      const d = await fetchClass(c.id);
      if (!d) { setBusy(false); return; }
      if (!d.students.length || !d.subjects.length) continue;

      // Row 1: Subject + each subject name (merged over 2 columns)
      // Row 2: Name/Score + 40 and 60 under every subject
      const top: (string | number)[] = ["Subject"];
      const max: (string | number)[] = ["Name/Score"];
      d.subjects.forEach((s) => { top.push(s.name, ""); max.push(40, 60); });
      const aoa: (string | number)[][] = [top, max];

      d.students.forEach((st) => {
        const line: (string | number)[] = [st.name];
        d.subjects.forEach((s) => {
          if (!allowed(d, st, s.id)) { line.push("", ""); return; }
          const g = (k: string) => d.scores.find((x) => x.student_id === st.id && x.subject_id === s.id && x.kind === k)?.score ?? "";
          line.push(g("ca"), g("exam"));
        });
        aoa.push(line);
      });

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: d.subjects.length * 2 } });
      ws["!merges"] = d.subjects.map((_, j) => ({ s: { r: 0, c: 1 + j * 2 }, e: { r: 0, c: 2 + j * 2 } }));
      ws["!cols"] = [{ wch: 30 }, ...d.subjects.flatMap(() => [{ wch: 7 }, { wch: 7 }])];

      XLSX.utils.book_append_sheet(wb, ws, c.name.slice(0, 31));
      sheets++;
    }
    setBusy(false);
    if (!sheets) return setMsg("No students or subjects found to put in the template.");
    const label = classId === "all" ? "All-Classes" : targets()[0]?.name ?? "Class";
    XLSX.writeFile(wb, `${label}-broadsheet.xlsx`);
    setMsg(`Template downloaded (${sheets} sheet${sheets > 1 ? "s" : ""}). Fill CA and Exam (blank = no score). Totals are worked out when you publish. Do not change student names, subject headings or tab names.`);
  }

  // ---------- Upload: reads CA/Exam pairs under each subject heading ----------
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
    const notFound: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const cls = classId === "all"
        ? classes.find((c) => norm(c.name) === norm(sheetName))
        : classes.find((c) => c.id === classId);
      if (!cls || (classId !== "all" && sheetName !== wb.SheetNames[0])) { skipped.push(sheetName); continue; }
      const d = await fetchClass(cls.id);
      if (!d) { setBusy(false); return; }

      const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: "" });
      const head = grid[0] ?? [];
      const maxRow = grid[1] ?? [];

      // Find each subject group from the headings (merged cell value sits in its first column)
      const bySubject = new Map(d.subjects.map((s) => [norm(s.name), s]));
      const cols: { s: Opt; ca: number; exam: number; caMax: number; exMax: number }[] = [];
      for (let c = 1; c < head.length; c++) {
        const t = norm(head[c]);
        if (!t) continue;
        const s = bySubject.get(t);
        if (!s) { errors.push(`${cls.name}: subject "${String(head[c]).trim()}" is not one of this class's subjects`); continue; }
        const caMax = Number(maxRow[c]) > 0 ? Number(maxRow[c]) : 40;
        const exMax = Number(maxRow[c + 1]) > 0 ? Number(maxRow[c + 1]) : 60;
        cols.push({ s, ca: c, exam: c + 1, caMax, exMax });
      }

      // Match students by name
      const byName = new Map<string, Stu[]>();
      for (const st of d.students) {
        const k = norm(st.name);
        byName.set(k, [...(byName.get(k) ?? []), st]);
      }

      const rows: Row[] = [];
      for (let i = 2; i < grid.length; i++) {
        const line = grid[i];
        const nm = norm(line[0]);
        if (!nm) continue;
        const found = byName.get(nm);
        if (!found) { notFound.push(`${cls.name}: ${String(line[0]).trim()}`); continue; }
        if (found.length > 1) { errors.push(`${cls.name}: two students are named "${String(line[0]).trim()}"`); continue; }
        const st = found[0];
        const scores: Row["scores"] = [];
        for (const col of cols) {
          for (const [at, kind, mx, label] of [
            [col.ca, "ca", col.caMax, "CA"],
            [col.exam, "exam", col.exMax, "Exam"],
          ] as const) {
            const raw = line[at];
            if (raw === "" || raw === undefined || raw === null) continue;
            const n = Math.round(Number(raw));
            if (Number.isNaN(n) || n < 0 || n > mx) errors.push(`${cls.name} ${st.name}: ${col.s.name} ${label} = "${raw}" (max ${mx})`);
            else scores.push({ subjectId: col.s.id, kind, score: n });
          }
        }
        rows.push({ loginId: st.login_id, scores });
      }
      groups.push({ classId: cls.id, className: cls.name, rows });
    }
    setBusy(false);
    if (errors.length) {
      setPending([]);
      return setMsg(`Fix these and re-upload: ${errors.slice(0, 8).join("; ")}${errors.length > 8 ? ` … and ${errors.length - 8} more` : ""}`);
    }
    setPending(groups);
    const n = groups.reduce((a, g) => a + g.rows.length, 0);
    setMsg(
      `${n} students read from ${groups.length} class${groups.length === 1 ? "" : "es"}.` +
      (skipped.length ? ` Skipped tabs (no matching class): ${skipped.join(", ")}.` : "") +
      (notFound.length ? ` Names NOT found on the website (not saved): ${notFound.slice(0, 12).join("; ")}${notFound.length > 12 ? ` … and ${notFound.length - 12} more` : ""}.` : "") +
      " Press Save scores."
    );
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
  async function fillRemarks() {
    if (!termId) return setMsg("Choose the term first.");
    setBusy(true);
    try {
      const lines: string[] = [];
      for (const c of targets()) {
        const d = await post(c.id, { action: "remarks" });
        lines.push(`${c.name}: ${d.filled}`);
      }
      setMsg(`Remarks filled (students per class) — ${lines.join(", ")}. Remarks already written were kept.`);
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }
  async function publish() {
    if (!termId) return setMsg("Choose the term first.");
    if (!(await ask({ title: classId === "all" ? "Publish results for ALL classes?" : "Publish results for this class?", message: "Students will be able to see these results.", confirmText: "Publish" }))) return;
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
  // ---------- Backup: every saved score for the chosen term, all classes ----------
  async function backup() {
    if (!termId) return setMsg("Choose the term first.");
    setBusy(true); setMsg("Preparing backup…");
    try {
      const r = await fetch(`/api/admin/broadsheet?export=1&termId=${termId}`, { headers: h });
      const d = await r.json();
      if (!r.ok) { setMsg(d.error || "Could not prepare the backup."); setBusy(false); return; }
      const term = terms?.find((t) => String(t.id) === termId);
      const termName = term ? label(term) : termId;
      const head = ["Class", "Login ID", "Name", "Subject", "Type", "Score", "Source", "Last updated"];
      const lines = (d.rows as { cls: string; loginId: string; name: string; subject: string; type: string; score: number; source: string; updated: string }[]).map((x) => [
        x.cls, x.loginId, x.name, x.subject, x.type, x.score, x.source, x.updated ? new Date(x.updated).toLocaleString() : "",
      ]);
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([head, ...lines]);
      ws["!cols"] = [{ wch: 12 }, { wch: 16 }, { wch: 30 }, { wch: 28 }, { wch: 7 }, { wch: 7 }, { wch: 9 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws, "Scores");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
        ["Term", termName],
        ["Exported", new Date().toLocaleString()],
        ["Scores in this file", lines.length],
      ]), "Info");
      const day = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `Scores-backup-${termName.replace(/[^A-Za-z0-9]+/g, "-")}-${day}.xlsx`);
      setMsg(`Backup downloaded: ${lines.length} scores. Keep the file somewhere safe (for example Google Drive or email it to yourself).`);
    } catch { setMsg("Could not prepare the backup."); }
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
          <h2>3. Fill remarks</h2>
          <button disabled={busy} onClick={fillRemarks}>{classId === "all" ? "Fill remarks for all classes" : "Fill remarks for this class"}</button>
          <p style={{ fontSize: ".85rem", color: "#687385", marginTop: 10 }}>Do this after Save scores and before Publish. Remarks are chosen from each student&apos;s average. A remark already written is never replaced.</p>
          <h2>4. Publish to portal</h2>
          <div className="adm-row"><input value={termLabel} onChange={(e) => setTermLabel(e.target.value)} placeholder="Term name e.g. First Term" /><input value={session} onChange={(e) => setSession(e.target.value)} placeholder="Session" /></div>
          <button disabled={busy} onClick={publish}>{classId === "all" ? "Publish all classes" : "Publish this class"}</button>
          <p style={{ fontSize: ".85rem", color: "#687385", marginTop: 10 }}>Totals, average and grade are computed from CA + Exam. Students with no scores are skipped. Re-publishing updates existing results.</p>
          <h2>5. Backup</h2>
          <button disabled={busy} onClick={backup}>Download backup of this term&apos;s scores</button>
          <p style={{ fontSize: ".85rem", color: "#687385", marginTop: 10 }}>Saves every CA and Exam score for the chosen term, for all classes, in one Excel file. Do this before a big upload and again before you publish.</p>
        </>
      )}
    </div>
  );
}
