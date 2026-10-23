"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "../cbt.css";
import "../../admin/login/login.css";

type Question = {
  id: string;
  subject: string;
  text: string;
  choices: { id: string; text: string }[];
  answer: string;
  marks: number;
};
type Exam = {
  id: string;
  title: string;
  session: string;
  term: string;
  durationMinutes: number;
  published: boolean;
  questions: Question[];
};
type Student = { id: string; name: string; className: string; token: string };
type Submission = {
  id: string;
  examId: string;
  examTitle: string;
  studentId: string;
  studentName: string;
  className: string;
  submittedAt: string;
  score: number;
  totalMarks: number;
  percentage: number;
  grade: string;
};
type DB = { exams: Exam[]; students: Student[]; submissions: Submission[] };

const EMPTY_EXAM: Exam = {
  id: "",
  title: "",
  session: "2026/2027",
  term: "First Term",
  durationMinutes: 30,
  published: false,
  questions: [],
};

export default function CbtAdminPage() {
  const router = useRouter();
  const [db, setDb] = useState<DB | null>(null);
  const [tab, setTab] = useState<"exams" | "students" | "results">("exams");
  const [editing, setEditing] = useState<Exam | null>(null);
  const [newStudent, setNewStudent] = useState({ id: "", name: "", className: "", token: "" });
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/cbt/admin", { credentials: "same-origin" });
    if (res.status === 401) {
      router.push("/cbt/admin/login");
      return;
    }
    const data = await res.json();
    if (data.status === "ok") setDb(data.db);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function mutate(body: Record<string, unknown>) {
    const res = await fetch("/api/cbt/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
    if (res.status === 401) {
      router.push("/cbt/admin/login");
      return;
    }
    const data = await res.json();
    if (data.status === "ok") setDb(data.db);
    else setError("Action failed. Please try again.");
  }

  async function logout() {
    await fetch("/api/cbt/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    router.push("/cbt/admin/login");
  }

  function saveExam() {
    if (!editing) return;
    const exam = { ...editing };
    if (!exam.id) exam.id = `exam-${Date.now().toString(36)}`;
    exam.questions = exam.questions.map((q, i) => ({
      ...q,
      id: q.id || `q-${exam.id}-${i + 1}`,
      choices: q.choices.map((c, ci) => ({ ...c, id: c.id || String.fromCharCode(97 + ci) })),
    }));
    void mutate({ action: "saveExam", exam }).then(() => setEditing(null));
  }

  function addQuestion() {
    if (!editing) return;
    setEditing({
      ...editing,
      questions: [
        ...editing.questions,
        {
          id: "",
          subject: "",
          text: "",
          choices: [
            { id: "a", text: "" },
            { id: "b", text: "" },
            { id: "c", text: "" },
            { id: "d", text: "" },
          ],
          answer: "a",
          marks: 1,
        },
      ],
    });
  }

  function exportCsv() {
    if (!db) return;
    const rows = [
      ["Student ID", "Name", "Class", "Exam", "Score", "Total", "Percentage", "Grade", "Submitted At"],
      ...db.submissions.map((s) => [
        s.studentId, s.studentName, s.className, s.examTitle,
        String(s.score), String(s.totalMarks), String(s.percentage), s.grade, s.submittedAt,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "cbt-results.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!db) {
    return (
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#687385", fontWeight: 700 }}>Loading admin panel…</p>
      </main>
    );
  }

  const published = db.exams.filter((e) => e.published).length;

  return (
    <main className="staff-login">
      <div className="staff-card" style={{ width: "min(1100px, 96%)" }}>
        <div className="staff-brand">
          <img src="/assets/kps-logo.png" alt="School Logo" style={{ width: 60, height: 60, objectFit: "contain" }} />
          <h1>CBT ADMIN DASHBOARD</h1>
          <span>De Kings Perfection Private School</span>
        </div>

        <div className="admin-tabs">
          <button className={`admin-tab${tab === "exams" ? " active" : ""}`} onClick={() => setTab("exams")}>
            Exams &amp; Questions
          </button>
          <button className={`admin-tab${tab === "students" ? " active" : ""}`} onClick={() => setTab("students")}>
            Students &amp; Tokens
          </button>
          <button className={`admin-tab${tab === "results" ? " active" : ""}`} onClick={() => setTab("results")}>
            Results ({db.submissions.length})
          </button>
          <button className="admin-tab" onClick={exportCsv}>⬇ Export CSV</button>
          <button className="admin-tab" onClick={logout}>Sign Out</button>
        </div>

        <div className="admin-stat-grid">
          <div className="admin-stat"><span>Exams</span><strong>{db.exams.length}</strong></div>
          <div className="admin-stat"><span>Published</span><strong>{published}</strong></div>
          <div className="admin-stat"><span>Students</span><strong>{db.students.length}</strong></div>
          <div className="admin-stat"><span>Submissions</span><strong>{db.submissions.length}</strong></div>
        </div>

        {error && <p style={{ color: "#9e1824", fontWeight: 700 }}>{error}</p>}

        {tab === "exams" && !editing && (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Title</th><th>Session</th><th>Term</th><th className="center">Duration</th>
                  <th className="center">Questions</th><th className="center">Status</th><th className="center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {db.exams.map((e) => (
                  <tr key={e.id}>
                    <td>{e.title}</td>
                    <td>{e.session}</td>
                    <td>{e.term}</td>
                    <td className="center">{e.durationMinutes} min</td>
                    <td className="center">{e.questions.length}</td>
                    <td className="center">
                      <span className={`chip ${e.published ? "green" : "grey"}`}>
                        {e.published ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="center">
                      <div className="admin-actions" style={{ justifyContent: "center" }}>
                        <button className="mini-btn" onClick={() => setEditing(structuredClone(e))}>Edit</button>
                        <button
                          className="mini-btn"
                          onClick={() => void mutate({ action: "saveExam", exam: { ...e, published: !e.published } })}
                        >
                          {e.published ? "Unpublish" : "Publish"}
                        </button>
                        <button
                          className="mini-btn danger"
                          onClick={() => confirm(`Delete exam "${e.title}"?`) && void mutate({ action: "deleteExam", id: e.id })}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {db.exams.length === 0 && (
                  <tr><td colSpan={7} className="center">No exams yet. Create one below.</td></tr>
                )}
              </tbody>
            </table>
            <div style={{ marginTop: 16 }}>
              <button className="cbt-button small" onClick={() => setEditing(structuredClone(EMPTY_EXAM))}>
                + New Exam
              </button>
            </div>
          </div>
        )}

        {tab === "exams" && editing && (
          <div>
            <h3 style={{ color: "#071f3d", marginBottom: 14 }}>
              {editing.id ? `Edit Exam: ${editing.title || "Untitled"}` : "Create New Exam"}
            </h3>
            <div className="two-col">
              <div className="form-group">
                <label>Exam Title</label>
                <input
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                  placeholder="e.g. First Term General Paper"
                />
              </div>
              <div className="form-group">
                <label>Session</label>
                <input
                  value={editing.session}
                  onChange={(e) => setEditing({ ...editing, session: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Term</label>
                <select
                  value={editing.term}
                  onChange={(e) => setEditing({ ...editing, term: e.target.value })}
                >
                  <option>First Term</option>
                  <option>Second Term</option>
                  <option>Third Term</option>
                </select>
              </div>
              <div className="form-group">
                <label>Duration (minutes)</label>
                <input
                  type="number"
                  min={1}
                  value={editing.durationMinutes}
                  onChange={(e) => setEditing({ ...editing, durationMinutes: Number(e.target.value) })}
                />
              </div>
            </div>

            <h4 style={{ color: "#071f3d", margin: "10px 0" }}>
              Questions ({editing.questions.length})
            </h4>
            {editing.questions.map((q, qi) => (
              <div
                key={qi}
                style={{
                  border: "1px solid #dfe4ea",
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 12,
                  background: "#f9fbfd",
                }}
              >
                <div className="two-col">
                  <div className="form-group">
                    <label>Subject</label>
                    <input
                      value={q.subject}
                      onChange={(e) => {
                        const qs = [...editing.questions];
                        qs[qi] = { ...q, subject: e.target.value };
                        setEditing({ ...editing, questions: qs });
                      }}
                      placeholder="e.g. Mathematics"
                    />
                  </div>
                  <div className="form-group">
                    <label>Marks</label>
                    <input
                      type="number"
                      min={1}
                      value={q.marks}
                      onChange={(e) => {
                        const qs = [...editing.questions];
                        qs[qi] = { ...q, marks: Number(e.target.value) };
                        setEditing({ ...editing, questions: qs });
                      }}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Question Text</label>
                  <input
                    value={q.text}
                    onChange={(e) => {
                      const qs = [...editing.questions];
                      qs[qi] = { ...q, text: e.target.value };
                      setEditing({ ...editing, questions: qs });
                    }}
                    placeholder="Enter the question"
                  />
                </div>
                {q.choices.map((c, ci) => (
                  <div key={ci} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                    <strong style={{ width: 18 }}>{String.fromCharCode(65 + ci)}.</strong>
                    <input
                      style={{ flex: 1 }}
                      value={c.text}
                      onChange={(e) => {
                        const qs = [...editing.questions];
                        const choices = [...q.choices];
                        choices[ci] = { ...c, text: e.target.value };
                        qs[qi] = { ...q, choices };
                        setEditing({ ...editing, questions: qs });
                      }}
                      placeholder={`Option ${String.fromCharCode(65 + ci)}`}
                    />
                    <label style={{ fontSize: "0.78rem", fontWeight: 800, display: "flex", gap: 5, alignItems: "center" }}>
                      <input
                        type="radio"
                        name={`correct-${qi}`}
                        checked={q.answer === c.id}
                        onChange={() => {
                          const qs = [...editing.questions];
                          qs[qi] = { ...q, answer: c.id };
                          setEditing({ ...editing, questions: qs });
                        }}
                      />
                      Correct
                    </label>
                  </div>
                ))}
                <button
                  className="mini-btn danger"
                  onClick={() => {
                    const qs = editing.questions.filter((_, i) => i !== qi);
                    setEditing({ ...editing, questions: qs });
                  }}
                >
                  Remove Question
                </button>
              </div>
            ))}

            <div className="admin-actions">
              <button className="cbt-button secondary small" onClick={addQuestion}>+ Add Question</button>
              <button className="cbt-button small" onClick={saveExam}>Save Exam</button>
              <button className="cbt-button secondary small" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        )}

        {tab === "students" && (
          <div>
            <div className="two-col" style={{ marginBottom: 20 }}>
              <div className="form-group">
                <label>Student Name</label>
                <input
                  value={newStudent.name}
                  onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
                  placeholder="Full name"
                />
              </div>
              <div className="form-group">
                <label>Student ID</label>
                <input
                  value={newStudent.id}
                  onChange={(e) => setNewStudent({ ...newStudent, id: e.target.value })}
                  placeholder="e.g. DKPS/004"
                />
              </div>
              <div className="form-group">
                <label>Class</label>
                <input
                  value={newStudent.className}
                  onChange={(e) => setNewStudent({ ...newStudent, className: e.target.value })}
                  placeholder="e.g. Primary 5"
                />
              </div>
              <div className="form-group">
                <label>CBT Token (leave blank to auto-generate)</label>
                <input
                  value={newStudent.token}
                  onChange={(e) => setNewStudent({ ...newStudent, token: e.target.value })}
                  placeholder="e.g. CBT-1004"
                />
              </div>
            </div>
            <button
              className="cbt-button small"
              onClick={() => {
                if (!newStudent.name || !newStudent.id) {
                  setError("Student name and ID are required.");
                  return;
                }
                void mutate({ action: "addStudent", student: newStudent });
                setNewStudent({ id: "", name: "", className: "", token: "" });
              }}
            >
              + Add Student
            </button>

            <div className="table-scroll" style={{ marginTop: 20 }}>
              <table className="admin-table">
                <thead>
                  <tr><th>Student ID</th><th>Name</th><th>Class</th><th>CBT Token</th><th className="center">Actions</th></tr>
                </thead>
                <tbody>
                  {db.students.map((s) => (
                    <tr key={s.id}>
                      <td>{s.id}</td>
                      <td>{s.name}</td>
                      <td>{s.className}</td>
                      <td><span className="chip grey">{s.token}</span></td>
                      <td className="center">
                        <button
                          className="mini-btn danger"
                          onClick={() => confirm(`Remove ${s.name}?`) && void mutate({ action: "deleteStudent", id: s.id })}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "results" && (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Student</th><th>Class</th><th>Exam</th>
                  <th className="center">Score</th><th className="center">%</th>
                  <th className="center">Grade</th><th>Submitted</th><th className="center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {db.submissions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.studentName} <span style={{ color: "#8792a2" }}>({s.studentId})</span></td>
                    <td>{s.className}</td>
                    <td>{s.examTitle}</td>
                    <td className="center">{s.score}/{s.totalMarks}</td>
                    <td className="center">{s.percentage}%</td>
                    <td className="center"><span className="chip green">{s.grade}</span></td>
                    <td>{new Date(s.submittedAt).toLocaleString()}</td>
                    <td className="center">
                      <button
                        className="mini-btn danger"
                        onClick={() => confirm("Delete this submission? The student can retake the exam.") && void mutate({ action: "deleteSubmission", id: s.id })}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {db.submissions.length === 0 && (
                  <tr><td colSpan={8} className="center">No submissions yet.</td></tr>
                )}
              </tbody>
            </table>
            <p style={{ color: "#687385", fontSize: "0.85rem", marginTop: 12 }}>
              Tip: CBT scores appear here instantly. Use the Result Portal section of the site to release
              formal term results to students.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
