"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import "../teacher.css";
import { DialogProvider, useConfirm, useToast } from "@/lib/dialog";
import "./submissions.css";

type Pair = { class_id: string; subject_id: string };
type Item = { class_id: string; subject_id: string; status: string; review_note: string; submitted_at: string | null };
type Named = { id: string; name: string };
type State = {
  term: { term: string; session: string; is_locked: boolean } | null;
  classes: Named[];
  subjects: Named[];
  pairs: Pair[];
  items: Item[];
};
type StatusFilter = "all" | "attention" | "pending" | "approved" | "returned";

const actionable = new Set(["draft", "withdrawn", "returned"]);
const label = (xs: Named[], id: string) => xs.find(x => x.id === id)?.name || id;

// Natural school order; unknown class names follow alphabetically.
function classSortKey(name: string): [number, number, string] {
  const value = name.trim().toLowerCase().replace(/\s+/g, " ");
  const level = value.match(/\b(\d+)\b/)?.[1];
  const number = level ? Number(level) : (value.includes("one") ? 1 : value.includes("two") ? 2 : value.includes("three") ? 3 : value.includes("four") ? 4 : value.includes("five") ? 5 : value.includes("six") ? 6 : 0);
  if (/cr[eè]che|creche/.test(value)) return [0, number, value];
  if (/nursery|kg|kindergarten/.test(value)) return [1, number, value];
  if (/basic|primary|pry\b/.test(value)) return [2, number, value];
  if (/jss|junior secondary/.test(value)) return [3, number, value];
  if (/sss|ss\s*[123]|senior secondary/.test(value)) return [4, number, value];
  return [5, number, value];
}

