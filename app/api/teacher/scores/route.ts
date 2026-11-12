

import { NextResponse } from "next/server";

import {

  getTeacher,

  teacherDenied,

  type TeacherCtx,

} from "@/lib/teacher";



type Pair = {

  class_id: string;

  subject_id: string;

};



type Term = {

  id: string;

  session: string;

  term: string;

  is_active: boolean;

  is_locked: boolean | null;

};



type ScoreInput = {

  subjectId: string;

  kind: string;

  score: number;

  expected?: number | null;

};



type StudentInput = {

  loginId: string;

  scores: ScoreInput[];

};



type SaveRow = {

  student_id: string;

  subject_id: string;

  kind: "test1" | "exam";

  score: number;

  expected?: number | null;

};



const LIMIT: Record<string, number> = {

  ca: 40,

  exam: 60,

};



const pk = (c: string, s: string) => `${c}|${s}`;



const fail = (message: string, status = 500) =>

  NextResponse.json({ error: message }, { status });



async function allowedPairs(t: TeacherCtx): Promise<Pair[]> {

  const out = new Map<string, Pair>();



  for (const link of t.subjectLinks) {

    out.set(pk(link.class_id, link.subject_id), link);

  }



  if (t.classTeacherIds.length) {

    const { data, error } = await t.db

      .from("class_subjects")

      .select("class_id, subject_id")

      .in("class_id", t.classTeacherIds);



    if (error) {

      throw new Error("Could not load class subjects.");

    }



    for (const link of (data ?? []) as Pair[]) {

      out.set(pk(link.class_id, link.subject_id), link);

    }

  }



  return [...out.values()];

}



async function currentTerm(t: TeacherCtx): Promise<Term | null> {

  const { data, error } = await t.db

    .from("terms")

    .select("id, session, term, is_active, is_locked")

    .eq("is_active", true)

    .limit(1);



  if (error) {

    throw new Error("Could not load the current term.");

  }



  return ((data ?? [])[0] as Term | undefined) ?? null;

}



export async function GET(request: Request) {

  const t = await getTeacher();



  if (t.status !== "ok") {

    return teacherDenied(t.status);

  }



  const { db } = t;



  try {

    const term = await currentTerm(t);



    const termInfo = term

      ? {

          id: term.id,

          label: `${term.term} — ${term.session}`,

          locked: !!term.is_locked,

        }

      : null;



    const pairs = await allowedPairs(t);

    const classIds = [...new Set(pairs.map((p) => p.class_id))];



    const classId = new URL(request.url).searchParams.get("classId");



    if (!classId) {

      if (!classIds.length) {

        return NextResponse.json({

          term: termInfo,

          classes: [],

        });

      }



      const { data, error } = await db

        .from("classes")

        .select("id, name")

        .in("id", classIds)

        .order("sort_order");



      if (error) {

        return fail("Could not load your classes.");

      }



      return NextResponse.json({

        term: termInfo,

        classes: data ?? [],

      });

    }



    if (!classIds.includes(classId)) {

      return fail("You do not have access to that class.", 403);

    }



    const subjectIds = pairs

      .filter((p) => p.class_id === classId)

      .map((p) => p.subject_id);



    const [students, cs, subs] = await Promise.all([

      db

        .from("students")

        .select("id, login_id, name")

        .eq("class_id", classId)

        .eq("is_active", true)

        .order("name"),



      db

        .from("class_subjects")

        .select("subject_id, position")

        .eq("class_id", classId)

        .in("subject_id", subjectIds)

        .order("position"),



      db

        .from("subjects")

        .select("id, name")

        .in("id", subjectIds),

    ]);



    if (students.error || cs.error || subs.error) {

      console.error("teacher scores GET failed", {

        students: students.error?.message,

        classSubjects: cs.error?.message,

        subjects: subs.error?.message,

      });



      return fail("Could not load the class.");

    }



    const subjects = (cs.data ?? [])

      .map((x) =>

        (subs.data ?? []).find((s) => s.id === x.subject_id)

      )

      .filter(

        (s): s is { id: string; name: string } => Boolean(s)

      );



    const studentIds = (students.data ?? []).map((s) => s.id);



    const [studentSubjectsResult, scoresResult] =

      await Promise.all([

        studentIds.length

          ? db

              .from("student_subjects")

              .select("student_id, subject_id")

              .in("student_id", studentIds)

          : Promise.resolve({

              data: [] as {

                student_id: string;

                subject_id: string;

              }[],

              error: null,

            }),



        term && studentIds.length && subjectIds.length

          ? db

              .from("scores")

              .select("student_id, subject_id, kind, score")

              .eq("term_id", term.id)

              .in("student_id", studentIds)

              .in("subject_id", subjectIds)

          : Promise.resolve({

              data: [] as {

                student_id: string;

                subject_id: string;

                kind: string;

                score: number;

              }[],

              error: null,

            }),

      ]);



    if (studentSubjectsResult.error || scoresResult.error) {

      console.error("teacher scores GET failed", {

        studentSubjects: studentSubjectsResult.error?.message,

        scores: scoresResult.error?.message,

      });



      return fail("Could not load student scores.");

    }



    return NextResponse.json({

      term: termInfo,

      students: students.data ?? [],

      subjects,

      studentSubjects: studentSubjectsResult.data ?? [],

      scores: (scoresResult.data ?? []).map((x) => ({

        ...x,

        kind: x.kind === "test1" ? "ca" : x.kind,

      })),

    });

  } catch (error) {

    console.error("Teacher scores GET error:", error);

    return fail("Could not load teacher scores.");

  }

}



