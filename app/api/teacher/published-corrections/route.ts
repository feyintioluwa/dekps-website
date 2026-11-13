import { NextResponse } from "next/server";
import { getTeacher, teacherDenied } from "@/lib/teacher";

export async function GET() {
 const t = await getTeacher();
 if (t.status !== "ok") return teacherDenied(t.status);
 const { data, error } = await t.db.from("published_score_corrections")
  .select("id,created_at,status,term_id,class_id,student_id,subject_id,kind,old_score,proposed_score,reason,decision_note")
  .eq("teacher_id",t.teacher.id).order("created_at",{ascending:false}).limit(100);
 return error ? NextResponse.json({error:error.message},{status:500}) : NextResponse.json({items:data??[]});
}

export async function POST(request:Request) {
 const t=await getTeacher();
 if(t.status!=="ok") return teacherDenied(t.status);
 const b=await request.json().catch(()=>null);
 const bad=(message:string,status=400)=>NextResponse.json({error:message},{status});
 if(!b || !["test1","exam"].includes(b.kind) || !Number.isInteger(b.proposedScore)
   || b.proposedScore<0 || b.proposedScore>(b.kind==="test1"?40:60)
   || typeof b.reason!=="string" || b.reason.trim().length<10 || b.reason.trim().length>1000)
   return bad("Provide a valid CA (0–40) or exam (0–60) mark and a reason of 10–1000 characters.");
 const ids=[b.termId,b.classId,b.studentId,b.subjectId];
 if(ids.some(x=>typeof x!=="string" || !/^[0-9a-f-]{36}$/i.test(x))) return bad("Invalid identifiers");
 if(!t.allowedClassIds.includes(b.classId)) return bad("Class not assigned to you",403);
 if(!t.classTeacherIds.includes(b.classId) && !t.subjectLinks.some(x=>x.class_id===b.classId && x.subject_id===b.subjectId))
   return bad("Subject not assigned to you",403);
 const [student,link,term,score]=await Promise.all([
  t.db.from("students").select("login_id").eq("id",b.studentId).eq("class_id",b.classId).eq("is_active",true).maybeSingle(),
  t.db.from("class_subjects").select("subject_id").eq("class_id",b.classId).eq("subject_id",b.subjectId).maybeSingle(),
  t.db.from("terms").select("id").eq("id",b.termId).maybeSingle(),
  t.db.from("scores").select("score").eq("term_id",b.termId).eq("student_id",b.studentId).eq("subject_id",b.subjectId).eq("kind",b.kind).maybeSingle(),
 ]);
 if(student.error||link.error||term.error||score.error) return bad("Unable to verify score",500);
 if(!student.data||!link.data||!term.data||!score.data) return bad("Student, subject, term or existing score not found");
 const [published,enrolment]=await Promise.all([
  t.db.from("student_results").select("id").eq("login_id",student.data.login_id).eq("term_id",b.termId).maybeSingle(),
  t.db.from("student_subjects").select("subject_id").eq("student_id",b.studentId),
 ]);
 if(published.error||enrolment.error) return bad("Unable to verify published result",500);
 if(!published.data) return bad("This result has not been published yet");
 if((enrolment.data?.length??0)>0 && !enrolment.data?.some(x=>x.subject_id===b.subjectId)) return bad("Student is not enrolled in this subject");
 if(score.data.score===b.proposedScore) return bad("Proposed mark matches the current mark");
 const {error}=await t.db.from("published_score_corrections").insert({
  teacher_id:t.teacher.id,term_id:b.termId,class_id:b.classId,student_id:b.studentId,
  subject_id:b.subjectId,kind:b.kind,old_score:score.data.score,proposed_score:b.proposedScore,reason:b.reason.trim()
 });
 if(error) return bad(error.code==="23505"?"A correction for this mark is already pending":error.message,error.code==="23505"?409:500);
 return NextResponse.json({ok:true});
}
