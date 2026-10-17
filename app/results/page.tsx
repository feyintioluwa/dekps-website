"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import "./results.css";

type Subject = {
  subject: string;
  ca: number | null;
  exam: number | null;
  total: number | null;
};

type Student = {
  login_id: string;
  name: string;
  class: string;
  term: string;
  session: string;
  subject_count: number | null;
  total: number | null;
  average: number | null;
  grade: string | null;
  school_remark: string | null;
  teacher_remark: string | null;
  subjects: Subject[];
};

function getGrade(score: number | null): string {
  if (score === null || !Number.isFinite(score)) return "-";
  if (score >= 70) return "A";
  if (score >= 60) return "B";
  if (score >= 50) return "C";
  if (score >= 45) return "D";
  if (score >= 40) return "E";
  return "F";
}

function show(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : String(value);
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="detail">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value ?? ""}</span>
    </div>
  );
}

export default function ResultsPage() {
  const [loginId, setLoginId] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [student, setStudent] = useState<Student | null>(null);
  const resultRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!student) return;
    const timer = setTimeout(() => {
      resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => clearTimeout(timer);
  }, [student]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const id = loginId.trim();
    const code = pin.trim();

    if (!id) {
      setMessage("Please enter your Student Login ID.");
      return;
    }
    if (!code) {
      setMessage("Please enter your Result PIN.");
      return;
    }
    if (!/^\d{4}$/.test(code)) {
      setMessage("Your PIN must contain exactly 4 digits.");
      return;
    }

    setLoading(true);
    setStudent(null);

    try {
      const response = await fetch("/api/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId: id, pin: code }),
      });
      const data = await response.json();

      if (data.status === "ok") {
        if (data.student.total === null) {
          setMessage(
            "Your result is not available yet. Please contact the school."
          );
        } else {
          setStudent(data.student);
        }
      } else if (data.status === "locked") {
        setMessage(
          "Too many wrong attempts. Please wait 15 minutes and try again."
        );
      } else if (data.status === "invalid") {
        setMessage(
          "Invalid Student Login ID or PIN. Please check your details and try again."
        );
      } else {
        setMessage("Something went wrong. Please try again.");
      }
    } catch {
      setMessage(
        "Could not reach the server. Check your internet connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  function checkAnother() {
    setStudent(null);
    setMessage("");
    setLoginId("");
    setPin("");
    setShowPin(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <header className="top-header">
        <div className="header-inner">
          <div className="school-brand">
            <img
              src="/assets/kps-logo.png"
              alt="De Kings Perfection Private School Logo"
              className="school-logo"
            />
            <div className="school-name">
              <h1>DE KINGS PERFECTION PRIVATE SCHOOL</h1>
            </div>
          </div>

          <div className="portal-title">
            <span>STUDENT</span>
            <strong>RESULT PORTAL</strong>
          </div>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-content">
            <div className="hero-badge">2026 / 2027 ACADEMIC SESSION</div>
            <h2>Check Your Academic Result</h2>
            <p>
              Enter your Student Login ID and PIN to securely access your
              third term result.
            </p>
          </div>
        </section>

        <section className="login-section" id="loginSection">
          <div className="login-card">
            <div className="login-heading">
              <div className="login-icon">🔐</div>
              <div>
                <h2>Result Verification</h2>
                <p>Enter the details provided by the school.</p>
              </div>
            </div>

            <form id="resultForm" onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="loginId">Student Login ID</label>
                <input
                  type="text"
                  id="loginId"
                  name="loginId"
                  placeholder="Enter your Login ID"
                  autoComplete="username"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="pin">Result PIN</label>
                <div className="pin-wrapper">
                  <input
                    type={showPin ? "text" : "password"}
                    id="pin"
                    name="pin"
                    placeholder="Enter your 4-digit PIN"
                    inputMode="numeric"
                    maxLength={4}
                    autoComplete="current-password"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    id="togglePin"
                    className="pin-toggle"
                    aria-label="Show or hide PIN"
                    onClick={() => setShowPin((s) => !s)}
                  >
                    {showPin ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div
                id="loginMessage"
                className="login-message"
                role="alert"
                style={{ color: "#9e1824" }}
              >
                {message}
              </div>

              <button
                type="submit"
                id="checkResultButton"
                className={`check-button${loading ? " loading" : ""}`}
                disabled={loading}
              >
                <span id="buttonText">
                  {loading ? "Checking..." : "Check Result"}
                </span>
                <span id="buttonSpinner" className="spinner"></span>
              </button>
            </form>

            <div className="login-note">
              <span>ⓘ</span>
              <p>
                Your Login ID and PIN are required to view your result. Keep
                them confidential.
              </p>
            </div>
          </div>
        </section>

        <section
          id="resultSection"
          ref={resultRef}
          className={`result-section${student ? " show" : ""}`}
        >
          {student && (
            <>
              <div className="result-sheet">
                <div className="result-header">
                  <img
                    src="/assets/kps-logo.png"
                    alt="School Logo"
                    className="result-logo"
                  />
                  <h1>De Kings Perfection Private School</h1>
                  <h2>Academic and Moral Excellence</h2>
                  <p>13, Abosule Street, Agbado Crossing, Ogun State</p>
                  <div className="result-heading">STUDENT ACADEMIC RESULT</div>
                  <img
                    src="/assets/stamp.webp"
                    alt="Verified Result"
                    className="verified-stamp"
                  />
                </div>

                <div className="student-details">
                  <Detail label="Student Name" value={student.name} />
                  <Detail label="Login ID" value={student.login_id} />
                  <Detail label="Class" value={student.class} />
                  <Detail label="Session" value={student.session} />
                  <Detail label="Term" value={student.term} />
                  <Detail label="Subjects" value={student.subjects.length} />
                  <Detail label="Result Status" value="Verified" />
                  <Detail label="Grade" value={student.grade} />
                </div>

                <div className="summary-grid">
                  <div className="summary-card">
                    <span>Total Score</span>
                    <strong>{show(student.total)}</strong>
                  </div>
                  <div className="summary-card">
                    <span>Average</span>
                    <strong>
                      {student.average !== null
                        ? student.average.toFixed(2)
                        : "0.00"}
                      %
                    </strong>
                  </div>
                  <div className="summary-card grade-card">
                    <span>Overall Grade</span>
                    <strong>{student.grade ?? ""}</strong>
                  </div>
                </div>

                <div className="table-container">
                  <table className="result-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Subject</th>
                        <th>CA</th>
                        <th>Exam</th>
                        <th>Total</th>
                        <th>Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {student.subjects.map((s, index) => {
                        const noScores = s.ca === null && s.exam === null;
                        return (
                          <tr key={`${s.subject}-${index}`}>
                            <td>{index + 1}</td>
                            <td>{s.subject}</td>
                            <td>{show(s.ca)}</td>
                            <td>{show(s.exam)}</td>
                            <td className="total-cell">
                              {noScores ? "-" : show(s.total)}
                            </td>
                            <td className="grade-cell">
                              {noScores ? "-" : getGrade(s.total)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="remarks-grid">
                  <div className="remark-box">
                    <div className="remark-title">School Remark</div>
                    <p>{student.school_remark ?? ""}</p>
                  </div>
                  <div className="remark-box">
                    <div className="remark-title">Teacher&apos;s Remark</div>
                    <p>{student.teacher_remark ?? ""}</p>
                  </div>
                </div>

                <div className="result-footer">
                  <div className="result-footer-note">
                    <strong>Official Result</strong>
                    <br />
                    This result is generated from the De Kings Perfection
                    Private School academic records for the {student.term} of
                    the {student.session} academic session.
                  </div>
                  <div className="signature-area">
                    <div className="signature-line"></div>
                    <span>Authorized School Official</span>
                  </div>
                </div>
              </div>

              <div className="result-actions">
                <button
                  type="button"
                  className="result-action-button print-button"
                  onClick={() => window.print()}
                >
                  Print Result
                </button>
                <button
                  type="button"
                  className="result-action-button new-result-button"
                  onClick={checkAnother}
                >
                  Check Another Result
                </button>
              </div>
            </>
          )}
        </section>
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <div>
            <strong>De Kings Perfection Private School</strong>
            <p>Academic and Moral Excellence</p>
          </div>
          <div className="footer-session">2026/2027 Academic Session</div>
        </div>
      </footer>
    </>
  );
}
