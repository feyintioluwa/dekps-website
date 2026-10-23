import { NextResponse } from "next/server";
import { adminClient } from "@/lib/admin";

export async function GET(request: Request) {
  const c = adminClient(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const { sb } = c;
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const [students, classes, results, assessments, attempts] = await Promise.all([
    count(sb.from("students").select("id", { count: "exact", head: true }).eq("is_active", true)),
    count(sb.from("classes").select("id", { count: "exact", head: true })),
    count(sb.from("student_results").select("id", { count: "exact", head: true })),
    count(sb.from("assessments").select("id", { count: "exact", head: true })),
    count(sb.from("attempts").select("id", { count: "exact", head: true }).not("submitted_at", "is", null)),
  ]);
  return NextResponse.json({ students, classes, results, assessments, attempts });
}
