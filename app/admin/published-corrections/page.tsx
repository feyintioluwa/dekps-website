"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAdminKey } from "../AdminShell";
import "./corrections.css";

type Correction = {
  id: string;
  created_at: string;
  status: string;
  teacher_id: string;
  student_id: string;
  subject_id: string;
  kind: string;
  old_score: number;
  proposed_score: number;
  reason: string;
  decision_note: string | null;
};

type Filter = "all" | "pending" | "approved" | "rejected";

export default function AdminCorrections() {
  const key = useAdminKey();
  const [items, setItems] = useState<Correction[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!key) { setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/published-corrections", {
        headers: { "x-admin-key": key },
        cache: "no-store"
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || `Could not load requests (${response.status})`);
      setItems(Array.isArray(body?.items) ? body.items : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load requests");
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    pending: items.filter(x => x.status === "pending").length,
    approved: items.filter(x => x.status === "approved").length,
    rejected: items.filter(x => x.status === "rejected").length
  }), [items]);

  const visible = useMemo(() =>
    filter === "all" ? items : items.filter(x => x.status === filter),
    [filter, items]
  );

  async function decide(id: string, approve: boolean) {
    const note = window.prompt(
      approve ? "Approval note (optional)" : "Reason for rejection (recommended)"
    );
    if (note === null) return;
    setBusy(id);
    setMsg("");
    setError("");
    try {
      const response = await fetch("/api/admin/published-corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": key },
        body: JSON.stringify({ id, approve, note })
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || `Decision failed (${response.status})`);
      setMsg(approve ? "Correction approved; published result updated." : "Correction rejected.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Decision failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="dkps-corrections">
      <div className="dkps-corrections-head">
        <div>
          <p className="dkps-corrections-eyebrow">ACADEMIC RECORDS</p>
          <h1>Result Corrections</h1>
          <p>Review teachers’ requests to correct published CA and exam scores. Only School Admin can approve changes.</p>
        </div>
        <button type="button" className="dkps-corrections-refresh" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh requests"}
        </button>
      </div>

      <section className="dkps-corrections-stats" aria-label="Correction request totals">
        {(["pending", "approved", "rejected"] as const).map(status => (
          <div className="dkps-corrections-stat" key={status}>
            <span>{status}</span>
            <strong>{counts[status]}</strong>
          </div>
        ))}
      </section>

      <section className="dkps-corrections-panel">
        <div className="dkps-corrections-panelhead">
          <div>
            <h2>Correction Requests</h2>
            <p>Review proposed changes and their reasons before deciding.</p>
          </div>
          <label className="dkps-corrections-filter">
            <span>Show</span>
            <select value={filter} onChange={e => setFilter(e.target.value as Filter)}>
              <option value="all">All requests</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
        </div>

        {msg && <p className="dkps-corrections-message" role="status">{msg}</p>}
        {error && <p className="dkps-corrections-error" role="alert">{error}</p>}
        {loading ? (
          <div className="dkps-corrections-empty">Loading correction requests…</div>
        ) : !visible.length ? (
          <div className="dkps-corrections-empty">
            <span className="dkps-corrections-emptyicon" aria-hidden="true">✓</span>
            <strong>{filter === "all" ? "No correction requests yet" : `No ${filter} requests`}</strong>
            <p>{filter === "all" ? "Teacher correction requests will appear here for review." : "Try another status filter."}</p>
          </div>
        ) : (
          <div className="dkps-corrections-list">
            {visible.map(item => (
              <article className="dkps-corrections-request" key={item.id}>
                <div className="dkps-corrections-requesthead">
                  <div>
                    <strong>{item.kind === "test1" || item.kind === "ca" ? "CA correction" : "Exam correction"}</strong>
                    <span>{new Date(item.created_at).toLocaleString()}</span>
                  </div>
                  <span className={`dkps-corrections-status dkps-corrections-status-${item.status}`}>
                    {item.status}
                  </span>
                </div>

                <div className="dkps-corrections-details">
                  <div><span>Teacher ID</span><strong>{item.teacher_id}</strong></div>
                  <div><span>Student ID</span><strong>{item.student_id}</strong></div>
                  <div><span>Subject ID</span><strong>{item.subject_id}</strong></div>
                </div>

                <div className="dkps-corrections-change">
                  <span>Requested score change</span>
                  <strong>{item.old_score} <span aria-hidden="true">→</span> {item.proposed_score}</strong>
                </div>
                <div className="dkps-corrections-reason">
                  <span>Teacher’s reason</span>
                  <p>{item.reason}</p>
                </div>

                {item.status === "pending" ? (
                  <div className="dkps-corrections-actions">
                    <button type="button" className="dkps-corrections-approve" disabled={!!busy} onClick={() => void decide(item.id, true)}>
                      {busy === item.id ? "Processing…" : "Approve correction"}
                    </button>
                    <button type="button" className="dkps-corrections-reject" disabled={!!busy} onClick={() => void decide(item.id, false)}>
                      Reject
                    </button>
                  </div>
                ) : item.decision_note ? (
                  <div className="dkps-corrections-reason"><span>Admin decision note</span><p>{item.decision_note}</p></div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
