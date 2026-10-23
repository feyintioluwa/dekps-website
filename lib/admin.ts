import { createClient } from "@supabase/supabase-js";

// ADMIN_KEY may hold several keys separated by commas (one per teacher/admin).
export function adminClient(request: Request) {
  const keys = (process.env.ADMIN_KEY ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!keys.length || !url || !key) return { error: "Server not configured", status: 500 as const };
  if (!keys.includes(request.headers.get("x-admin-key") ?? ""))
    return { error: "Wrong admin key", status: 401 as const };
  const sb = createClient(url, key, { auth: { persistSession: false } });
  return { sb, supabase: sb };
}
