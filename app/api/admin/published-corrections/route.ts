import { NextResponse } from "next/server";
import { adminClient } from "@/lib/admin";
export async function GET(request:Request){
 const c=adminClient(request); if("error" in c) return NextResponse.json({error:c.error},{status:c.status});
 const {data,error}=await c.sb.from("published_score_corrections")
 .select("id,created_at,status,teacher_id,term_id,class_id,student_id,subject_id,kind,old_score,proposed_score,reason,decision_note")
 .order("created_at",{ascending:false}).limit(200);
 return error?NextResponse.json({error:error.message},{status:500}):NextResponse.json({items:data??[]});
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
