import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const COLUMNS =
  "id, login_id, name, class, term, session, subject_count, total, average, grade, school_remark, teacher_remark, subjects, created_at";

export async function POST(request: Request) {
  let body: { loginId?: unknown; pin?: unknown; resultId?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  const loginId = String(body.loginId ?? "").trim();
  const pin = String(body.pin ?? "").trim();
  const resultId =
    body.resultId === undefined || body.resultId === null
      ? null
      : Number(body.resultId);

  if (
    !loginId ||
    loginId.length > 50 ||
    !/^\d{4}$/.test(pin) ||
    (resultId !== null && !Number.isInteger(resultId))
  ) {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    console.error("Missing Supabase environment variables");
    return NextResponse.json({ status: "error" }, { status: 500 });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // 1. Verify Login ID + PIN exactly as before.
  const { data, error } = await supabase.rpc("get_result", {
    p_login_id: loginId,
    p_pin: pin,
  });

  if (error) {
    console.error("get_result failed:", error.message);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
  if (!data || data.status !== "ok") {
    return NextResponse.json(data);
  }

  // 2. Build the term list: this ID, plus a deliberately linked previous ID.
  const ids = [loginId];
  const { data: stu } = await supabase
    .from("students")
    .select("previous_login_id")
    .eq("login_id", loginId)
    .maybeSingle();
  if (stu?.previous_login_id) ids.push(stu.previous_login_id);

  const { data: rows } = await supabase
    .from("student_results")
    .select("id, term, session, created_at")
    .in("login_id", ids)
    .order("created_at", { ascending: false });

  const terms = (rows ?? []).map((r) => ({
    id: r.id as number,
    term: r.term as string,
    session: r.session as string,
  }));

  // 3. Specific term requested: only allowed from the verified ID set.
  if (resultId !== null) {
    const { data: row } = await supabase
      .from("student_results")
      .select(COLUMNS)
      .eq("id", resultId)
      .in("login_id", ids)
      .maybeSingle();
    if (!row) return NextResponse.json({ status: "invalid" });
    return NextResponse.json({ status: "ok", student: row, terms });
  }

  return NextResponse.json({ ...data, terms });
}