function Content() {
  const [data, setData] = useState<State | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [bulk, setBulk] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const confirm = useConfirm();
  const toast = useToast();

  async function load() {
    try {
      const r = await fetch("/api/teacher/score-submissions", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Could not load submissions");
      setData(d);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    }
  }
  useEffect(() => { void load(); }, []);

  function statusFor(pair: Pair) {
    return data?.items.find(x => x.class_id === pair.class_id && x.subject_id === pair.subject_id)?.status || "draft";
  }

  async function act(pair: Pair, action: "submit" | "withdraw") {
    const ok = await confirm({
      title: action === "withdraw" ? "Withdraw submission?" : "Submit scores for approval?",
      message: action === "withdraw"
        ? "Your pending scores will be unlocked for editing. This withdrawal is recorded."
        : "Save all scores before submitting. Scores will be locked until Admin reviews them.",
      confirmText: action === "withdraw" ? "Withdraw" : "Submit"
    });
    if (!ok) return;
    setBusy(pair.class_id + pair.subject_id);
    try {
      const r = await fetch("/api/teacher/score-submissions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: pair.class_id, subjectId: pair.subject_id, action })
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Request failed");
      toast(action === "submit" ? "Scores submitted for approval" : "Submission withdrawn", "ok");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Network error", "err");
    } finally { setBusy(""); }
  }

  async function submitAll() {
    if (!data || busy || bulk || data.term?.is_locked) return;
    const eligible = data.pairs.filter(pair => actionable.has(statusFor(pair)));
    if (!eligible.length) return;
    if (!await confirm({
      title: "Submit available score sheets?",
      message: `Attempt to submit ${eligible.length} class-subject score sheets? Each is validated by the server. Incomplete sheets may be rejected and will remain editable.`,
      confirmText: `Submit ${eligible.length} sheets`
    })) return;
    setBulk(true);
    let succeeded = 0;
    const failures: string[] = [];
    try {
      for (const pair of eligible) {
        try {
          const r = await fetch("/api/teacher/score-submissions", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ classId: pair.class_id, subjectId: pair.subject_id, action: "submit" })
          });
          const d = await r.json().catch(() => null);
          if (!r.ok) throw Error(d?.error || `Submission failed (${r.status})`);
          succeeded++;
        } catch (e) {
          failures.push(`${label(data.classes, pair.class_id)} — ${label(data.subjects, pair.subject_id)}: ${e instanceof Error ? e.message : "Network error"}`);
        }
      }
      toast(`${succeeded} submitted; ${failures.length} not submitted.`, failures.length ? "err" : "ok");
      setError(failures.join(" | "));
      await load();
    } finally { setBulk(false); }
  }

  const grouped = useMemo(() => {
    if (!data) return [];
    const byClass = new Map<string, Pair[]>();
    for (const pair of data.pairs) {
      const entries = byClass.get(pair.class_id) || [];
      entries.push(pair);
      byClass.set(pair.class_id, entries);
    }
    return [...byClass.entries()].map(([id, pairs]) => {
      const name = label(data.classes, id);
      const sorted = [...pairs].sort((a, b) => label(data.subjects, a.subject_id).localeCompare(label(data.subjects, b.subject_id), undefined, { numeric: true }));
      const attention = sorted.filter(pair => actionable.has(data.items.find(x => x.class_id === pair.class_id && x.subject_id === pair.subject_id)?.status || "draft")).length;
      const filtered = sorted.filter(pair => {
        const status = data.items.find(x => x.class_id === pair.class_id && x.subject_id === pair.subject_id)?.status || "draft";
        return statusFilter === "all" || (statusFilter === "attention" ? actionable.has(status) : status === statusFilter);
      });
      return { id, name, pairs: filtered, total: sorted.length, attention };
    }).filter(group => group.pairs.length).sort((a, b) => {
      const ka = classSortKey(a.name), kb = classSortKey(b.name);
      return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2], undefined, { numeric: true });
    });
  }, [data, statusFilter]);

  const available = data?.pairs.filter(pair => actionable.has(statusFor(pair))).length || 0;
  const pending = data?.pairs.filter(pair => statusFor(pair) === "pending").length || 0;
  const approved = data?.pairs.filter(pair => statusFor(pair) === "approved").length || 0;
  const returned = data?.pairs.filter(pair => statusFor(pair) === "returned").length || 0;

  function actions(pair: Pair, status: string, mobile = false) {
    return <div className="s14-actions">
      {actionable.has(status) && <button type="button" disabled={!!busy || bulk || !!data?.term?.is_locked || !data?.term} onClick={() => void act(pair, "submit")}>Submit for approval</button>}
      {status === "pending" && <button type="button" className="secondary" disabled={!!busy || bulk} onClick={() => void act(pair, "withdraw")}>{mobile ? "Withdraw submission" : "Withdraw"}</button>}
      {status === "approved" && <span>Approved · Locked</span>}
    </div>;
  }

  return <main className="tch bs s14 s14-teacher">
    <div className="s14-school-header"><div className="s14-container s14-school-header-inner">
      <div className="s14-brand"><Image src="/assets/kps-logo.png" alt="De Kings Perfection Private School logo" width={48} height={48}/><div><strong>DE KINGS PERFECTION</strong><small>TEACHER PORTAL</small></div></div>
      <Link href="/teacher" className="s14-back">← Back to dashboard</Link>
    </div></div>
    <div className="s14-container s14-body">
      <div className="s14-intro"><div><div className="s14-eyebrow">ACADEMICS / ASSESSMENT</div><h1>Score Submissions</h1><p>Submit completed score sheets for approval, track reviews, or withdraw pending submissions.</p></div>
        <Link href="/teacher/broadsheet" className="s14-outline">Open Teacher Broadsheet</Link>
      </div>
      <div className="s14-term"><span className="s14-dot"/><strong>{data?.term ? `${data.term.term} — ${data.term.session}` : "No active academic term"}</strong>{data?.term?.is_locked && <span className="s14-term-locked">Locked · View only</span>}</div>
      {error && <div className="s14-error" role="alert">{error} <button type="button" onClick={() => void load()}>Retry</button></div>}
      {data && <>
        <div className="s14-stats"><div><span>Available</span><strong>{available}</strong><small>Ready to check for submission</small></div><div><span>Pending</span><strong>{pending}</strong><small>Awaiting Admin review</small></div><div><span>Approved</span><strong>{approved}</strong><small>Scores locked</small></div><div><span>Returned</span><strong>{returned}</strong><small>Correction required</small></div></div>
        <section className="s14-panel s14-bulk"><div><h2>Score submission overview</h2><p>Only complete saved score sheets can be submitted. Each sheet is checked by the server.</p></div><button type="button" disabled={!!busy || bulk || !available || !data.term || !!data.term.is_locked} onClick={() => void submitAll()}>{bulk ? "Submitting…" : `Submit All Available (${available})`}</button></section>
        <section className="s14-panel s14-sheet">
          <div className="s14-sheet-heading" style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}>
            <div><div className="s14-eyebrow">SUBMISSION TRACKER</div><h2>Assigned class subjects</h2><p>Subjects are grouped by class. Open a class to review its score sheets.</p></div>
            <div className="s14-filters"><label htmlFor="s14-teacher-status">Show</label><select id="s14-teacher-status" value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)}><option value="all">All statuses</option><option value="attention">Needs attention</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="returned">Returned</option></select></div>
          </div>
          <div style={{padding:"16px",display:"grid",gap:12}}>
            {grouped.map(group => {
              const isOpen = expanded[group.id] ?? (group.attention > 0);
              return <section key={group.id} style={{border:"1px solid var(--line)",borderRadius:12,overflow:"hidden",background:"#fff"}}>
                <button type="button" aria-expanded={isOpen} aria-controls={`s14-class-${group.id}`} onClick={() => setExpanded(old => ({...old,[group.id]: !isOpen}))} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,textAlign:"left",padding:"15px 18px",border:"none",borderRadius:0,background:"#f4f6f9",color:"#071f3d",cursor:"pointer"}}>
                  <span style={{fontWeight:800,fontSize:14}}>{group.name}</span>
                  <span style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",justifyContent:"flex-end",fontSize:12}}>{group.total} subject{group.total !== 1 ? "s" : ""}{group.attention > 0 && <span style={{color:"#9b532d",fontWeight:700}}>{group.attention} need attention</span>}<span aria-hidden="true">{isOpen ? "▴" : "▾"}</span></span>
                </button>
                {isOpen && <div id={`s14-class-${group.id}`}>
                  <div className="s14-table-scroll"><table className="s14-table" style={{minWidth:560}}><thead><tr><th>Subject</th><th>Status</th><th>Admin note</th><th>Action</th></tr></thead><tbody>{group.pairs.map(pair => {
                    const item = data.items.find(x => x.class_id === pair.class_id && x.subject_id === pair.subject_id);
                    const status = item?.status || "draft";
                    return <tr key={`${pair.class_id}:${pair.subject_id}`}><td><strong>{label(data.subjects,pair.subject_id)}</strong></td><td><span className={`s14-pill s14-${status}`}>{status}</span></td><td className="s14-note-cell">{item?.review_note || "—"}</td><td>{actions(pair,status)}</td></tr>;
                  })}</tbody></table></div>
                  <div className="s14-mobile-cards">{group.pairs.map(pair => {
                    const item = data.items.find(x => x.class_id === pair.class_id && x.subject_id === pair.subject_id);
                    const status = item?.status || "draft";
                    return <article key={`${pair.class_id}:${pair.subject_id}`} className="s14-mobile-card"><div className="s14-mobile-card-head"><div><small>SUBJECT</small><h3>{label(data.subjects,pair.subject_id)}</h3></div><span className={`s14-pill s14-${status}`}>{status}</span></div>{item?.review_note && <p className="s14-note">Admin note: {item.review_note}</p>}{actions(pair,status,true)}</article>;
                  })}</div>
                </div>}
              </section>;
            })}
            {!grouped.length && <p className="s14-empty">{data.pairs.length ? "No subjects match this status filter." : "No assigned subjects found."}</p>}
          </div>
        </section>
      </>}
    </div>
  </main>;
}
export default function Page() { return <DialogProvider><Content/></DialogProvider>; }
