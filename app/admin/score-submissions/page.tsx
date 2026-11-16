"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {useAdminKey} from "../AdminShell";
import {useConfirm,useInputDialog,useToast} from "@/lib/dialog";
import "../../teacher/score-submissions/submissions.css";
type Item={id:string;class_name:string;subject_name:string;teacher_name:string;status:string;review_note:string;submitted_at:string|null};
type Filter="pending"|"all"|"approved"|"returned"|"withdrawn";
type ReviewRow={student_id:string;login_id:string;name:string;ca:number|null;exam:number|null;total:number|null;complete:boolean;issue:string};
type Review={submission:Item & {term_label:string};rows:ReviewRow[];total:number;complete:number;ready:boolean};
export default function Page(){
 const key=useAdminKey();
 const [items,setItems]=useState<Item[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false),[selected,setSelected]=useState<string[]>([]),[filter,setFilter]=useState<Filter>("pending"),[loading,setLoading]=useState(true);
 const confirm=useConfirm(),input=useInputDialog(),toast=useToast();
 const [review,setReview]=useState<Review|null>(null);
 const [reviewId,setReviewId]=useState<string|null>(null);
 const [reviewLoading,setReviewLoading]=useState(false);
 const [reviewError,setReviewError]=useState("");
 const [reviewed,setReviewed]=useState<string[]>([]);
 const [reviewSearch,setReviewSearch]=useState("");
 const reviewRows=useMemo(()=>review?.rows.filter(r=>`${r.name} ${r.login_id}`.toLowerCase().includes(reviewSearch.trim().toLowerCase()))??[],[review,reviewSearch]);
 const openReview=useCallback(async(id:string)=>{
  setReviewId(id);setReview(null);setReviewError("");setReviewSearch("");setReviewLoading(true);
  try{const r=await fetch(`/api/admin/score-submissions?id=${encodeURIComponent(id)}`,{headers:{"x-admin-key":key},cache:"no-store"});
   const d=await r.json().catch(()=>null);if(!r.ok)throw Error(d?.error||"Could not load score sheet.");
   setReview(d as Review);
  }catch(e){setReviewError(e instanceof Error?e.message:"Network error");}
  finally{setReviewLoading(false);}
 },[key]);
 const closeReview=()=>{if(!busy){setReviewId(null);setReview(null);setReviewError("");}};
 const load=useCallback(async()=>{if(!key){setLoading(false);return;}setLoading(true);try{const r=await fetch("/api/admin/score-submissions",{headers:{"x-admin-key":key},cache:"no-store"});const d=await r.json().catch(()=>null);if(!r.ok)throw Error(d?.error||`Could not load submissions (${r.status})`);setItems(Array.isArray(d?.items)?d.items:[]);setError("");}catch(e){setError(e instanceof Error?e.message:"Network error");}finally{setLoading(false);}},[key]);
 useEffect(()=>{void load();},[load]);
 const pending=useMemo(()=>items.filter(x=>x.status==="pending"),[items]);
 const visible=useMemo(()=>filter==="all"?items:items.filter(x=>x.status===filter),[items,filter]);
 const selectedPending=pending.filter(x=>selected.includes(x.id));
 const allVisiblePending=visible.filter(x=>x.status==="pending");
 async function decision(id:string,action:"approve"|"return",note:string){const r=await fetch("/api/admin/score-submissions",{method:"POST",headers:{"x-admin-key":key,"Content-Type":"application/json"},body:JSON.stringify({id,action,note})});const d=await r.json().catch(()=>null);if(!r.ok)throw Error(d?.error||`Decision failed (${r.status})`);}
 async function act(item:Item,action:"approve"|"return"){
  if(busy)return;
  if(action==="approve" && !reviewed.includes(item.id)){
   toast("Open Review Scores and inspect the sheet before approving.","err");
   await openReview(item.id);return;
  }
  let note="";
  if(action==="return"){const answer=await input({title:"Return scores for correction",message:"Explain what the teacher needs to correct.",required:true,confirmText:"Return scores"});if(!answer?.trim())return;note=answer.trim();}
  else if(!await confirm({title:"Approve scores?",message:`Approve ${item.subject_name} for ${item.class_name}? Review the score sheet before confirming.`,confirmText:"Approve scores"}))return;
  setBusy(true);try{await decision(item.id,action,note);toast(action==="approve"?"Scores approved":"Scores returned for correction","ok");setSelected(x=>x.filter(id=>id!==item.id));setReviewed(x=>x.filter(id=>id!==item.id));if(reviewId===item.id){setReviewId(null);setReview(null);}await load();}catch(e){toast(e instanceof Error?e.message:"Network error","err");}finally{setBusy(false);}
 }
 async function approveSelected(){
  if(busy||!selectedPending.length)return;
  const unreviewed=selectedPending.find(item=>!reviewed.includes(item.id));
  if(unreviewed){toast("Review every selected score sheet before bulk approval.","err");await openReview(unreviewed.id);return;}
  if(!await confirm({title:"Approve selected score sheets?",message:`Approve ${selectedPending.length} selected pending submissions? Review each score sheet before confirming. Only these selected submissions will be approved.`,confirmText:`Approve selected (${selectedPending.length})`}))return;
  setBusy(true);let succeeded=0;const failed:string[]=[];
  try{for(const item of selectedPending){try{await decision(item.id,"approve","");succeeded++;}catch(e){failed.push(`${item.class_name} — ${item.subject_name}: ${e instanceof Error?e.message:"Network error"}`);}}
   setSelected(failed.length?selectedPending.filter(x=>failed.some(f=>f.startsWith(`${x.class_name} — ${x.subject_name}:`))).map(x=>x.id):[]);
   setReviewed(old=>old.filter(id=>!selectedPending.some(x=>x.id===id && !failed.some(f=>f.startsWith(`${x.class_name} — ${x.subject_name}:`)))));
   toast(`${succeeded} approved; ${failed.length} failed.`,failed.length?"err":"ok");setError(failed.join(" | "));await load();
  }finally{setBusy(false);}
 }
 return <main className="s14 s14-admin">
  <div className="s14-intro"><div><div className="s14-eyebrow">ACADEMICS / ASSESSMENT</div><h1>Score Approvals</h1><p>Review submitted score sheets and approve only those you select.</p></div><button className="s14-outline" type="button" disabled={busy||loading} onClick={()=>void load()}>Refresh submissions</button></div>
  <section className="s14-stats"><div><span>Pending review</span><strong>{pending.length}</strong><small>Awaiting a decision</small></div><div><span>Approved</span><strong>{items.filter(x=>x.status==="approved").length}</strong><small>Locked score sheets</small></div><div><span>Returned</span><strong>{items.filter(x=>x.status==="returned").length}</strong><small>Sent for correction</small></div></section>
  {error&&<div className="s14-error" role="alert">{error}</div>}

  <section className="s14-panel s14-sheet s14-admin-requests"><div className="s14-sheet-heading"><div><h2>Teacher submissions</h2><p>Review submitted scores before approving or returning them.</p></div><div className="s14-filters"><label htmlFor="s14-filter">Show</label><select id="s14-filter" value={filter} onChange={e=>setFilter(e.target.value as Filter)}>{["pending","all","approved","returned","withdrawn"].map(x=><option key={x} value={x}>{x === "all" ? "All submissions" : x[0].toUpperCase()+x.slice(1)}</option>)}</select></div></div>
   {!!pending.length && <div className="s14-admin-bulk"><div className="s14-select-tools"><label><input type="checkbox" checked={!!allVisiblePending.length&&allVisiblePending.every(x=>selected.includes(x.id))} disabled={busy||!allVisiblePending.length} onChange={e=>setSelected(old=>e.target.checked?[...new Set([...old,...allVisiblePending.map(x=>x.id)])]:old.filter(id=>!allVisiblePending.some(x=>x.id===id)))}/> Select visible pending</label><button disabled={busy||!selectedPending.length} onClick={()=>void approveSelected()}>{busy?"Processing…":`Approve Selected (${selectedPending.length})`}</button></div></div>}
   {loading?<p className="s14-empty">Loading score submissions…</p>:visible.length ? <><div className="s14-table-scroll"><table className="s14-table"><thead><tr><th>Select</th><th>Class</th><th>Subject</th><th>Teacher</th><th>Status</th><th>Submitted</th><th>Action</th></tr></thead><tbody>{visible.map(item=><tr key={item.id}><td>{item.status==="pending"&&<input aria-label={`Select ${item.class_name} ${item.subject_name}`} type="checkbox" checked={selected.includes(item.id)} disabled={busy} onChange={e=>setSelected(old=>e.target.checked?[...old,item.id]:old.filter(id=>id!==item.id))}/>}</td><td><strong>{item.class_name}</strong></td><td>{item.subject_name}</td><td>{item.teacher_name}</td><td><span className={`s14-pill s14-${item.status}`}>{item.status}</span>{item.review_note&&<p className="s14-note">{item.review_note}</p>}</td><td>{item.submitted_at?new Date(item.submitted_at).toLocaleDateString():"—"}</td><td><div className="s14-actions"><button className="secondary" disabled={busy} onClick={()=>void openReview(item.id)}>Review Scores</button>{item.status==="pending"&&<><button disabled={busy} onClick={()=>void act(item,"approve")}>Approve</button><button className="secondary" disabled={busy} onClick={()=>void act(item,"return")}>Return</button></>}</div></td></tr>)}</tbody></table></div>
   <div className="s14-mobile-cards">{visible.map(item=><article key={item.id} className="s14-mobile-card"><div className="s14-mobile-card-head"><div><small>{item.submitted_at?new Date(item.submitted_at).toLocaleDateString():"NOT SUBMITTED"}</small><h3>{item.class_name}</h3><p>{item.subject_name}</p></div><span className={`s14-pill s14-${item.status}`}>{item.status}</span></div><p>Teacher: {item.teacher_name}</p>{item.review_note&&<p className="s14-note">Admin note: {item.review_note}</p>}<div className="s14-actions"><button className="secondary" disabled={busy} onClick={()=>void openReview(item.id)}>Review Scores</button></div>{item.status==="pending"&&<><label className="s14-mobile-check"><input type="checkbox" checked={selected.includes(item.id)} disabled={busy} onChange={e=>setSelected(old=>e.target.checked?[...old,item.id]:old.filter(id=>id!==item.id))}/> Select for bulk approval</label><div className="s14-actions"><button disabled={busy} onClick={()=>void act(item,"approve")}>Approve</button><button className="secondary" disabled={busy} onClick={()=>void act(item,"return")}>Return to teacher</button></div></>}</article>)}</div>
   </> : <div className="s14-admin-empty" role="status"><span className="s14-admin-empty-icon" aria-hidden="true">✓</span><h3>{items.length === 0 ? "No submissions yet" : "No matching submissions"}</h3><p>{items.length === 0 ? "Teacher score submissions will appear here for review." : "No submissions match the selected filter."}</p></div>}
  </section>
  {reviewId && <div className="s14-review-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)closeReview();}}>
   <section className="s14-review-dialog" role="dialog" aria-modal="true" aria-label="Review submitted scores">
    <div className="s14-review-heading"><div><span className="s14-eyebrow">ACADEMICS / SCORE REVIEW</span><h2>Review submitted scores</h2><p>Inspect student marks before making an approval decision.</p></div><button className="secondary" type="button" onClick={closeReview} disabled={busy}>Close</button></div>
    {reviewLoading?<p className="s14-empty">Loading student scores…</p>:reviewError?<div className="s14-error" role="alert">{reviewError}<button type="button" onClick={()=>void openReview(reviewId)}>Retry</button></div>:review&&<>
     <div className="s14-review-details"><div><small>Class</small><strong>{review.submission.class_name}</strong></div><div><small>Subject</small><strong>{review.submission.subject_name}</strong></div><div><small>Teacher</small><strong>{review.submission.teacher_name}</strong></div><div><small>Academic term</small><strong>{review.submission.term_label}</strong></div><div><small>Status</small><span className={`s14-pill s14-${review.submission.status}`}>{review.submission.status}</span></div></div>
     <div className="s14-review-summary"><strong>{review.complete} / {review.total} students complete</strong><span className={review.ready?"s14-review-ok":"s14-review-warning"}>{review.ready?"All scores complete":"Missing or invalid scores — approval blocked"}</span></div>
     <div className="s14-review-search"><input aria-label="Search reviewed students" placeholder="Search student name or ID…" value={reviewSearch} onChange={e=>setReviewSearch(e.target.value)}/></div>
     <div className="s14-review-table-wrap"><table className="s14-table s14-review-table"><thead><tr><th>Student</th><th>Student ID</th><th>CA / 40</th><th>Exam / 60</th><th>Total / 100</th><th>Check</th></tr></thead><tbody>{reviewRows.map(row=><tr key={row.student_id}><td><strong>{row.name}</strong></td><td>{row.login_id}</td><td>{row.ca??"—"}</td><td>{row.exam??"—"}</td><td><strong>{row.total??"—"}</strong></td><td><span className={row.complete?"s14-review-ok":"s14-review-warning"}>{row.complete?"Complete":row.issue}</span></td></tr>)}</tbody></table>{!reviewRows.length&&<p className="s14-empty">No matching students.</p>}</div>
     <div className="s14-review-footer"><span>Read-only review. Scores must be edited by the teacher.</span><div className="s14-actions"><button type="button" className="secondary" disabled={busy} onClick={closeReview}>Close</button>{review.submission.status==="pending"&&<><button type="button" className="secondary" disabled={busy} onClick={()=>{setReviewId(null);setReview(null);void act(review.submission,"return");}}>Return to teacher</button><button type="button" disabled={busy||!review.ready} onClick={()=>{setReviewed(old=>[...new Set([...old,review.submission.id])]);toast("Score sheet reviewed. You can now approve it.","ok");closeReview();}}>Mark Reviewed</button></>}</div></div>
    </>}
   </section>
  </div>}
 </main>;
}
