import { NextResponse } from "next/server";
import { adminClient } from "@/lib/admin";
export async function GET(request:Request){
 const c=adminClient(request); if("error" in c) return NextResponse.json({error:c.error},{status:c.status});
 const {data,error}=await c.sb.from("published_score_corrections")
 .select("id,created_at,status,teacher_id,term_id,class_id,student_id,subject_id,kind,old_score,proposed_score,reason,decision_note")
 .order("created_at",{ascending:false}).limit(200);
 if(error) return NextResponse.json({error:error.message},{status:500});
 const items=data??[];
 // Resolve display labels without changing the approval RPC or stored correction records.
 const ids=(key: "teacher_id"|"student_id"|"subject_id"|"class_id") => [...new Set(items.map(x=>x[key]).filter((v):v is string=>typeof v==="string"&&!!v))];
 const [teachers,students,subjects,classes]=await Promise.all([
  ids("teacher_id").length?c.sb.from("teachers").select("id,name").in("id",ids("teacher_id")) : Promise.resolve({data:[],error:null}),
  ids("student_id").length?c.sb.from("students").select("id,name,login_id").in("id",ids("student_id")) : Promise.resolve({data:[],error:null}),
  ids("subject_id").length?c.sb.from("subjects").select("id,name").in("id",ids("subject_id")) : Promise.resolve({data:[],error:null}),
  ids("class_id").length?c.sb.from("classes").select("id,name").in("id",ids("class_id")) : Promise.resolve({data:[],error:null}),
 ]);
 const names=(rows:{id:string;name:string}[]|null|undefined)=>new Map((rows??[]).map(x=>[x.id,x.name]));
 const teacherNames=names(teachers.data),studentNames=names(students.data),subjectNames=names(subjects.data),classNames=names(classes.data);
 return NextResponse.json({items:items.map(x=>({...x,
  teacher_name:teacherNames.get(x.teacher_id)??null,
  student_name:studentNames.get(x.student_id)??null,
  student_login_id:(students.data??[]).find(v=>v.id===x.student_id)?.login_id??null,
  subject_name:subjectNames.get(x.subject_id)??null,
  class_name:classNames.get(x.class_id)??null,
 }))});
}
export async function POST(request:Request){
 const c=adminClient(request); if("error" in c) return NextResponse.json({error:c.error},{status:c.status});
 const b=await request.json().catch(()=>null);
 if(!b||typeof b.id!=="string"||typeof b.approve!=="boolean"|| (b.note!=null&&typeof b.note!=="string"))
  return NextResponse.json({error:"Invalid decision"},{status:400});
 const {error}=await c.sb.rpc("admin_decide_published_score_correction",{
  p_request:b.id,p_approve:b.approve,p_note:(b.note??"").slice(0,1000)
 });
 return error?NextResponse.json({error:error.message},{status:409}):NextResponse.json({ok:true});
}
