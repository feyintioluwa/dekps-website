"use client";

import { ChangeEvent, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import "../../admin/students/admin.css";
import "../teacher.css";
import { DialogProvider } from "@/lib/dialog";

type Opt = { id: string; name: string };
type Stu = { id: string; login_id: string; name: string };
type TermInfo = { id: string; label: string; locked: boolean } | null;
type Data = {
  term: TermInfo;
  students: Stu[]; subjects: Opt[];
  studentSubjects: { student_id: string; subject_id: string }[];
  scores: { student_id: string; subject_id: string; kind: string; score: number }[];
};
type Row = { loginId: string; scores: { subjectId: string; kind: string; score: number }[] };
type Group = { classId: string; className: string; rows: Row[] };

const API = "/api/teacher/scores";

// Compare names/subjects ignoring capitals and extra spaces
const norm = (v: unknown) => String(v ?? "").toUpperCase().replace(/\s+/g, " ").trim();

export default function TeacherScoresPage() {
  return (
    <DialogProvider watchMessages>
      <TeacherScores />
    </DialogProvider>
  );
}

function TeacherScores() {
  const [signedOut, setSignedOut] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [term, setTerm] = useState<TermInfo>(null);
  const [classes, setClasses] = useState<Opt[]>([]);
  const [classId, setClassId] = useState("all");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Group[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(API);
        const d = await r.json().catch(() => ({}));
        if (r.status === 401) { setSignedOut(true); return; }
        if (!r.ok) { setMsg(d.error || "Something went wrong."); return; }
        setTerm(d.term); setClasses(d.classes);
      } catch {
        setMsg("Could not reach the server. Check your internet and try again.");
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const targets = () => (classId === "all" ? classes : classes.filter((c) => c.id === classId));
  const ready = !!term && !term.locked;

  async function fetchClass(cid: string): Promise<Data | null> {
    const r = await fetch(`${API}?classId=${encodeURIComponent(cid)}`);
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { setSignedOut(true); return null; }
    if (!r.ok) { setMsg(d.error || "Could not load the class."); return null; }
    return d;
  }
  const allowed = (d: Data, st: Stu, subId: string) => {
    const mine = d.studentSubjects.filter((x) => x.student_id === st.id);
    return mine.length === 0 || mine.some((x) => x.subject_id === subId);
  };

  // ---------- Template: CA (out of 40) and Exam (out of 60) for YOUR subjects ----------
  async function template() {
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
    const label = classId === "all" ? "My-Classes" : targets()[0]?.name ?? "Class";
    XLSX.writeFile(wb, `${label}-scores.xlsx`);
    setMsg(`Template downloaded (${sheets} sheet${sheets > 1 ? "s" : ""}). Fill CA (out of 40) and Exam (out of 60). Leave a box empty for no score. Do not change student names, subject headings or tab names.`);
  }

  // ---------- Upload: reads CA/Exam pairs under each subject heading ----------
  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
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
        if (!s) { errors.push(`${cls.name}: "${String(head[c]).trim()}" is not one of your subjects in this class`); continue; }
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
            const limit = kind === "ca" ? 40 : 60; // the server checks this again
            if (Number.isNaN(n) || n < 0 || n > Math.min(mx, limit)) errors.push(`${cls.name} ${st.name}: ${col.s.name} ${label} = "${raw}" (max ${Math.min(mx, limit)})`);
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
      (skipped.length ? ` Skipped tabs (not one of your classes): ${skipped.join(", ")}.` : "") +
      (notFound.length ? ` Names NOT found on the website (not saved): ${notFound.slice(0, 12).join("; ")}${notFound.length > 12 ? ` … and ${notFound.length - 12} more` : ""}.` : "") +
      " Press Save scores."
    );
  }

  async function save() {
    setBusy(true);
    try {
      let saved = 0; const unknown: string[] = [];
      for (const g of pending) {
        const r = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "save", classId: g.classId, rows: g.rows }),
        });
        const d = await r.json().catch(() => ({}));
        if (r.status === 401) { setSignedOut(true); throw new Error("Your session ended. Please sign in again."); }
        if (!r.ok) throw new Error(d.error || "Could not save the scores.");
        saved += d.saved; unknown.push(...d.unknown);
      }
      setMsg(`${saved} scores saved.${unknown.length ? " Not in their class: " + unknown.join(", ") : ""} The school admin will publish the results.`);
      setPending([]);
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
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
            <a className="tch-btn tch-light" href="/teacher" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
              ← My classes
            </a>
          </div>
        </header>
      </div>

      <main style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px 60px" }}>
        <div className="adm">
          <h1>Scores — upload CA &amp; Exam</h1>
          {msg && <p className="adm-msg">{msg}</p>}

          {signedOut && <p>Your session ended. <a href="/teacher">Sign in again</a>.</p>}
          {!signedOut && !loaded && <p>Loading...</p>}
          {!signedOut && loaded && classes.length === 0 && <p>You have no classes or subjects yet. Please see the school admin.</p>}

          {!signedOut && loaded && classes.length > 0 && (
            <>
              {!term && <p className="adm-msg">No current term has been set. Please see the school admin.</p>}
              {term && term.locked && <p className="adm-msg">{term.label} is locked, so scores cannot be changed now.</p>}
              {term && !term.locked && <p style={{ fontWeight: 600 }}>Current term: {term.label}</p>}

              <select value={classId} onChange={(e) => { setClassId(e.target.value); setPending([]); }}>
                <option value="all">All my classes (one file, a tab per class)</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name} only</option>)}
              </select>

              <h2>1. Download template</h2>
              <button disabled={busy || !ready} onClick={template}>{busy ? "Working…" : "Download Excel template"}</button>
              <p style={{ fontSize: ".85rem", color: "#687385", marginTop: 10 }}>
                The sheet has only your subjects. A class teacher gets every subject of their class. Scores already saved are filled in.
              </p>

              <h2>2. Upload filled file</h2>
              <input type="file" accept=".xlsx,.xls" onChange={onFile} disabled={busy || !ready} />
              <button disabled={!pending.length || busy || !ready} onClick={save}>Save scores</button>
              <p style={{ fontSize: ".85rem", color: "#687385", marginTop: 10 }}>
                CA is out of 40 and Exam is out of 60. Saving again replaces the scores you saved before. Results are published by the school admin.
              </p>
            </>
          )}
        </div>
      </main>
    </>
  );
}
