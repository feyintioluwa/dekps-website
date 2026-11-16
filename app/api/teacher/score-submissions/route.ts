import { NextResponse } from "next/server";
import { getTeacher, teacherDenied } from "@/lib/teacher";
const response=(error:string,status=400)=>NextResponse.json({error},{status});
export async function GET(){
 const t=await getTeacher();if(t.status!=="ok")return teacherDenied(t.status);
 const {data:terms,error:te}=await t.db.from("terms").select("id,term,session,is_locked").eq("is_active",true).limit(1);
 if(te)return response("Could not load active term",500);
 const term=terms?.[0]??null;
 const {data,error}=term?await t.db.from("score_submissions").select("id,term_id,class_id,subject_id,teacher_id,status,review_note,submitted_at,reviewed_at").eq("term_id",term.id).eq("teacher_id",t.teacher.id):{data:[],error:null};
 if(error)return response("Could not load submissions. Run the Stage 14 SQL migration.",500);
 const classIds=t.allowedClassIds;
 const [classes,subjects,links]=await Promise.all([
 classIds.length?t.db.from("classes").select("id,name").in("id",classIds):Promise.resolve({data:[]}),
 t.db.from("subjects").select("id,name"),
 t.classTeacherIds.length?t.db.from("class_subjects").select("class_id,subject_id").in("class_id",t.classTeacherIds):Promise.resolve({data:[]})
 ]);
 const pairs=new Map<string,{class_id:string;subject_id:string}>();
 for(const x of [...t.subjectLinks,...(links.data??[])])pairs.set(x.class_id+":"+x.subject_id,x);
 return NextResponse.json({term,items:data??[],pairs:[...pairs.values()],classes:classes.data??[],subjects:subjects.data??[]});
}
export async function POST(req:Request){
 const t=await getTeacher();if(t.status!=="ok")return teacherDenied(t.status);
 const b=await req.json().catch(()=>null);
 if(!b||!["submit","withdraw"].includes(b.action)||typeof b.classId!=="string"||typeof b.subjectId!=="string")return response("Invalid submission request");
 const {data:terms}=await t.db.from("terms").select("id,is_locked").eq("is_active",true).limit(1);
 const term=terms?.[0];if(!term||term.is_locked)return response("The current term is unavailable or locked");
 const {data,error}=await t.db.rpc("stage14_teacher_transition",{p_term:term.id,p_class:b.classId,p_subject:b.subjectId,p_teacher:t.teacher.id,p_action:b.action});
 return error?response(error.message,409):NextResponse.json({ok:true,status:data});
}
