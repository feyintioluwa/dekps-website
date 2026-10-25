import { connection } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Public: only notices for ALL classes that have not expired. Class-only notices never leave the student dashboard.
export async function GET() {
  await connection();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return NextResponse.json({ notices: [] });
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const nowIso = new Date().toISOString();
  const { data, error } = await sb.from("notices")
    .select("id, title, body, created_at")
    .is("class_id", null)
    .or(`hide_after.is.null,hide_after.gt.${nowIso}`)
    .order("created_at", { ascending: false })
    .limit(3);
  if (error) return NextResponse.json({ notices: [] });

  return NextResponse.json({
    notices: (data ?? []).map((x) => ({ id: x.id, title: x.title, body: x.body, postedAt: x.created_at })),
  });
}