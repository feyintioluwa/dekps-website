"use client";

import { useEffect, useState } from "react";
import "../teacher.css";
import "./teacher-arrangement.css";

type Subject = { id: string; name: string };
type ClassCard = { id: string; name: string; isClassTeacher: boolean; studentCount: number; subjects: Subject[] };
type Me = { teacher: { name: string; email: string }; classes: ClassCard[] };
type Student = { id: string; login_id: string; name: string; display_order?: number | null };

export default function TeacherClassesPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<ClassCard | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [original, setOriginal] = useState<Student[]>([]);
  const [canArrange, setCanArrange] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/teacher/me", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 401 ? "Please sign in to the Teacher Portal." : "Could not load your classes.");
        return response.json() as Promise<Me>;
      })
      .then((data) => { if (!controller.signal.aborted) setMe(data); })
      .catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => controller.abort();
  }, []);

  async function openStudents(c: ClassCard) {
    setSelected(c);
    setSearch("");
    setStudents([]);
    setOriginal([]);
    setCanArrange(false);
    setArranging(false);
    setNotice("");
    setError("");
    setLoadingStudents(true);
    try {
      const response = await fetch(`/api/teacher/students?classId=${encodeURIComponent(c.id)}`, { cache: "no-store", credentials: "same-origin" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load students.");
      setStudents(data.students ?? []);
      setOriginal(data.students ?? []);
      setCanArrange(data.canArrange === true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load students.");
    } finally {
      setLoadingStudents(false);
    }
  }

  function moveStudent(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= students.length) return;
    setStudents((previous) => {
      const next = [...previous];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  async function saveOrder() {
    if (!selected || !canArrange || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/teacher/students", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: selected.id, studentIds: students.map((s) => s.id) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save arrangement.");
      setOriginal([...students]);
      setArranging(false);
      setNotice("Student arrangement saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save arrangement.");
    } finally {
      setSaving(false);
    }
  }

  const shown = students.filter((student) => {
    const query = search.trim().toLowerCase();
    return !query || student.name.toLowerCase().includes(query) || student.login_id.toLowerCase().includes(query);
  });
  const changed = students.some((s, i) => s.id !== original[i]?.id);

  return (
    <div className="tch">
      <header className="tch-header">
        <div className="tch-header-in">
          <div className="tch-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/kps-logo.png" alt="School logo" />
            <div><strong>DE KINGS PERFECTION PRIVATE SCHOOL</strong><small>TEACHER PORTAL</small></div>
          </div>
          {me && <div className="tch-me"><span><b>{me.teacher.name}</b><small>{me.teacher.email}</small></span></div>}
        </div>
      </header>
      <main className="tch-main">
        <a href="/teacher" className="tch-link tch-back" style={{ display: "inline-block", textDecoration: "none" }}>← Back to dashboard</a>
        <h1>My Classes</h1>
        <p className="tch-muted">Your assigned classes, subjects, and student lists.</p>
        {checking && <p className="tch-muted tch-center">Loading classes...</p>}
        {error && <p className="tch-error" role="alert">{error}</p>}
        {!checking && me && !selected && (me.classes.length === 0
          ? <div className="tch-card tch-empty"><h2>No classes yet</h2><p className="tch-muted">Please contact the school admin for class assignments.</p></div>
          : <div className="tch-grid">{me.classes.map((c) => (
              <article className="tch-card" key={c.id}>
                <div className="tch-class-top"><h2>{c.name}</h2>{c.isClassTeacher && <span className="tch-badge">Class teacher</span>}</div>
                <p className="tch-muted">{c.studentCount} student{c.studentCount === 1 ? "" : "s"}</p>
                <div className="tch-chips">{c.subjects.length ? c.subjects.map((subject) => <span className="tch-chip" key={subject.id}>{subject.name}</span>) : <span className="tch-muted">No subjects</span>}</div>
                <button className="tch-btn" type="button" onClick={() => void openStudents(c)}>View students</button>
              </article>
            ))}</div>
        )}
        {!checking && me && selected && (
          <section className="tch-card" style={{ marginTop: 18 }}>
            <button type="button" className="tch-link tch-back" disabled={saving} onClick={() => { setSelected(null); setError(""); setNotice(""); }}>← Back to my classes</button>
            <h1>{selected.name}</h1>
            <p className="tch-muted">{selected.studentCount} students{selected.isClassTeacher ? " · You are the class teacher" : ""}</p>
            {notice && <p role="status" style={{ color: "#16733b" }}>{notice}</p>}
            {!loadingStudents && canArrange && (
              <div className="tch-arrange-toolbar">
                {!arranging ? <button className="tch-btn" type="button" onClick={() => { setSearch(""); setArranging(true); setNotice(""); }}>Arrange students</button> : <>
                  <button className="tch-btn" type="button" disabled={saving || !changed} onClick={() => void saveOrder()}>{saving ? "Saving..." : "Save order"}</button>
                  <button type="button" className="tch-arrange-cancel" disabled={saving} onClick={() => { setStudents([...original]); setArranging(false); setNotice(""); }}>Cancel</button>
                </>}
              </div>
            )}
            {arranging && <p className="tch-arrange-hint"><span aria-hidden="true">↕</span> Use the arrow controls to adjust each student's position, then select Save order. Search is disabled while arranging.</p>}
            <input className="tch-search" type="search" placeholder="Search by name or Login ID" aria-label="Search students" value={search} disabled={arranging} onChange={(event) => setSearch(event.target.value)} />
            {loadingStudents ? <p className="tch-muted">Loading students...</p> : shown.length === 0 ? <p className="tch-muted">{students.length === 0 ? "No students in this class yet." : "No match."}</p> : arranging ? (
              <>
              <div className="tch-table-wrap"><table className="tch-arrange-table"><thead><tr><th>Position</th><th>Student</th><th>Login ID</th><th style={{ textAlign: "right" }}>Move</th></tr></thead><tbody>
                {students.map((student, index) => <tr key={student.id}>
                  <td><span className="tch-arrange-number">{index + 1}</span></td>
                  <td className="tch-arrange-name">{student.name}</td>
                  <td className="tch-arrange-login">{student.login_id}</td>
                  <td><div className="tch-arrange-controls">
                    <button className="tch-arrange-arrow" type="button" title="Move up" aria-label={`Move ${student.name} up`} disabled={saving || index === 0} onClick={() => moveStudent(index, -1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6" /></svg></button>
                    <button className="tch-arrange-arrow" type="button" title="Move down" aria-label={`Move ${student.name} down`} disabled={saving || index === students.length - 1} onClick={() => moveStudent(index, 1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 10 6 6 6-6" /></svg></button>
                  </div></td>
                </tr>)}
              </tbody></table></div>
              <div className="tch-arrange-mobile-list" aria-label="Arrange student order">
                {students.map((student, index) => (
                  <div className="tch-arrange-mobile-card" key={student.id}>
                    <span className="tch-arrange-number" aria-label={`Position ${index + 1}`}>{index + 1}</span>
                    <div className="tch-arrange-mobile-info">
                      <strong>{student.name}</strong>
                      <span>{student.login_id}</span>
                    </div>
                    <div className="tch-arrange-controls">
                      <button className="tch-arrange-arrow" type="button" title="Move up" aria-label={`Move ${student.name} up`} disabled={saving || index === 0} onClick={() => moveStudent(index, -1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6" /></svg></button>
                      <button className="tch-arrange-arrow" type="button" title="Move down" aria-label={`Move ${student.name} down`} disabled={saving || index === students.length - 1} onClick={() => moveStudent(index, 1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 10 6 6 6-6" /></svg></button>
                    </div>
                  </div>
                ))}
              </div>
              </>
            ) : (
              <div className="tch-table-wrap"><table className="tch-table"><thead><tr><th>#</th><th>Name</th><th>Login ID</th></tr></thead><tbody>
                {shown.map((student) => <tr key={student.id}><td>{students.indexOf(student) + 1}</td><td>{student.name}</td><td>{student.login_id}</td></tr>)}
              </tbody></table></div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
