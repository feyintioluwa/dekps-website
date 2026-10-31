"use client";

import { ChangeEvent, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import "../teacher.css";

type Sub = { id: string; name: string };
type Cls = { id: string; name: string; canFill: boolean; note: string; subjects: Sub[] };
type Term = { id: string; label: string; locked: boolean } | null;
type Stu = { id: string; login_id: string; name: string };
type Data = {
  term: Term;
  students: Stu[];
  subjects: Sub[];
  studentSubjects: { student_id: string; subject_id: string }[];
  scores: { student_id: string; subject_id: string; kind: string; score: number }[];
};
type Row = { loginId: string; scores: { subjectId: string; kind: string; score: number }[] };
type Group = { classId: string; className: string; rows: Row[] };
type Info = { toSave: number; changes: number; fromOthers: number; examples: string[]; unknown: string[] };

const NETWORK = "Could not reach the server. Check your internet and try again.";
// Compare names and subjects ignoring capitals and extra spaces
const norm = (v: unknown) => String(v ?? "").toUpperCase().replace(/\s+/g, " ").trim();

export default function TeacherScores() {
  const [checking, setChecking] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const [term, setTerm] = useState<Term>(null);
  const [classes, setClasses] = useState<Cls[]>([]);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Group[]>([]);
  const [info, setInfo] = useState<Info | null>(null);
  const [agree, setAgree] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/teacher/scores");
        const d = await res.json();
        if (res.ok) { setTerm(d.term); setClasses(d.classes); }
        else if (res.status === 401) setSignedOut(true);
        else setMsg(d.error || "Something went wrong.");
      } catch { setMsg(NETWORK); }
      setChecking(false);
    })();
  }, []);

  const fillable = classes.filter((c) => c.canFill);
  const open = !!term && !term.locked;

  async function fetchClass(cid: string): Promise<Data | null> {
    const res = await fetch(`/api/teacher/scores?classId=${encodeURIComponent(cid)}`);
    const d = await res.json();
    if (!res.ok) { setMsg(d.error || "Could not load the class."); return null; }
    return d as Data;
  }
  const allowed = (d: Data, st: Stu, subId: string) => {
    const mine = d.studentSubjects.filter((x) => x.student_id === st.id);
    return mine.length === 0 || mine.some((x) => x.subject_id === subId);
  };

  // ---------- Download: the school's broadsheet layout, only this teacher's subjects ----------
  async function download() {
    setMsg(""); setOk(""); setBusy(true);
    try {
      const wb = XLSX.utils.book_new();
      let sheets = 0;
      for (const c of fillable) {
        const d = await fetchClass(c.id);
        if (!d) { setBusy(false); return; }
        if (!d.students.length || !d.subjects.length) continue;

        const top: (string | number)[] = ["Subject"];
        const max: (string | number)[] = ["Name/Score"];
        d.subjects.forEach((s) => { top.push(s.name, "", ""); max.push(40, 60, 100); });
        const aoa: (string | number)[][] = [top, max];
        d.students.forEach((st) => {
          const line: (string | number)[] = [st.name];
          d.subjects.forEach((s) => {
            if (!allowed(d, st, s.id)) { line.push("", "", ""); return; }
            const g = (k: string) => d.scores.find((x) => x.student_id === st.id && x.subject_id === s.id && x.kind === k)?.score ?? "";
            line.push(g("ca"), g("exam"), "");
          });
          aoa.push(line);
        });

        const ws = XLSX.utils.aoa_to_sheet(aoa);
        ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: d.subjects.length * 3 } });
        ws["!merges"] = d.subjects.map((_, j) => ({ s: { r: 0, c: 1 + j * 3 }, e: { r: 0, c: 3 + j * 3 } }));
        ws["!cols"] = [{ wch: 30 }, ...d.subjects.flatMap(() => [{ wch: 7 }, { wch: 7 }, { wch: 7 }])];
        d.students.forEach((st, i) => {
          const excelRow = i + 3;
          d.subjects.forEach((s, j) => {
            if (!allowed(d, st, s.id)) return;
            const ca = 1 + j * 3, ex = ca + 1, tot = ca + 2;
            const caRef = XLSX.utils.encode_cell({ r: excelRow - 1, c: ca });
            const exRef = XLSX.utils.encode_cell({ r: excelRow - 1, c: ex });
            const caVal = aoa[i + 2][ca], exVal = aoa[i + 2][ex];
            const has = caVal !== "" || exVal !== "";
            ws[XLSX.utils.encode_cell({ r: excelRow - 1, c: tot })] = has
              ? { t: "n", f: `SUM(${caRef}:${exRef})`, v: Number(caVal || 0) + Number(exVal || 0) }
              : { t: "s", f: `IF(COUNT(${caRef}:${exRef})=0,"",SUM(${caRef}:${exRef}))`, v: "" };
          });
        });
        XLSX.utils.book_append_sheet(wb, ws, c.name.slice(0, 31));
        sheets++;
      }
      if (!sheets) { setMsg("No students or subjects found for your classes."); setBusy(false); return; }
      XLSX.writeFile(wb, "My-broadsheet.xlsx");
      setOk(`Downloaded (${sheets} sheet${sheets > 1 ? "s" : ""}). Fill CA and Exam only; Total is worked out for you. Do not change student names, subject headings or tab names.`);
    } catch { setMsg(NETWORK); }
    setBusy(false);
  }

  // ---------- Upload: read the file, then ask the server to CHECK it (nothing is saved yet) ----------
  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setMsg(""); setOk(""); setPending([]); setInfo(null); setAgree(false); setBusy(true);
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const groups: Group[] = [];
      const errors: string[] = [];
      const skipped: string[] = [];
      const notFound: string[] = [];

      for (const sheetName of wb.SheetNames) {
        const cls = fillable.find((c) => norm(c.name) === norm(sheetName));
        if (!cls) { skipped.push(sheetName); continue; }
        const d = await fetchClass(cls.id);
        if (!d) { setBusy(false); return; }

        const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, defval: "" });
        const head = grid[0] ?? [];
        const bySubject = new Map(d.subjects.map((s) => [norm(s.name), s]));
        const cols: { s: Sub; ca: number; exam: number }[] = [];
        for (let c = 1; c < head.length; c++) {
          const t = norm(head[c]);
          if (!t) continue;
          const s = bySubject.get(t);
          if (!s) { errors.push(`${cls.name}: "${String(head[c]).trim()}" is not one of your subjects in this class`); continue; }
          cols.push({ s, ca: c, exam: c + 1 });
        }

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
              [col.ca, "ca", 40, "CA"],
              [col.exam, "exam", 60, "Exam"],
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

      if (errors.length) {
        setMsg(`Fix these and upload again: ${errors.slice(0, 8).join("; ")}${errors.length > 8 ? ` … and ${errors.length - 8} more` : ""}`);
        setBusy(false);
        return;
      }
      if (!groups.length) {
        setMsg(`No tab matched one of your classes.${skipped.length ? ` Tabs skipped: ${skipped.join(", ")}.` : ""}`);
        setBusy(false);
        return;
      }

      // Ask the server what would happen. Nothing is saved yet.
      const total: Info = { toSave: 0, changes: 0, fromOthers: 0, examples: [], unknown: [] };
      for (const g of groups) {
        const res = await fetch("/api/teacher/scores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "check", classId: g.classId, rows: g.rows }),
        });
        const d = await res.json();
        if (!res.ok) { setMsg(`${g.className}: ${d.error || "Could not check the file."}`); setBusy(false); return; }
        total.toSave += d.toSave; total.changes += d.changes; total.fromOthers += d.fromOthers;
        total.examples.push(...d.examples); total.unknown.push(...d.unknown);
      }
      setPending(groups);
      setInfo(total);
      setOk(
        `${total.toSave} scores read from ${groups.length} class${groups.length === 1 ? "" : "es"}.` +
        (skipped.length ? ` Skipped tabs (not your classes): ${skipped.join(", ")}.` : "") +
        (notFound.length ? ` Names NOT found on the website (not saved): ${notFound.slice(0, 10).join("; ")}${notFound.length > 10 ? " …" : ""}.` : "") +
        " Press Save scores."
      );
    } catch { setMsg(NETWORK); }
    setBusy(false);
  }

  async function save() {
    if (!info) return;
    setMsg(""); setBusy(true);
    try {
      let saved = 0;
      for (const g of pending) {
        const res = await fetch("/api/teacher/scores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "save", classId: g.classId, rows: g.rows, confirm: info.changes > 0 && agree }),
        });
        const d = await res.json();
        if (!res.ok) { setMsg(`${g.className}: ${d.error || "Could not save."}`); setBusy(false); return; }
        saved += d.saved;
      }
      setOk(`${saved} scores saved. They now show in the main broadsheet. The school admin publishes the results.`);
      setPending([]); setInfo(null); setAgree(false);
    } catch { setMsg(NETWORK); }
    setBusy(false);
  }

  const green = { color: "#138a57", fontWeight: 600, fontSize: ".9rem" } as const;

  return (
    <div className="tch">
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
          <a className="tch-btn tch-light" href="/teacher" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>← Back to home</a>
        </div>
      </header>

      <main className="tch-main">
        <h1>Scores</h1>
        <p className="tch-muted">Download a broadsheet for your classes and subjects, fill it in and upload it. The school admin publishes the results.</p>

        {checking && <p className="tch-muted tch-center">Loading...</p>}

        {!checking && signedOut && (
          <section className="tch-card tch-narrow">
            <h2>Please sign in</h2>
            <p className="tch-muted">Your session has ended.</p>
            <a className="tch-btn" href="/teacher" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", marginTop: 12 }}>Go to sign in</a>
          </section>
        )}

        {!checking && !signedOut && (
          <>
            {msg && <p className="tch-error" role="alert">{msg}</p>}
            {ok && <p style={green}>{ok}</p>}

            <section className="tch-card" style={{ marginTop: 16 }}>
              <h2>Term</h2>
              {!term && <p className="tch-error">No term is open for scores right now. Please see the school admin.</p>}
              {term && <p>{term.label}{term.locked ? " (locked)" : ""}</p>}
              {term?.locked && <p className="tch-error">This term is locked, so scores cannot be changed.</p>}
            </section>

            <section className="tch-card" style={{ marginTop: 16 }}>
              <h2>Your classes and subjects</h2>
              {classes.length === 0 && <p className="tch-muted">You have no classes yet. Please see the school admin.</p>}
              {classes.map((c) => (
                <div key={c.id} style={{ margin: "10px 0" }}>
                  <b>{c.name}</b>
                  {!c.canFill && <div className="tch-muted">{c.note || "You have no subjects to fill in this class."}</div>}
                  {c.canFill && (
                    <div className="tch-chips" style={{ marginTop: 6 }}>
                      {c.subjects.map((s) => <span className="tch-chip" key={s.id}>{s.name}</span>)}
                    </div>
                  )}
                </div>
              ))}
            </section>

            {fillable.length > 0 && (
              <>
                <section className="tch-card" style={{ marginTop: 16 }}>
                  <h2>1. Download your broadsheet</h2>
                  <p className="tch-muted" style={{ marginBottom: 12 }}>One Excel file with a tab for each of your classes. Scores already saved are filled in.</p>
                  <button className="tch-btn" disabled={busy || !open} onClick={download}>{busy ? "Working..." : "Download broadsheet"}</button>
                </section>

                <section className="tch-card" style={{ marginTop: 16 }}>
                  <h2>2. Upload the filled file</h2>
                  <p className="tch-muted" style={{ marginBottom: 12 }}>Use the file you downloaded. Fill CA (out of 40) and Exam (out of 60). Leave a cell empty if there is no score.</p>
                  <input type="file" accept=".xlsx,.xls" onChange={onFile} disabled={busy || !open} />

                  {info && info.changes > 0 && (
                    <div style={{ border: "1px solid #e0b4b8", background: "#fdeaea", borderRadius: 10, padding: 12, margin: "14px 0" }}>
                      <b style={{ color: "#9e1824" }}>{info.changes} saved score{info.changes === 1 ? "" : "s"} would be changed.</b>
                      {info.fromOthers > 0 && <div>{info.fromOthers} of them {info.fromOthers === 1 ? "was" : "were"} entered by the school admin or an online test.</div>}
                      <ul style={{ margin: "8px 0 8px 18px" }}>
                        {info.examples.map((x, i) => <li key={i}>{x}</li>)}
                        {info.changes > info.examples.length && <li>… and {info.changes - info.examples.length} more</li>}
                      </ul>
                      <label style={{ display: "flex", alignItems: "center", margin: 0 }}>
                        <input type="checkbox" style={{ width: "auto", height: "auto", marginRight: 8 }} checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                        Yes, change these scores
                      </label>
                    </div>
                  )}

                  <button className="tch-btn" style={{ marginTop: 12 }} disabled={busy || !pending.length || !open || (!!info && info.changes > 0 && !agree)} onClick={save}>
                    {busy ? "Working..." : "Save scores"}
                  </button>
                </section>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
