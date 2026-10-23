import { NextResponse } from "next/server";
import { connection } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Public: returns only the current term and session names (no private data).
export async function GET() {
  await connection(); // always read fresh from the database
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return NextResponse.json({ session: null, term: null });
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data } = await sb
    .from("terms")
    .select("term, session")
    .eq("is_active", true)
    .limit(1);
  const t = data?.[0];
  return NextResponse.json({ session: t?.session ?? null, term: t?.term ?? null });
}