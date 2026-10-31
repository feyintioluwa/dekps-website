import { createClient as createAdminClient } from "@supabase/supabase-js";
import ScoreEntryForm from "./ScoreEntryForm";

function admin() {
  return createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );
}

export default async function ScoresPage() {
  const supabase = admin();

  // Fetch classes, subjects, and terms so the dropdowns have options
  const { data: classes } = await supabase.from("classes").select("id, name").order("sort_order");
  const { data: subjects } = await supabase.from("subjects").select("id, name").order("name");
  const { data: terms } = await supabase.from("terms").select("id, term, session").order("created_at", { ascending: false });

  return (
    <div className="dashboard-container">
      <div className="page-header">
        <h1>Score Entry</h1>
        <p className="subtitle">Enter CA and Exam scores for a specific class and subject.</p>
      </div>

      {/* This renders the client-side form and table */}
      <ScoreEntryForm 
        classes={classes || []} 
        subjects={subjects || []} 
        terms={terms || []} 
      />
    </div>
  );
}