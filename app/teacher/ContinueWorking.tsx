"use client";

import { useEffect, useState } from "react";

const LABELS: Record<string, string> = {
  "/teacher/assignments": "Assignments",
  "/teacher/cbt": "Tests & Exams",
  "/teacher/broadsheet": "Teacher Broadsheet",
  "/teacher/scores": "Scores",
  "/teacher/score-history": "Score Editing History",
};

export default function ContinueWorking({ email }: { email: string }) {
  const [lastPath, setLastPath] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`dkps:teacher:last-tool:${email.trim().toLowerCase()}`);
      setLastPath(saved && Object.prototype.hasOwnProperty.call(LABELS, saved) ? saved : null);
    } catch {
      setLastPath(null);
    }
  }, [email]);

  if (!lastPath) return null;

  return (
    <section className="tch-continue" aria-label="Continue where you stopped">
      <div className="tch-continue-copy">
        <span className="tch-continue-eyebrow">↗ Continue where you stopped</span>
        <strong>{LABELS[lastPath]}</strong>
        <span>Return to your most recently visited teacher tool</span>
      </div>
      <a href={lastPath} className="tch-continue-link">Continue →</a>
    </section>
  );
}
