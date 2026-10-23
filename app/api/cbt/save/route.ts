import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase/service";
import {
  GRACE_MS,
  cleanAnswers,
  readJson,
  validAttemptId,
} from "@/lib/cbt-server";

export async function POST(request: Request) {
  const body = await readJson(request);
  const attemptId = validAttemptId(body?.attemptId);
  if (!body || !attemptId) {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  let db;
  try {
    db = getServiceClient();
  } catch {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }

  const { data } = await db
    .from("cbt_attempts")
    .select("id, status, expires_at, question_order")
    .eq("id", attemptId)
    .maybeSingle();

  const attempt = data as {
    id: string;
    status: string;
    expires_at: string;
    question_order: string[];
  } | null;

  if (!attempt) return NextResponse.json({ status: "invalid" }, { status: 404 });

  if (
    attempt.status !== "in_progress" ||
    Date.now() > new Date(attempt.expires_at).getTime() + GRACE_MS
  ) {
    return NextResponse.json({ status: "closed" });
  }

  const answers = cleanAnswers(body.answers, attempt.question_order);
  const { error } = await db
    .from("cbt_attempts")
    .update({ answers })
    .eq("id", attemptId)
    .eq("status", "in_progress");

  if (error) {
    console.error("cbt save failed:", error.message);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }

  return NextResponse.json({ status: "ok" });
}
