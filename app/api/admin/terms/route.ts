import { NextResponse } from "next/server";
import { adminClient } from "@/lib/admin";

const TERMS = ["First Term", "Second Term", "Third Term"];

// Tables that point at terms.term_id. If any of them has rows for a session's terms, the session cannot be deleted.
// (Four of them would be wiped by cascade, and student_results would lose its term link.)
const DATA_TABLES: { table: string; label: string }[] = [
  { table: "scores", label: "scores" },
  { table: "assessments", label: "tests" },
  { table: "assignments", label: "assignments" },
  { table: "student_remarks", label: "remarks" },
  { table: "student_results", label: "published results" },
];

export async function GET(request: Request) {
  const c = adminClient(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const { data, error } = await c.sb.from("terms").select("id, session, term, is_active, is_locked, is_published");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ terms: data ?? [] });
}

export async function POST(request: Request) {
  const c = adminClient(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const { sb } = c;
  const b = await request.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const fail = (m: string, s = 500) => NextResponse.json({ error: m }, { status: s });

  // Add a session: creates First, Second and Third Term (skips any that already exist)
  if (b.action === "addSession") {
    const session = String(b.session ?? "").trim();
    const m = session.match(/^(\d{4})\/(\d{4})$/);
    if (!m || Number(m[2]) !== Number(m[1]) + 1) return fail("Write the session like 2027/2028", 400);
    const { data: have, error: e1 } = await sb.from("terms").select("term").eq("session", session);
    if (e1) return fail(e1.message);
    const existing = new Set((have ?? []).map((r) => r.term));
    const rows = TERMS.filter((t) => !existing.has(t)).map((term) => ({
      session, term, is_active: false, is_locked: false, is_published: false,
    }));
    if (!rows.length) return fail("That session already has all three terms", 400);
    const { error } = await sb.from("terms").insert(rows);
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true, added: rows.length });
  }

  // Delete a session (all its terms), only if it is empty: not current, no scores, tests, assignments, remarks or results
  if (b.action === "deleteSession") {
    const session = String(b.session ?? "").trim();
    if (!session) return fail("Missing session", 400);
    const { data: rows, error: e1 } = await sb.from("terms").select("id, is_active").eq("session", session);
    if (e1) return fail(e1.message);
    if (!rows || !rows.length) return fail("That session was not found", 404);
    if (rows.some((r) => r.is_active)) return fail("This session has the current term. Make another term current first.", 400);

    const ids = rows.map((r) => r.id);
    const used: string[] = [];
    for (const { table, label } of DATA_TABLES) {
      const { count, error } = await sb.from(table).select("*", { count: "exact", head: true }).in("term_id", ids);
      if (error) return fail(`Could not check ${label}: ${error.message}`);
      if (count && count > 0) used.push(label);
    }
    if (used.length) return fail(`Cannot delete ${session}. It still has ${used.join(", ")}.`, 400);

    const { error: e2 } = await sb.from("terms").delete().in("id", ids);
    if (e2) return fail(e2.message);
    return NextResponse.json({ ok: true, deleted: ids.length });
  }

  // Make one term the current term (all others become not current)
  if (b.action === "setActive") {
    if (!b.id) return fail("Missing term", 400);
    const { error: e1 } = await sb.from("terms").update({ is_active: false }).eq("is_active", true);
    if (e1) return fail(e1.message);
    const { error: e2 } = await sb.from("terms").update({ is_active: true }).eq("id", b.id);
    if (e2) return fail(e2.message);
    return NextResponse.json({ ok: true });
  }

  // Lock or unlock a term
  if (b.action === "lock") {
    if (!b.id) return fail("Missing term", 400);
    const { error } = await sb.from("terms").update({ is_locked: !!b.value }).eq("id", b.id);
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
  }

  return fail("Unknown action", 400);
}