export async function POST(request: Request) {

  const t = await getTeacher();



  if (t.status !== "ok") {

    return teacherDenied(t.status);

  }



  const { db } = t;



  try {

    const body = await request.json().catch(() => null);



    const protectedSave = body?.action === "save-protected";



    if (

      !body ||

      (body.action !== "save" && !protectedSave)

    ) {

      return fail("Unknown action.", 400);

    }



    const term = await currentTerm(t);



    if (!term) {

      return fail(

        "No current term has been set. Please see the school admin.",

        400

      );

    }



    if (term.is_locked) {

      return fail(

        `${term.term} — ${term.session} is locked, so scores cannot be changed.`,

        400

      );

    }



    const classId = String(body.classId ?? "");



    const pairs = await allowedPairs(t);



    const mine = new Set(

      pairs

        .filter((p) => p.class_id === classId)

        .map((p) => p.subject_id)

    );



    if (!mine.size) {

      return fail(

        "You do not have access to that class.",

        403

      );

    }



    const rows = (

      Array.isArray(body.rows) ? body.rows : []

    ) as StudentInput[];



    if (rows.length > 500) {

      return fail("Too many students in one upload.", 400);

    }



    const { data: students, error: studentsError } = await db

      .from("students")

      .select("id, login_id")

      .eq("class_id", classId)

      .eq("is_active", true);



    if (studentsError) {

      return fail("Could not verify the class students.");

    }



    const byLogin = new Map(

      (students ?? []).map((s) => [

        s.login_id as string,

        s.id as string,

      ])

    );



    const { data: studentSubjects, error: subjectsError } =

      students?.length

        ? await db

            .from("student_subjects")

            .select("student_id, subject_id")

            .in(

              "student_id",

              students.map((s) => s.id)

            )

        : {

            data: [] as {

              student_id: string;

              subject_id: string;

            }[],

            error: null,

          };



    if (subjectsError) {

      return fail("Could not verify student subjects.");

    }



    const electives = new Map<string, Set<string>>();



    for (const entry of studentSubjects ?? []) {

      if (!electives.has(entry.student_id)) {

        electives.set(entry.student_id, new Set());

      }



      electives.get(entry.student_id)!.add(entry.subject_id);

    }



    const out: SaveRow[] = [];

    const unknown: string[] = [];

    const bad: string[] = [];

    const seen = new Set<string>();



    let notTaking = 0;



    for (const row of rows) {

      const loginId = String(row?.loginId ?? "");

      const studentId = byLogin.get(loginId);



      if (!studentId) {

        unknown.push(loginId);

        continue;

      }



      const entries = Array.isArray(row.scores)

        ? row.scores

        : [];



      for (const scoreEntry of entries) {

        const subjectId = scoreEntry?.subjectId;

        const kind = scoreEntry?.kind;

        const score = scoreEntry?.score;



        if (!mine.has(subjectId)) {

          bad.push("a subject that is not yours");

          continue;

        }



        if (

          (kind !== "ca" && kind !== "exam") ||

          !Number.isInteger(score) ||

          score < 0

        ) {

          bad.push("an invalid score");

          continue;

        }



        if (score > LIMIT[kind]) {

          bad.push(

            `${kind === "ca" ? "CA" : "Exam"} ${score} (max ${LIMIT[kind]})`

          );

          continue;

        }



        const own = electives.get(studentId);



        if (own && own.size && !own.has(subjectId)) {

          notTaking++;

          continue;

        }



        const dbKind: "test1" | "exam" =

          kind === "ca" ? "test1" : "exam";



        const scoreKey = [

          studentId,

          subjectId,

          dbKind,

        ].join("|");



        if (protectedSave) {

          if (seen.has(scoreKey)) {

            bad.push("duplicate score entries");

            continue;

          }



          seen.add(scoreKey);



          const expected = scoreEntry.expected;

          if (
            !Object.prototype.hasOwnProperty.call(scoreEntry, "expected") ||
            !(
              expected === null ||
              (typeof expected === "number" &&
                Number.isInteger(expected) &&
                expected >= 0 &&
                expected <= LIMIT[kind])
            )
          ) {

            bad.push(

              "a missing or invalid original score"

            );

            continue;

          }



          out.push({

            student_id: studentId,

            subject_id: subjectId,

            kind: dbKind,

            score,

            expected,

          });

        } else {

          out.push({

            student_id: studentId,

            subject_id: subjectId,

            kind: dbKind,

            score,

          });

        }

      }

    }



    if (bad.length) {

      return fail(

        `Nothing saved. The upload contains ${[

          ...new Set(bad),

        ]

          .slice(0, 6)

          .join("; ")}.`,

        400

      );

    }



    // The protected function accepts at most 400 score entries.

    // A protected save must be atomic, so reject larger batches

    // instead of splitting them into separate transactions.

    if (protectedSave && out.length > 400) {

      return fail(

        "A protected save supports at most 400 score entries. Save a smaller selection.",

        400

      );

    }



    let saved = 0;



    const functionName = "teacher_save_scores_with_history";

const batchSize = 400;

for (let i = 0; i < out.length; i += batchSize) {
  const { data, error } = await db.rpc(functionName, {
    p_term: term.id,
    p_class: classId,
    p_rows: out.slice(i, i + batchSize),
    p_teacher_id: t.teacher.id,
    p_protected: protectedSave,
  });



      if (error) {

        console.error(`${functionName} failed:`, error.message);



        if (

          protectedSave &&

          error.message.includes("Score conflict")

        ) {

          return NextResponse.json(

            {

              error:

                "Another save changed one or more marks since you loaded the broadsheet. Your changes were not saved. Refresh the broadsheet before editing again.",

              code: "SCORE_CONFLICT",

            },

            { status: 409 }

          );

        }



        return fail(

          "Could not save the scores. " + error.message

        );

      }



      saved += Number(data ?? 0);

    }



    return NextResponse.json({

      ok: true,

      saved,

      unknown,

      notTaking,

    });

  } catch (error) {

    console.error("Teacher scores POST error:", error);

    return fail("Could not process the score upload.");

  }

}
