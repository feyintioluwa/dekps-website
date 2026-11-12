"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import "../teacher.css";
import "./history.css";

type Item = {
  id: number;
  term_id: string;
  student_name: string;
  student_login_id: string;
  class_id: string;
  class_name: string;
  subject_id: string;
  subject_name: string;
  term_label: string;
  kind: string;
  old_score: number | null;
  new_score: number;
  action: string;
  editor_name: string;
  changed_at: string;
};
type TermOption = { id: string; label: string };
type NamedOption = { id: string; name: string };

function scoreType(kind: string) {
  return kind === "test1" ? "CA" : kind === "exam" ? "Exam" : kind;
}

export default function TeacherScoreHistoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [terms, setTerms] = useState<TermOption[]>([]);
  const [classes, setClasses] = useState<NamedOption[]>([]);
  const [subjects, setSubjects] = useState<NamedOption[]>([]);
  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ page: String(page) });
      if (termId) query.set("termId", termId);
      if (classId) query.set("classId", classId);
      if (subjectId) query.set("subjectId", subjectId);
      const response = await fetch(`/api/teacher/score-history?${query}`, {
        cache: "no-store",
        signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load score history");
      setItems(data.items ?? []);
      setTerms(data.terms ?? []);
      setClasses(data.classes ?? []);
      setSubjects(data.subjects ?? []);
      setHasMore(!!data.hasMore);
    } catch (e) {
      if (signal.aborted) return;
      setError(e instanceof Error ? e.message : "Could not load score history");
      setItems([]);
      setHasMore(false);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [page, termId, classId, subjectId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => !q || [
      item.student_name,
      item.student_login_id,
      item.subject_name,
      item.editor_name,
    ].some((value) => value.toLowerCase().includes(q)));
  }, [items, search]);

  return (
    <div className="tch tch-history-page">
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
          <a className="tch-history-back" href="/teacher">← Teacher dashboard</a>
        </div>
      </header>

      <main className="tch-main">
        <div className="tch-history-heading">
          <div>
            <span className="tch-history-eyebrow">TEACHER PORTAL / AUDIT LOG</span>
            <h1>Score Editing History</h1>
            <p className="tch-muted">Review recorded changes across all terms for your authorized classes and subjects.</p>
          </div>
          <span className="tch-history-readonly">Read-only records</span>
        </div>

        <section className="tch-card tch-history-panel" aria-label="Score history filters">
          <div className="tch-history-panel-title">
            <h2>Find a score change</h2>
            <p className="tch-muted">Filter by academic term, class, or subject.</p>
          </div>
          <div className="tch-history-filters">
            <div>
              <label htmlFor="history-term">Academic term</label>
              <select id="history-term" value={termId} onChange={(e) => { setTermId(e.target.value); setPage(0); }}>
                <option value="">All terms</option>
                {terms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="history-class">Class</label>
              <select id="history-class" value={classId} onChange={(e) => { setClassId(e.target.value); setPage(0); }}>
                <option value="">All classes</option>
                {classes.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="history-subject">Subject</label>
              <select id="history-subject" value={subjectId} onChange={(e) => { setSubjectId(e.target.value); setPage(0); }}>
                <option value="">All subjects</option>
                {subjects.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="history-search">Search current page</label>
              <input id="history-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Student, subject or editor" />
            </div>
          </div>
        </section>

        <section className="tch-history-results" aria-label="Score changes" aria-busy={loading}>
          <div className="tch-history-results-heading">
            <div>
              <h2>Activity log</h2>
              <p className="tch-muted">{loading ? "Loading records…" : `${shown.length} record${shown.length === 1 ? "" : "s"} on this page`}</p>
            </div>
            <span className="tch-history-page-number">Page {page + 1}</span>
          </div>

          {error ? (
            <div className="tch-history-state tch-history-error" role="alert">{error}</div>
          ) : loading ? (
            <div className="tch-history-state" role="status">Loading score history…</div>
          ) : shown.length === 0 ? (
            <div className="tch-history-state">{search.trim() && items.length > 0 ? "No matching records on this page." : "No score changes found for these filters."}</div>
          ) : (
            <div className="tch-history-list">
              {shown.map((item) => {
                const difference = item.old_score === null ? null : item.new_score - item.old_score;
                const trend = difference === null ? "new" : difference > 0 ? "up" : difference < 0 ? "down" : "same";
                return (
                  <article className="tch-history-entry" key={item.id}>
                    <div className="tch-history-entry-main">
                      <div className="tch-history-entry-top">
                        <div className="tch-history-person">
                          <h3>{item.student_name}</h3>
                          {item.student_login_id && <span className="tch-history-login">{item.student_login_id}</span>}
                        </div>
                        <span className="tch-history-kind">{scoreType(item.kind)}</span>
                      </div>
                      <div className="tch-history-subject">{item.subject_name}</div>
                      <div className="tch-history-meta">
                        <span>{item.class_name}</span>
                        <span>{item.term_label}</span>
                      </div>
                      <div className="tch-history-entry-footer">
                        <span><strong>Edited by</strong> {item.editor_name}</span>
                        <time dateTime={item.changed_at}>{new Date(item.changed_at).toLocaleString()}</time>
                      </div>
                    </div>
                    <div className={`tch-history-score tch-history-score-${trend}`} aria-label={`Previous score ${item.old_score ?? "not available"}, new score ${item.new_score}`}>
                      <div className="tch-history-score-values">
                        <div><span>PREVIOUS</span><strong>{item.old_score ?? "—"}</strong></div>
                        <span className="tch-history-arrow" aria-hidden="true">→</span>
                        <div><span>NEW SCORE</span><strong>{item.new_score}</strong></div>
                      </div>
                      <span className="tch-history-change">
                        {difference === null ? "Initial score" : difference > 0 ? `+${difference} points` : difference < 0 ? `${difference} points` : "No difference"}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div className="tch-history-pagination">
            <button className="tch-btn" type="button" disabled={loading || page === 0} onClick={() => setPage((n) => Math.max(0, n - 1))}>← Previous</button>
            <span className="tch-muted">Page {page + 1}</span>
            <button className="tch-btn" type="button" disabled={loading || !hasMore} onClick={() => setPage((n) => n + 1)}>Next →</button>
          </div>
        </section>
      </main>
    </div>
  );
}
