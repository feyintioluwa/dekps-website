"use client";

import {

  KeyboardEvent as ReactKeyboardEvent,

  MouseEvent,

  useCallback,

  useEffect,

  useMemo,

  useRef,

  useState,

} from "react";

import Link from "next/link";

import Image from "next/image";

import { useRouter } from "next/navigation";

import {

  DialogProvider,

  useConfirm,

  useNotice,

  useToast,

} from "@/lib/dialog";

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

// One calculation rule for desktop, mobile list, and mobile quick entry.
function calculateScore(entry: Entry): { total: number | null; complete: boolean; invalid: boolean } {
  const validPart = (value: string, max: number) =>
    value === "" || (/^\d{1,2}$/.test(value) && Number(value) <= max);
  const invalid = !validPart(entry.ca, 40) || !validPart(entry.exam, 60);
  const complete = !invalid && entry.ca !== "" && entry.exam !== "";
  return {
    total: complete ? Number(entry.ca) + Number(entry.exam) : null,
    complete,
    invalid,
  };
}

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

function BroadsheetInner() {

  const ask = useConfirm();

  const toast = useToast();

  const notice = useNotice();

  const router = useRouter();

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

  // Navigation state is shared by the existing desktop and mobile inputs.

  const [mobileQuick, setMobileQuick] = useState(false);

  const [quickStudentId, setQuickStudentId] = useState("");

  const [quickKind, setQuickKind] = useState<Kind>("ca");

  const scoreInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const quickInputRefs = useRef<Record<Kind, HTMLInputElement | null>>({ ca: null, exam: null });

  // A problem the teacher must notice: shown on the page and as a red message

  function problem(text: string) {

    setMessage(text);

    toast(text, "err", "Could not save");

  }

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

  // Closing the tab or reloading with unsaved marks: the browser asks first

  useEffect(() => {

    if (!dirty) return;

    const warn = (event: BeforeUnloadEvent) => {

      event.preventDefault();

      event.returnValue = "";

    };

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);

  }, [dirty]);

  // Leaving this page through a link: ask first when there are unsaved marks

  async function leave(

    event: MouseEvent<HTMLAnchorElement>,

    href: string

  ) {

    if (!dirty) return;

    event.preventDefault();

    const go = await ask({

      title: "Unsaved changes",

      message:

        "You have unsaved changes. Are you sure you want to leave?",

      cancelText: "Stay",

      confirmText: "Leave",

    });

    if (go) router.push(href);

  }

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

  const quickIndex = Math.max(0, visible.findIndex((student) => student.id === quickStudentId));

  const quickStudent = visible[quickIndex] ?? null;

  // Keep the current student in view when filters, class or subject change.

  useEffect(() => {

    if (!visible.length) {

      setQuickStudentId("");

    } else if (!visible.some((student) => student.id === quickStudentId)) {

      setQuickStudentId(visible[0].id);

    }

  }, [visible, quickStudentId]);

  function moveDesktop(studentId: string, kind: Kind, direction: number) {

    const index = visible.findIndex((student) => student.id === studentId);

    if (index < 0) return;

    const next = visible[index + direction];

    if (!next) return;

    scoreInputRefs.current[`${next.id}:${kind}`]?.focus();

    scoreInputRefs.current[`${next.id}:${kind}`]?.select();

  }

  function desktopKeyDown(event: ReactKeyboardEvent<HTMLInputElement>, studentId: string, kind: Kind) {

    if (event.key === "Escape") { event.currentTarget.blur(); return; }

    if (event.key === "Enter" || event.key === "ArrowDown" || event.key === "ArrowUp") {

      event.preventDefault();

      moveDesktop(studentId, kind, event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey) ? -1 : 1);

    }

  }

  function moveQuick(direction: number) {

    const next = visible[quickIndex + direction];

    if (!next) return;

    setQuickStudentId(next.id);

    requestAnimationFrame(() => quickInputRefs.current[quickKind]?.focus());

  }

  function quickKeyDown(event: ReactKeyboardEvent<HTMLInputElement>, kind: Kind) {

    if (event.key === "Escape") { event.currentTarget.blur(); return; }

    if (event.key !== "Enter") return;

    event.preventDefault();

    if (event.shiftKey) { moveQuick(-1); return; }

    if (kind === "ca") {

      setQuickKind("exam");

      quickInputRefs.current.exam?.focus();

      quickInputRefs.current.exam?.select();

    } else {

      setQuickKind("ca");

      const next = visible[quickIndex + 1];

      if (next) {

        setQuickStudentId(next.id);

        requestAnimationFrame(() => quickInputRefs.current.ca?.focus());

      } else {

        event.currentTarget.blur();

      }

    }

  }

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

          problem(

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

          problem(

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

      problem(

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

          const text =

            "Score conflict detected. Another save changed " +

            "one or more marks. Nothing from this save was " +

            "applied. Your edits are still visible. " +

            "Review them, then refresh the broadsheet.";

          setMessage(text);

          void notice({

            kind: "err",

            title: "Score conflict",

            message:

              "Another save changed one or more marks, so nothing from this save was applied. " +

              "Your edits are still on the page. Review them, then refresh the broadsheet.",

            buttonText: "Review my edits",

          });

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

        const text =

          "The save was accepted, but the latest scores " +

          "could not be reloaded. Do not save again yet. " +

          "Refresh the broadsheet to verify the marks.";

        setMessage(text);

        void notice({

          kind: "info",

          title: "Saved, but not reloaded",

          message:

            "Your scores were saved, but the latest marks could not be reloaded. " +

            "Do not save again yet. Refresh the broadsheet to check them.",

          buttonText: "OK",

        });

        return;

      }

      const freshData = fresh as ClassData;

      const next = buildEntries(freshData, subjectId);

      setData(freshData);

      setTerm(freshData.term ?? null);

      setValues(next);

      setOriginal(next);

      setConflict(false);

      const savedCount = result.saved ?? 0;

      setMessage(

        `${savedCount} score entries saved. ` +

          "Results have not been published."

      );

      // The success message appears only now, after the save really worked

      void notice({

        kind: "ok",

        title: "Scores saved!",

        message:

          `${savedCount} score ${savedCount === 1 ? "entry was" : "entries were"} saved successfully. ` +

          "Results have not been published.",

        buttonText: "Done",

      });

    } catch (error) {

      const text = errorMessage(

        error,

        "Saving failed. Please try again."

      );

      setMessage(text);

      toast(text, "err", "Could not save");

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

      !(await ask({

        title: "Discard unsaved edits?",

        message:

          "Refreshing will discard your unsaved edits. " +

          "Continue?",

        cancelText: "Stay",

        confirmText: "Refresh anyway",

      }))

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

      toast(

        "The latest saved marks are now showing.",

        "ok",

        "Broadsheet refreshed"

      );

    } catch (error) {

      const text = errorMessage(

        error,

        "Could not refresh scores."

      );

      setMessage(text);

      toast(text, "err", "Could not refresh");

    } finally {

      setRefreshing(false);

    }

  }

  const complete = eligible.filter((student) =>
    calculateScore(values[student.id] ?? EMPTY).complete
  ).length;

  const caEntered = eligible.filter((student) => {
    const ca = (values[student.id] ?? EMPTY).ca;
    return ca !== "" && /^\d{1,2}$/.test(ca) && Number(ca) <= 40;
  }).length;

  const examEntered = eligible.filter((student) => {
    const exam = (values[student.id] ?? EMPTY).exam;
    return exam !== "" && /^\d{1,2}$/.test(exam) && Number(exam) <= 60;
  }).length;

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

            onClick={(event) => void leave(event, "/teacher")}

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

            onClick={(event) => void leave(event, "/teacher/scores")}

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

                onChange={async (event) => {

                  const id = event.target.value;

                  if (

                    dirty &&

                    !(await ask({

                      title: "Unsaved changes",

                      message:

                        "You have unsaved changes. Switching class will discard them.",

                      cancelText: "Stay",

                      confirmText: "Discard and switch",

                    }))

                  ) {

                    return;

                  }

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

                onChange={async (event) => {

                  const id = event.target.value;

                  if (

                    dirty &&

                    !(await ask({

                      title: "Unsaved changes",

                      message:

                        "You have unsaved changes. Switching subject will discard them.",

                      cancelText: "Stay",

                      confirmText: "Discard and switch",

                    }))

                  ) {

                    return;

                  }

                  chooseSubject(id);

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

                      const { complete: isComplete, invalid, total } = calculateScore(entry);

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

                                ref={(node) => { scoreInputRefs.current[`${student.id}:${kind}`] = node; }}

                                  onKeyDown={(event) => desktopKeyDown(event, student.id, kind)}

                                  className="bs-mark"

                                  aria-label={`${student.name} ${kind === "ca"

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

                                  : total}

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

              <div className="bs-mobile-mode" role="group" aria-label="Mobile score entry mode">

                  <button type="button" className={!mobileQuick ? "bs-mode-active" : ""} onClick={() => setMobileQuick(false)} aria-pressed={!mobileQuick}>List view</button>

                  <button type="button" className={mobileQuick ? "bs-mode-active" : ""} onClick={() => setMobileQuick(true)} aria-pressed={mobileQuick}>Quick entry</button>

                </div>

                {mobileQuick && quickStudent && (

                  <section className="bs-quick" aria-label="Quick score entry">

                    <div className="bs-mobile-card-head">

                      <div>

                        <small>STUDENT {quickIndex + 1} OF {visible.length}</small>

                        <h3>{quickStudent.name}</h3>

                        <p>{quickStudent.login_id}</p>

                      </div>

                    </div>

                    <div className="bs-mobile-fields">

                      {(["ca", "exam"] as const).map((kind) => (

                        <label key={kind}>

                          <span>{kind === "ca" ? "CA" : "Exam"} <small>/ {kind === "ca" ? 40 : 60}</small></span>

                          <input

                            ref={(node) => { quickInputRefs.current[kind] = node; }}

                            className="bs-mark"

                            aria-label={`${quickStudent.name} ${kind === "ca" ? "CA" : "Exam"}`}

                            inputMode="numeric"

                            enterKeyHint="next"

                            value={(values[quickStudent.id] ?? EMPTY)[kind]}

                            disabled={readOnly || saving || refreshing || conflict}

                            onFocus={() => setQuickKind(kind)}

                            onKeyDown={(event) => quickKeyDown(event, kind)}

                            onChange={(event) => edit(quickStudent.id, kind, event.target.value)}

                            placeholder="—"

                          />

                        </label>

                      ))}

                      <div className="bs-mobile-total">

                        <span>Total <small>/ 100</small></span>

                        <strong>{(() => {
                            const result = calculateScore(values[quickStudent.id] ?? EMPTY);
                            return result.invalid ? "Invalid" : result.total ?? "—";
                          })()}</strong>

                      </div>

                    </div>

                    <div className="bs-quick-nav">

                      <button type="button" disabled={quickIndex === 0} onClick={() => moveQuick(-1)}>← Previous</button>

                      <button type="button" disabled={quickIndex === visible.length - 1} onClick={() => moveQuick(1)}>Next student →</button>

                    </div>

                    <small className="bs-quick-help">Use the numeric keypad. Enter moves from CA to Exam, then to the next student. Scores are saved only when you tap Save changed scores.</small>

                  </section>

                )}

                <div className={"bs-mobile-list" + (mobileQuick ? " bs-mobile-list-hidden" : "")}>

                {visible.map((student, index) => {

                  const entry =

                    values[student.id] ?? EMPTY;

                  const { complete: isComplete, invalid, total } = calculateScore(entry);

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

                            {invalid ? "Invalid" : total ?? "—"}

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

export default function TeacherBroadsheet() {

  return (

    <DialogProvider>

      <BroadsheetInner />

    </DialogProvider>

  );

}
