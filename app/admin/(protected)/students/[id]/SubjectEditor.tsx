"use client";

import { useState, useTransition } from "react";
import { setStudentSubjects } from "../../actions";

type Subject = {
  id: string;
  name: string;
  position: number;
  assigned: boolean;
};

export default function SubjectEditor({
  studentId,
  subjects,
}: {
  studentId: string;
  subjects: Subject[];
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(subjects.filter((s) => s.assigned).map((s) => s.id))
  );
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setMessage("");
  }

  function save() {
    setMessage("");
    startTransition(async () => {
      const res = await setStudentSubjects(studentId, Array.from(selected));
      if (res.ok) {
        setIsError(false);
        setMessage(`Saved ${selected.size} subject${selected.size === 1 ? "" : "s"}.`);
      } else {
        setIsError(true);
        setMessage(res.error);
      }
    });
  }

  return (
    <div>
      <h2>Assigned Subjects</h2>
      <p style={{ fontSize: 13, color: "#6b5b4e", marginBottom: 16 }}>
        Select the subjects this SSS student actually offers. Only subjects
        offered by their class are shown.
      </p>

      <div className="subjects-grid">
        {subjects.map((s) => {
          const isSelected = selected.has(s.id);
          return (
            <label
              key={s.id}
              className={`subject-toggle ${isSelected ? "selected" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                toggle(s.id);
              }}
            >
              <span className="check">{isSelected ? "✓" : ""}</span>
              <span>{s.name}</span>
            </label>
          );
        })}
        {subjects.length === 0 && (
          <p style={{ color: "#8a7663" }}>No subjects offered by this class.</p>
        )}
      </div>

      <div className="sticky-bar">
        <button
          onClick={save}
          disabled={isPending}
          className="btn btn-primary"
        >
          {isPending ? "Saving…" : "Save changes"}
        </button>
        <span className={`msg ${isError ? "msg-error" : "msg-success"}`}>
          {message}
        </span>
      </div>
    </div>
  );
}