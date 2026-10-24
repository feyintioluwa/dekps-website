import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Public answer for the home page: are results published for the CURRENT term?
// It returns only true or false. No student data leaves the server.
export async function GET(request: Request) {
  void request.url; // reading the request keeps this answer live, not cached
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const no = () => NextResponse.json({ resultsOpen: false }, { headers: { "Cache-Control": "no-store" } });
  if (!url || !key) return no();
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: terms } = await sb.from("terms").select("id, term, session").eq("is_active", true).limit(1);
  const t = terms?.[0];
  if (!t) return no();

  const byId = await sb.from("student_results").select("id", { count: "exact", head: true }).eq("term_id", t.id);
  let n = byId.count ?? 0;
  if (!n) {
    const byName = await sb.from("student_results").select("id", { count: "exact", head: true })
      .eq("term", t.term).eq("session", t.session);
    n = byName.count ?? 0;
  }
  return NextResponse.json({ resultsOpen: n > 0 }, { headers: { "Cache-Control": "no-store" } });
}