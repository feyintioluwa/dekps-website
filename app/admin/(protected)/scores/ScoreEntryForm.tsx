"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ClassRow = { id: string; name: string };
type SubjectRow = { id: string; name: string };
type TermRow = { id: string; term: string; session: string };

type Student = {
  id: string;
  name: string;
  login_id: string;
};

export default function ScoreEntryForm({
  classes,
  subjects,
  terms,
}: {
  classes: ClassRow[];
  subjects: SubjectRow[];
  terms: TermRow[];
}) {
  const supabase = createClient();
  
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [termId, setTermId] = useState("");
  
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // This function loads students when you click "Load Students"
  async function loadStudents() {
    if (!classId || !subjectId || !termId) {
      setMessage("Please select Class, Subject, and Term first.");
      return;
    }

    setLoading(true);
    setMessage("");

    // 1. Fetch all students in this class
    const { data: studentData, error: sErr } = await supabase
      .from("students")
      .select("id, name, login_id")
      .eq("class_id", classId)
      .eq("is_active", true)
      .order("name");

    if (sErr) {
      setMessage("Error loading students.");
      setLoading(false);
      return;
    }

    setStudents(studentData || []);
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage("Saving scores... (Function coming next)");
  }

  return (
    <div>
      {/* THE DROPDOWNS */}
      <div className="action-row" style={{ flexDirection: "column", alignItems: "stretch", padding: "24px" }}>
        <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "16px" }}>
          
          <div style={{ flex: 1, minWidth: "200px" }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Class</label>
            <select 
              value={classId} 
              onChange={(e) => setClassId(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
            >
              <option value="">Select Class</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: "200px" }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Subject</label>
            <select 
              value={subjectId} 
              onChange={(e) => setSubjectId(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
            >
              <option value="">Select Subject</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: "200px" }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Term</label>
            <select 
              value={termId} 
              onChange={(e) => setTermId(e.target.value)}
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #e5e7eb" }}
            >
              <option value="">Select Term</option>
              {terms.map(t => <option key={t.id} value={t.id}>{t.session} - {t.term}</option>)}
            </select>
          </div>
        </div>

        <button 
          onClick={loadStudents} 
          className="btn-switch" 
          style={{ alignSelf: "flex-start", padding: "10px 24px", borderRadius: "8px" }}
          disabled={loading}
        >
          {loading ? "Loading..." : "Load Students"}
        </button>
      </div>

      {message && <p style={{ color: "#9e1824", marginTop: 12 }}>{message}</p>}

      {/* THE SCORE TABLE (Only shows if students are loaded) */}
      {students.length > 0 && (
        <form onSubmit={handleSave} style={{ marginTop: "32px" }}>
          <div className="section-title">SCORES FOR {students.length} STUDENTS</div>
          
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 14 }}>
              <thead style={{ background: "#f8f9fb", borderBottom: "1px solid #e5e7eb" }}>
                <tr>
                  <th style={{ padding: "12px 16px", fontWeight: 600 }}>Student</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, width: "120px" }}>CA (40)</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, width: "120px" }}>Exam (60)</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, width: "80px" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <strong>{s.name}</strong>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>{s.login_id}</div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <input type="number" min="0" max="40" style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <input type="number" min="0" max="60" style={{ width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
                    </td>
                    <td style={{ padding: "12px 16px", fontWeight: 600 }}>
                      -
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="submit" className="btn-switch" style={{ marginTop: 24, padding: "12px 32px", borderRadius: "8px" }}>
            Save All Scores
          </button>
        </form>
      )}
    </div>
  );
}