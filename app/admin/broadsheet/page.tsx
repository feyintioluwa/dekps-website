"use client";

import { ChangeEvent, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import "../students/admin.css";
import { useAdminKey } from "../AdminShell";
import { useConfirm } from "../Dialog";

type Opt = { id: string; name: string };
type Stu = { id: string; login_id: string; name: string };
type Data = {
  students: Stu[]; subjects: Opt[];
  studentSubjects: { student_id: string; subject_id: string }[];
    scores: { student_id: string; subject_id: string; kind: string; score: number; source: string }[];
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
  const [overwrites, setOverwrites] = useState<string[]>([]);
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

  // ---------- Styled template: preserve the exact upload-compatible cell structure ----------
  async function template() {
    if (!termId) return setMsg("Choose the term first.");
    setBusy(true);
    setMsg("Preparing styled template…");
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = "De Kings Perfection Private School";
      wb.subject = "Student CA and Exam score entry";
      const navy = "071F3D";
      const gold = "D4AD58";
      const paleGold = "F4E8CB";
      const light = "F2F6FB";
      const border = "DCE5F0";
      let sheets = 0;

      for (const c of targets()) {
        const d = await fetchClass(c.id);
        if (!d) return;
        if (!d.students.length || !d.subjects.length) continue;

        // The uploader expects subject names in row 1, numeric limits in row 2,
        // and unchanged student names in column A from row 3 onward.
        const ws = wb.addWorksheet(c.name.slice(0, 31), {
          views: [{ state: "frozen", xSplit: 1, ySplit: 2, topLeftCell: "B3" }],
          pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
          properties: { defaultRowHeight: 30 },
        });
        ws.getColumn(1).width = 38;
        ws.getCell(1, 1).value = "Subject";
        ws.getCell(2, 1).value = "Name/Score";
        ws.getRow(1).height = 38;
        ws.getRow(2).height = 33;

        d.subjects.forEach((subject, i) => {
          const caCol = 2 + i * 2;
          const examCol = caCol + 1;
          ws.getColumn(caCol).width = 14;
          ws.getColumn(examCol).width = 14;
          ws.mergeCells(1, caCol, 1, examCol);
          ws.getCell(1, caCol).value = subject.name;
          ws.getCell(2, caCol).value = 40;
          ws.getCell(2, examCol).value = 60;
          for (const col of [caCol, examCol]) {
            const cell = ws.getCell(2, col);
            cell.numFmt = '0" marks"'; // Numeric 40/60 remain numeric for upload.
            cell.alignment = { horizontal: "center", vertical: "middle" };
          }
        });

        for (let col = 1; col <= 1 + d.subjects.length * 2; col++) {
          const top = ws.getCell(1, col);
          top.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${navy}` } };
          top.font = { name: "Aptos", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
          top.alignment = { horizontal: col === 1 ? "left" : "center", vertical: "middle", wrapText: true, indent: col === 1 ? 1 : 0 };
          top.border = { bottom: { style: "medium", color: { argb: `FF${gold}` } } };
          const sub = ws.getCell(2, col);
          sub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${col === 1 ? gold : paleGold}` } };
          sub.font = { name: "Aptos", size: 11, bold: true, color: { argb: `FF${navy}` } };
          sub.alignment = { horizontal: col === 1 ? "left" : "center", vertical: "middle", indent: col === 1 ? 1 : 0 };
          sub.border = { bottom: { style: "medium", color: { argb: `FF${gold}` } } };
        }

        d.students.forEach((student, i) => {
          const rowNumber = i + 3;
          const row = ws.getRow(rowNumber);
          row.height = 32;
          const nameCell = row.getCell(1);
          nameCell.value = student.name;
          nameCell.font = { name: "Aptos", size: 13, bold: true, color: { argb: `FF${navy}` } };
          nameCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
          nameCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${i % 2 ? "FFFFFF" : light}` } };
          nameCell.border = { bottom: { style: "hair", color: { argb: `FF${border}` } }, right: { style: "thin", color: { argb: `FF${gold}` } } };

          d.subjects.forEach((subject, j) => {
            const permitted = allowed(d, student, subject.id);
            for (const [offset, kind, limit] of [[0, "ca", 40], [1, "exam", 60]] as const) {
              const cell = row.getCell(2 + j * 2 + offset);
              const existing = permitted ? d.scores.find((score) => score.student_id === student.id && score.subject_id === subject.id && score.kind === kind)?.score : undefined;
              if (existing !== undefined) cell.value = existing;
              cell.font = { name: "Aptos", size: 12, color: { argb: `FF${navy}` } };
              cell.alignment = { horizontal: "center", vertical: "middle" };
              cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${!permitted ? "E9EDF2" : i % 2 ? "FFFFFF" : light}` } };
              cell.border = { bottom: { style: "hair", color: { argb: `FF${border}` } }, right: { style: "hair", color: { argb: `FF${border}` } } };
              if (permitted) {
                cell.dataValidation = {
                  type: "whole", operator: "between", allowBlank: true, showErrorMessage: true,
                  errorStyle: "stop", errorTitle: "Invalid score",
                  error: `Enter a whole-number score from 0 to ${limit}.`,
                  formulae: [0, limit],
                };
              }
            }
          });
        });
        ws.printOptions = { horizontalCentered: true };
        ws.pageSetup.printTitlesRow = "1:2";
        sheets++;
      }

      if (!sheets) {
        setMsg("No students or subjects found to put in the template.");
        return;
      }
      const label = classId === "all" ? "All-Classes" : targets()[0]?.name ?? "Class";
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${label}-broadsheet.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMsg(`Template downloaded (${sheets} sheet${sheets > 1 ? "s" : ""}). Fill CA and Exam (blank = no score). Totals are worked out when you publish. Do not change student names, subject headings or tab names.`);
    } catch (error) {
      setMsg(`Could not prepare template: ${error instanceof Error ? error.message : "Please try again."}`);
    } finally {
      setBusy(false);
    }
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
    const over: string[] = [];
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
              else {
              scores.push({ subjectId: col.s.id, kind, score: n });
              // Was this score entered by a teacher, and does the file change it?
              if (d.scores.some((x) => x.student_id === st.id && x.subject_id === col.s.id && x.kind === kind && x.source === "teacher" && x.score !== n)) {
                over.push(`${cls.name} ${st.name}: ${col.s.name} ${label}`);
              }
            }
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
    setOverwrites(over);
    const n = groups.reduce((a, g) => a + g.rows.length, 0);
    setMsg(
      `${n} students read from ${groups.length} class${groups.length === 1 ? "" : "es"}.` +
      (skipped.length ? ` Skipped tabs (no matching class): ${skipped.join(", ")}.` : "") +
      (notFound.length ? ` Names NOT found on the website (not saved): ${notFound.slice(0, 12).join("; ")}${notFound.length > 12 ? ` … and ${notFound.length - 12} more` : ""}.` : "") +
      (over.length ? ` ${over.length} score${over.length === 1 ? "" : "s"} entered by teachers will be replaced (you will be asked to confirm).` : "") +
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
    if (overwrites.length) {
      const list = overwrites.slice(0, 8).join("\n") + (overwrites.length > 8 ? `\n… and ${overwrites.length - 8} more` : "");
      if (!(await ask({
        title: "Replace teachers' scores?",
        message: `This file will replace ${overwrites.length} score${overwrites.length === 1 ? "" : "s"} entered by teachers:\n${list}`,
        confirmText: "Replace and save",
        danger: true,
      }))) return;
    }
    setBusy(true);
    try {
      let saved = 0; const unknown: string[] = [];
      for (const g of pending) {
        const d = await post(g.classId, { action: "save", rows: g.rows });
        saved += d.saved; unknown.push(...d.unknown);
      }
      setMsg(`${saved} scores saved.${unknown.length ? " Not in their class: " + unknown.join(", ") : ""}`);
      setPending([]);
      setOverwrites([]);
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
    async function unpublish() {
    if (!termId) return setMsg("Choose the term first.");
    if (!(await ask({
      title: classId === "all" ? "Unpublish results for ALL classes?" : "Unpublish results for this class?",
      message: "Students will no longer be able to see these results. Scores and remarks are kept, and you can publish again at any time.",
      confirmText: "Unpublish",
      danger: true,
    }))) return;
    setBusy(true);
    try {
      const lines: string[] = [];
      for (const c of targets()) {
        const d = await post(c.id, { action: "unpublish" });
        lines.push(`${c.name}: ${d.removed}`);
      }
      setMsg(`Unpublished — ${lines.join(", ")}`);
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
          <h2>3. Publish to portal</h2>
          <div className="adm-row"><input value={termLabel} onChange={(e) => setTermLabel(e.target.value)} placeholder="Term name e.g. First Term" /><input value={session} onChange={(e) => setSession(e.target.value)} placeholder="Session" /></div>
                    <button disabled={busy} onClick={publish}>{classId === "all" ? "Publish all classes" : "Publish this class"}</button>
          <button style={{ background: "#9e1824", marginLeft: 8 }} disabled={busy} onClick={unpublish}>{classId === "all" ? "Unpublish all classes" : "Unpublish this class"}</button>
          <p style={{ fontSize: ".85rem", color: "#687385", marginTop: 10 }}>Totals, average and grade are computed from CA + Exam. Students with no scores are skipped. Re-publishing updates existing results.</p>
          <h2>4. Backup</h2>
          <button disabled={busy} onClick={backup}>Download backup of this term&apos;s scores</button>
          <p style={{ fontSize: ".85rem", color: "#687385", marginTop: 10 }}>Saves every CA and Exam score for the chosen term, for all classes, in one Excel file. Do this before a big upload and again before you publish.</p>
        </>
      )}
    </div>
  );
}
