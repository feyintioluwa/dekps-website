"use client";

import { useEffect, useState } from "react";

type TermInfo = { id: string; label: string; locked: boolean };

export default function AcademicTermIndicator() {
  const [term, setTerm] = useState<TermInfo | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    async function loadTerm() {
      try {
        const response = await fetch("/api/teacher/scores", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Term request failed");
        const data: { term?: TermInfo | null } = await response.json();
        if (controller.signal.aborted) return;
        setTerm(data.term ?? null);
        setStatus("ready");
      } catch {
        if (!controller.signal.aborted) setStatus("error");
      }
    }
    void loadTerm();
    return () => controller.abort();
  }, []);

  return (
    <section className="tch-academic-term" aria-label="Current academic term" aria-live="polite">
      <div className="tch-academic-term-icon" aria-hidden="true">▦</div>
      <div className="tch-academic-term-info">
        <span className="tch-academic-term-eyebrow">CURRENT ACADEMIC PERIOD</span>
        <strong className="tch-academic-term-title">
          {status === "loading" ? "Loading academic term…" :
            status === "error" ? "Academic term unavailable" :
            term?.label ?? "No active term set"}
        </strong>
        <span className="tch-academic-term-detail">
          {status === "error" ? "Could not retrieve the current term" :
            status === "ready" && !term ? "Please contact the school administrator" :
            "From the school's active academic term"}
        </span>
      </div>
      {status === "ready" && term && (
        <span className={`tch-academic-term-status ${term.locked ? "locked" : "open"}`}>
          {term.locked ? "Scores Locked" : "Scores Open"}
        </span>
      )}
    </section>
  );
}
