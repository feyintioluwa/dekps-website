import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  let body: { loginId?: unknown; pin?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  const loginId = String(body.loginId ?? "").trim();
  const pin = String(body.pin ?? "").trim();

  if (!loginId || loginId.length > 50 || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    console.error("Missing Supabase environment variables");
    return NextResponse.json({ status: "error" }, { status: 500 });
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc("get_result", {
    p_login_id: loginId,
    p_pin: pin,
  });

  if (error) {
    console.error("get_result failed:", error.message);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }

  return NextResponse.json(data);
}