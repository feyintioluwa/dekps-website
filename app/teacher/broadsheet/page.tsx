"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import Image from "next/image";
import "../teacher.css";
import "./broadsheet.css";
type Option = {
  id: string;
  name: string;
};
type Student = {
  id: string;
  login_id: string;
  name: string;
};
type Score = {
  student_id: string;
  subject_id: string;
  kind: string;
  score: number;
};
type ClassData = {
  term?: Term;
  students: Student[];
  subjects: Option[];
  studentSubjects: {
    student_id: string;
    subject_id: string;
  }[];
  scores: Score[];
};
type Term = {
  id: string;
  label: string;
  locked: boolean;
} | null;
type Kind = "ca" | "exam";
type Entry = {
  ca: string;
  exam: string;
};
type SaveScore = {
  subjectId: string;
  kind: Kind;
  score: number;
  expected: number | null;
};
type SaveRow = {
  loginId: string;
  scores: SaveScore[];
};
const API = "/api/teacher/scores";
const EMPTY: Entry = { ca: "", exam: "" };
function buildEntries(
  data: ClassData,
  subjectId: string
): Record<string, Entry> {
  const scores = new Map<string, number>();
  for (const score of data.scores) {
    const kind =
      score.kind === "test1" ? "ca" : score.kind;
    scores.set(
      `${score.student_id}|${score.subject_id}|${kind}`,
      score.score
    );
  }
  const result: Record<string, Entry> = {};
  for (const student of data.students) {
    const getScore = (kind: Kind): string => {
      const score = scores.get(
        `${student.id}|${subjectId}|${kind}`
      );
      return score === undefined ? "" : String(score);
    };
    result[student.id] = {
      ca: getScore("ca"),
      exam: getScore("exam"),
    };
  }
  return result;
}
function errorMessage(
  error: unknown,
  fallback: string
): string {
  return error instanceof Error ? error.message : fallback;
}
export default function TeacherBroadsheet() {
  const [classes, setClasses] = useState<Option[]>([]);
  const [term, setTerm] = useState<Term>(null);
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [data, setData] = useState<ClassData | null>(null);
  const [values, setValues] = useState<
    Record<string, Entry>
  >({});
  const [original, setOriginal] = useState<
    Record<string, Entry>
  >({});
  const [search, setSearch] = useState("");
  const [missingOnly, setMissingOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const requestId = useRef(0);
  const loadClass = useCallback(async (id: string) => {
    const request = ++requestId.current;
    setLoading(true);
    setMessage("");
    setConflict(false);
    try {
      const response = await fetch(
        `${API}?classId=${encodeURIComponent(id)}`,
        { cache: "no-store" }
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(
          body.error || "Could not load this class."
        );
      }
      if (request !== requestId.current) return;
      setData(body as ClassData);
      setTerm(body.term ?? null);
      setSubjectId("");
      setValues({});
      setOriginal({});
    } catch (error) {
      if (request !== requestId.current) return;
      setData(null);
      setMessage(
        errorMessage(error, "Could not load the class.")
      );
    } finally {
      if (request === requestId.current) {
        setLoading(false);
      }
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const response = await fetch(API, {
          cache: "no-store",
        });
        const body = await response.json();
        if (!response.ok) {
          throw new Error(
            body.error ||
              "Please sign in to your teacher account."
          );
        }
        if (cancelled) return;
        setClasses(body.classes ?? []);
        setTerm(body.term ?? null);
      } catch (error) {
        if (!cancelled) {
          setMessage(
            errorMessage(
              error,
              "Unable to load teacher classes."
            )
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void initialize();
    return () => {
      cancelled = true;
      requestId.current++;
    };
  }, []);
  const eligible = useMemo(() => {
    if (!data || !subjectId) return [];
    const subjectsByStudent = new Map<
      string,
      Set<string>
    >();
    for (const item of data.studentSubjects) {
      if (!subjectsByStudent.has(item.student_id)) {
        subjectsByStudent.set(
          item.student_id,
          new Set()
        );
      }
      subjectsByStudent
        .get(item.student_id)!
        .add(item.subject_id);
    }
    return data.students.filter((student) => {
      const subjects = subjectsByStudent.get(student.id);
      return (
        !subjects ||
        subjects.size === 0 ||
        subjects.has(subjectId)
      );
    });
  }, [data, subjectId]);
  function chooseSubject(id: string) {
    setSubjectId(id);
    setMessage("");
    setConflict(false);
    if (!data || !id) {
      setValues({});
      setOriginal({});
      return;
    }
    const next = buildEntries(data, id);
    setValues(next);
    setOriginal(next);
  }
  const dirty = useMemo(
    () =>
      eligible.some((student) => {
        const current = values[student.id] ?? EMPTY;
        const previous = original[student.id] ?? EMPTY;
        return (
          current.ca !== previous.ca ||
          current.exam !== previous.exam
        );
      }),
    [eligible, values, original]
  );
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return eligible.filter((student) => {
      if (
        query &&
        !`${student.name} ${student.login_id}`
          .toLowerCase()
          .includes(query)
      ) {
        return false;
      }
      const entry = values[student.id] ?? EMPTY;
      if (
        missingOnly &&
        entry.ca !== "" &&
        entry.exam !== ""
      ) {
        return false;
      }
      return true;
    });
  }, [eligible, values, search, missingOnly]);
  function edit(
    studentId: string,
    kind: Kind,
    value: string
  ) {
    if (value !== "" && !/^\d{0,2}$/.test(value)) {
      return;
    }
    setValues((previous) => ({
      ...previous,
      [studentId]: {
        ...(previous[studentId] ?? EMPTY),
        [kind]: value,
      },
    }));
  }
  async function save() {
    if (
      !data ||
      !subjectId ||
      !classId ||
      !term ||
      term.locked ||
      !dirty ||
      saving ||
      conflict
    ) {
      return;
    }
    const rows: SaveRow[] = [];
    for (const student of eligible) {
      const current = values[student.id] ?? EMPTY;
      const previous = original[student.id] ?? EMPTY;
      const scores: SaveScore[] = [];
      for (const kind of ["ca", "exam"] as const) {
        if (current[kind] === previous[kind]) {
          continue;
        }
        if (current[kind] === "") {
          setMessage(
            "Clearing a saved score is not supported. " +
              "Restore the original value before saving."
          );
          return;
        }
        const value = Number(current[kind]);
        const limit = kind === "ca" ? 40 : 60;
        if (
          !Number.isInteger(value) ||
          value < 0 ||
          value > limit
        ) {
          setMessage(
            `${student.name}: ${kind.toUpperCase()} ` +
              `must be between 0 and ${limit}.`
          );
          return;
        }
        const expected =
          previous[kind] === ""
            ? null
            : Number(previous[kind]);
        scores.push({
          subjectId,
          kind,
          score: value,
          expected,
        });
      }
      if (scores.length) {
        rows.push({
          loginId: student.login_id,
          scores,
        });
      }
    }
    if (!rows.length) return;
    const entryCount = rows.reduce(
      (total, row) => total + row.scores.length,
      0
    );
    if (entryCount > 400) {
      setMessage(
        "This save contains more than 400 changed marks. " +
          "Save a smaller selection of changes."
      );
      return;
    }
    setSaving(true);
    setMessage("Saving scores…");
    try {
      const response = await fetch(API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "save-protected",
          classId,
          rows,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (
          response.status === 409 ||
          result.code === "SCORE_CONFLICT"
        ) {
          setConflict(true);
          setMessage(
            "Score conflict detected. Another save changed " +
              "one or more marks. Nothing from this save was " +
              "applied. Your edits are still visible. " +
              "Review them, then refresh the broadsheet."
          );
          return;
        }
        throw new Error(
          result.error || "Could not save scores."
        );
      }
      const freshResponse = await fetch(
        `${API}?classId=${encodeURIComponent(classId)}`,
        { cache: "no-store" }
      );
      const fresh = await freshResponse.json();
      if (!freshResponse.ok) {
        setConflict(true);
        setMessage(
          "The save was accepted, but the latest scores " +
            "could not be reloaded. Do not save again yet. " +
            "Refresh the broadsheet to verify the marks."
        );
        return;
      }
      const freshData = fresh as ClassData;
      const next = buildEntries(freshData, subjectId);
      setData(freshData);
      setTerm(freshData.term ?? null);
      setValues(next);
      setOriginal(next);
      setConflict(false);
      setMessage(
        `${result.saved ?? 0} score entries saved. ` +
          "Results have not been published."
      );
    } catch (error) {
      setMessage(
        errorMessage(
          error,
          "Saving failed. Please try again."
        )
      );
    } finally {
      setSaving(false);
    }
  }
  async function refreshScores() {
    if (!classId || !subjectId || refreshing || saving) {
      return;
    }
    if (
      dirty &&
      !window.confirm(
        "Refreshing will discard your unsaved edits. " +
          "Continue?"
      )
    ) {
      return;
    }
    setRefreshing(true);
    try {
      const response = await fetch(
        `${API}?classId=${encodeURIComponent(classId)}`,
        { cache: "no-store" }
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(
          body.error || "Could not refresh scores."
        );
      }
      const fresh = body as ClassData;
      const next = buildEntries(fresh, subjectId);
      setData(fresh);
      setTerm(fresh.term ?? null);
      setValues(next);
      setOriginal(next);
      setConflict(false);
      setMessage(
        "Broadsheet refreshed with the latest saved marks."
      );
    } catch (error) {
      setMessage(
        errorMessage(error, "Could not refresh scores.")
      );
    } finally {
      setRefreshing(false);
    }
  }
  const complete = eligible.filter((student) => {
    const entry = values[student.id] ?? EMPTY;
    return entry.ca !== "" && entry.exam !== "";
  }).length;
  const caEntered = eligible.filter(
    (student) => (values[student.id] ?? EMPTY).ca !== ""
  ).length;
  const examEntered = eligible.filter(
    (student) => (values[student.id] ?? EMPTY).exam !== ""
  ).length;
  const progress = eligible.length
    ? Math.round((complete / eligible.length) * 100)
    : 0;
  const chosenClass = classes.find(
    (item) => item.id === classId
  )?.name;
  const chosenSubject = data?.subjects.find(
    (item) => item.id === subjectId
  )?.name;
  const readOnly = !term || term.locked;
  return (
    <main className="tch bs">
      <header className="bs-header">
        <div className="bs-container bs-header-inner">
          <div className="bs-brand">
            <Image
              src="/assets/kps-logo.png"
              alt="De Kings Perfection Private School logo"
              width={48}
              height={48}
              className="bs-school-logo"
              priority
            />
            <div>
              <strong>DE KINGS PERFECTION</strong>
              <small>TEACHER PORTAL</small>
            </div>
          </div>
          <Link
            className="bs-header-link"
            href="/teacher"
          >
            ← Back to dashboard
          </Link>
        </div>
      </header>
      <div className="bs-container bs-body">
        <div className="bs-intro">
          <div>
            <div className="bs-eyebrow">
              ACADEMICS / ASSESSMENT
            </div>
            <h1>Teacher Broadsheet</h1>
            <p>
              Manage continuous assessment and
              examination scores for your assigned classes.
            </p>
          </div>
          <Link
            className="bs-excel-link"
            href="/teacher/scores"
          >
            ↗ Excel score management
          </Link>
        </div>
        <div className="bs-term">
          <span className="bs-dot" />
          <span>
            {term
              ? term.label
              : "No active academic term"}
          </span>
          {term?.locked && (
            <strong className="bs-locked">
              Locked · View only
            </strong>
          )}
        </div>
        {message && (
          <div
            role="status"
            className="bs-notice"
          >
            {message}
          </div>
        )}
        <section className="bs-panel bs-selector">
          <div className="bs-panel-heading">
            <div>
              <h2>Choose assessment</h2>
              <p>
                Select your assigned class and subject
                to begin.
              </p>
            </div>
          </div>
          <div className="bs-filters">
            <label>
              Class
              <select
                value={classId}
                disabled={saving || refreshing}
                onChange={(event) => {
                  if (
                    dirty &&
                    !window.confirm(
                      "Discard unsaved changes and switch class?"
                    )
                  ) {
                    return;
                  }
                  const id = event.target.value;
                  requestId.current++;
                  setClassId(id);
                  setData(null);
                  setSubjectId("");
                  setValues({});
                  setOriginal({});
                  setConflict(false);
                  setMessage("");
                  if (id) {
                    void loadClass(id);
                  }
                }}
              >
                <option value="">
                  Select a class
                </option>
                {classes.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Subject
              <select
                value={subjectId}
                disabled={!data || saving || refreshing}
                onChange={(event) => {
                  if (
                    dirty &&
                    !window.confirm(
                      "Discard unsaved changes and switch subject?"
                    )
                  ) {
                    return;
                  }
                  chooseSubject(event.target.value);
                }}
              >
                <option value="">
                  Select a subject
                </option>
                {data?.subjects.map((item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
        {loading && (
          <div className="bs-empty">
            Loading assessment data…
          </div>
        )}
        {!loading && !subjectId && (
          <div className="bs-empty">
            <span className="bs-empty-icon">
              ▦
            </span>
            <strong>
              Your broadsheet is ready
            </strong>
            <p>
              Choose a class and subject above to
              view students and their saved marks.
            </p>
          </div>
        )}
        {data && subjectId && (
          <>
            <div className="bs-stats">
              <div className="bs-stat">
                <span>Students</span>
                <strong>{eligible.length}</strong>
                <small>
                  {chosenClass || "Selected class"}
                </small>
              </div>
              <div className="bs-stat">
                <span>CA entered</span>
                <strong>
                  {caEntered}
                  <em> / {eligible.length}</em>
                </strong>
                <small>Maximum 40 marks</small>
              </div>
              <div className="bs-stat">
                <span>Exam entered</span>
                <strong>
                  {examEntered}
                  <em> / {eligible.length}</em>
                </strong>
                <small>Maximum 60 marks</small>
              </div>
              <div className="bs-stat">
                <span>Fully completed</span>
                <strong>{progress}%</strong>
                <div className="bs-progress">
                  <span
                    style={{
                      width: `${progress}%`,
                    }}
                  />
                </div>
              </div>
            </div>
            <section className="bs-panel bs-sheet">
              <div className="bs-sheet-top">
                <div>
                  <div className="bs-eyebrow">
                    SCORE ENTRY
                  </div>
                  <h2>{chosenSubject}</h2>
                  <p>
                    {chosenClass} · {complete} of{" "}
                    {eligible.length} students complete
                  </p>
                </div>
                <div className="bs-tools">
                  <input
                    aria-label="Search students"
                    placeholder="Search name or student ID…"
                    value={search}
                    onChange={(event) =>
                      setSearch(event.target.value)
                    }
                  />
                  <label className="bs-check">
                    <input
                      type="checkbox"
                      checked={missingOnly}
                      onChange={(event) =>
                        setMissingOnly(
                          event.target.checked
                        )
                      }
                    />
                    Missing only
                  </label>
                </div>
              </div>
              <div className="bs-table-wrap">
                <table className="bs-table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Student ID</th>
                      <th>
                        CA <small>/ 40</small>
                      </th>
                      <th>
                        Exam <small>/ 60</small>
                      </th>
                      <th>
                        Total <small>/ 100</small>
                      </th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((student) => {
                      const entry =
                        values[student.id] ?? EMPTY;
                      const isComplete =
                        entry.ca !== "" &&
                        entry.exam !== "";
                      const invalid =
                        (entry.ca !== "" &&
                          Number(entry.ca) > 40) ||
                        (entry.exam !== "" &&
                          Number(entry.exam) > 60);
                      return (
                        <tr key={student.id}>
                          <td>
                            <strong className="bs-student-name">
                              {student.name}
                            </strong>
                          </td>
                          <td className="bs-id">
                            {student.login_id}
                          </td>
                          {(
                            ["ca", "exam"] as const
                          ).map((kind) => (
                            <td key={kind}>
                              <input
                                className="bs-mark"
                                aria-label={`${student.name} ${
                                  kind === "ca"
                                    ? "CA"
                                    : "Exam"
                                }`}
                                inputMode="numeric"
                                value={entry[kind]}
                                disabled={
                                  readOnly ||
                                  saving ||
                                  refreshing ||
                                  conflict
                                }
                                onChange={(event) =>
                                  edit(
                                    student.id,
                                    kind,
                                    event.target.value
                                  )
                                }
                                placeholder="—"
                              />
                            </td>
                          ))}
                          <td>
                            <strong className="bs-total">
                              {invalid
                                ? "Invalid"
                                : !isComplete
                                  ? "—"
                                  : Number(entry.ca) +
                                    Number(entry.exam)}
                            </strong>
                          </td>
                          <td>
                            <span
                              className={`bs-status ${
                                isComplete && !invalid
                                  ? "bs-complete"
                                  : "bs-incomplete"
                              }`}
                            >
                              {invalid
                                ? "Invalid"
                                : isComplete
                                  ? "Complete"
                                  : "Incomplete"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!visible.length && (
                  <div className="bs-no-results">
                    No students match the current filters.
                  </div>
                )}
              </div>
              <div className="bs-mobile-list">
                {visible.map((student, index) => {
                  const entry =
                    values[student.id] ?? EMPTY;
                  const isComplete =
                    entry.ca !== "" &&
                    entry.exam !== "";
                  const invalid =
                    (entry.ca !== "" &&
                      Number(entry.ca) > 40) ||
                    (entry.exam !== "" &&
                      Number(entry.exam) > 60);
                  return (
                    <article
                      className="bs-mobile-card"
                      key={student.id}
                    >
                      <div className="bs-mobile-card-head">
                        <div>
                          <small>
                            STUDENT {index + 1} OF{" "}
                            {visible.length}
                          </small>
                          <h3>{student.name}</h3>
                          <p>{student.login_id}</p>
                        </div>
                        <span
                          className={`bs-status ${
                            isComplete && !invalid
                              ? "bs-complete"
                              : "bs-incomplete"
                          }`}
                        >
                          {invalid
                            ? "Invalid"
                            : isComplete
                              ? "Complete"
                              : "Incomplete"}
                        </span>
                      </div>
                      <div className="bs-mobile-fields">
                        <label>
                          <span>
                            CA <small>/ 40</small>
                          </span>
                          <input
                            className="bs-mark"
                            aria-label={`${student.name} CA`}
                            inputMode="numeric"
                            value={entry.ca}
                            disabled={
                              readOnly ||
                              saving ||
                              refreshing ||
                              conflict
                            }
                            onChange={(event) =>
                              edit(
                                student.id,
                                "ca",
                                event.target.value
                              )
                            }
                            placeholder="—"
                          />
                        </label>
                        <label>
                          <span>
                            Exam <small>/ 60</small>
                          </span>
                          <input
                            className="bs-mark"
                            aria-label={`${student.name} Exam`}
                            inputMode="numeric"
                            value={entry.exam}
                            disabled={
                              readOnly ||
                              saving ||
                              refreshing ||
                              conflict
                            }
                            onChange={(event) =>
                              edit(
                                student.id,
                                "exam",
                                event.target.value
                              )
                            }
                            placeholder="—"
                          />
                        </label>
                        <div className="bs-mobile-total">
                          <span>
                            Total <small>/ 100</small>
                          </span>
                          <strong>
                            {invalid
                              ? "Invalid"
                              : isComplete
                                ? Number(entry.ca) +
                                  Number(entry.exam)
                                : "—"}
                          </strong>
                        </div>
                      </div>
                    </article>
                  );
                })}
                {!visible.length && (
                  <div className="bs-no-results">
                    No students match the current filters.
                  </div>
                )}
              </div>
              <div className="bs-footer">
                <div>
                  <p>
                    Blank = missing score · 0 = valid
                    score · Total appears when both
                    marks exist
                  </p>
                  <small>
                    Only changed scores are submitted.
                    Results are not published by saving.
                  </small>
                </div>
                <div className="bs-save-actions">
                  {dirty && (
                    <span className="bs-unsaved">
                      ● Unsaved changes
                    </span>
                  )}
                  <button
                    className="bs-save"
                    type="button"
                    disabled={
                      !dirty ||
                      saving ||
                      refreshing ||
                      readOnly ||
                      conflict
                    }
                    onClick={() => void save()}
                  >
                    {saving
                      ? "Saving…"
                      : "Save changed scores"}
                  </button>
                  <button
                    className="bs-save"
                    style={{ background: "transparent", color: "#245580", border: "1px solid #245580" }}
                    type="button"
                    disabled={
                      saving ||
                      refreshing ||
                      !classId ||
                      !subjectId
                    }
                    onClick={() =>
                      void refreshScores()
                    }
                  >
                    {refreshing
                      ? "Refreshing…"
                      : "Refresh scores"}
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
