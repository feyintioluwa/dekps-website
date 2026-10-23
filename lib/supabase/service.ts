import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS, so it must only be used on the server,
 * and every caller is responsible for authorising the request first.
 */
export function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY");
  }

  return createClient(url, key, { auth: { persistSession: false } });
}
