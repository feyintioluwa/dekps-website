import { NextResponse } from "next/server";
import { adminClient } from "@/lib/admin";

// A class teacher is only allowed for Creche up to Basic 6 (sort_order 85 or lower).
// JSS and SSS have subject teachers only.
const CLASS_TEACHER_MAX_ORDER = 85;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: Request) {
  const c = adminClient(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const { sb } = c;

  const [classes, subjects, cs, teachers, ts, tc] = await Promise.all([
    sb.from("classes").select("id, name, sort_order").order("sort_order"),
    sb.from("subjects").select("id, name").order("name"),
    sb.from("class_subjects").select("class_id, subject_id"),
    sb.from("teachers").select("id, name, email, is_active, created_at").order("name"),
    sb.from("teacher_subjects").select("teacher_id, class_id, subject_id"),
    sb.from("teacher_classes").select("teacher_id, class_id"),
  ]);
  if (teachers.error) {
    return NextResponse.json({ error: "The teacher tables are not set up yet: " + teachers.error.message }, { status: 500 });
  }
  return NextResponse.json({
    classes: classes.data ?? [],
    subjects: subjects.data ?? [],
    classSubjects: cs.data ?? [],
    classTeacherMaxOrder: CLASS_TEACHER_MAX_ORDER,
    teachers: (teachers.data ?? []).map((t) => ({
      ...t,
      classTeacher: (tc.data ?? []).filter((x) => x.teacher_id === t.id).map((x) => x.class_id),
      subjects: (ts.data ?? []).filter((x) => x.teacher_id === t.id).map((x) => ({ class_id: x.class_id, subject_id: x.subject_id })),
    })),
  });
}

export async function POST(request: Request) {
  const c = adminClient(request);
  if ("error" in c) return NextResponse.json({ error: c.error }, { status: c.status });
  const { sb } = c;
  const b = await request.json().catch(() => null);
  if (!b) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const fail = (m: string, s = 500) => NextResponse.json({ error: m }, { status: s });

  // ---------- add a teacher: creates the login and the teacher record ----------
  if (b.action === "create") {
    const name = String(b.name ?? "").trim();
    const email = String(b.email ?? "").trim().toLowerCase();
    const password = String(b.password ?? "");
    if (!name) return fail("Enter the teacher's name", 400);
    if (!EMAIL.test(email)) return fail("Enter a valid email address", 400);
    if (password.length < 8) return fail("The password must be at least 8 characters", 400);

    const { data: dup } = await sb.from("teachers").select("id").eq("email", email).maybeSingle();
    if (dup) return fail("A teacher with that email already exists", 400);

    const { data: u, error: ue } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
    if (ue || !u?.user) return fail(ue?.message ?? "Could not create the login", 400);

    const { data, error } = await sb.from("teachers").insert({ auth_user_id: u.user.id, name, email }).select("id").single();
    if (error) {
      await sb.auth.admin.deleteUser(u.user.id); // undo the login we just made, so nothing is left half-created
      return fail(error.message);
    }
    return NextResponse.json({ ok: true, id: data.id });
  }

  // ---------- name ----------
  if (b.action === "rename") {
    const name = String(b.name ?? "").trim();
    if (!b.id || !name) return fail("Enter a name", 400);
    const { error } = await sb.from("teachers").update({ name }).eq("id", String(b.id));
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
  }

  // ---------- switch a teacher off or on (nothing is deleted) ----------
  if (b.action === "setActive") {
    if (!b.id) return fail("Missing teacher", 400);
    const { error } = await sb.from("teachers").update({ is_active: !!b.value }).eq("id", String(b.id));
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true });
  }

  // ---------- set a new password for a teacher ----------
  if (b.action === "resetPassword") {
    const password = String(b.password ?? "");
    if (!b.id) return fail("Missing teacher", 400);
    if (password.length < 8) return fail("The password must be at least 8 characters", 400);
    const { data: t } = await sb.from("teachers").select("auth_user_id").eq("id", String(b.id)).maybeSingle();
    if (!t?.auth_user_id) return fail("This teacher has no login yet", 400);
    const { error } = await sb.auth.admin.updateUserById(t.auth_user_id, { password });
    if (error) return fail(error.message, 400);
    return NextResponse.json({ ok: true });
  }

  // ---------- class teacher: the whole set of classes (Creche to Basic 6 only) ----------
  if (b.action === "setClassTeacher") {
    if (!b.id) return fail("Missing teacher", 400);
    const want = [...new Set(((b.classIds ?? []) as string[]).map(String))];
    if (want.length) {
      const { data: ok } = await sb.from("classes").select("id").in("id", want).lte("sort_order", CLASS_TEACHER_MAX_ORDER);
      if ((ok ?? []).length !== want.length) return fail("A class teacher can only be set for Creche to Basic 6", 400);
    }
    const { data: have } = await sb.from("teacher_classes").select("class_id").eq("teacher_id", String(b.id));
    const haveSet = new Set((have ?? []).map((r) => r.class_id));
    const toAdd = want.filter((id) => !haveSet.has(id));
    const toRemove = [...haveSet].filter((id) => !want.includes(id));
    if (toRemove.length) {
      const { error } = await sb.from("teacher_classes").delete().eq("teacher_id", String(b.id)).in("class_id", toRemove);
      if (error) return fail(error.message);
    }
    if (toAdd.length) {
      const { error } = await sb.from("teacher_classes").insert(toAdd.map((class_id) => ({ teacher_id: String(b.id), class_id })));
      if (error) return fail(error.message);
    }
    return NextResponse.json({ ok: true });
  }

  // ---------- subject teacher: the whole set of subjects this teacher teaches in ONE class ----------
  if (b.action === "setSubjects") {
    if (!b.id || !b.classId) return fail("Choose a teacher and a class", 400);
    const want = [...new Set(((b.subjectIds ?? []) as string[]).map(String))];
    if (want.length) {
      const { data: ok } = await sb.from("class_subjects").select("subject_id").eq("class_id", String(b.classId)).in("subject_id", want);
      if ((ok ?? []).length !== want.length) return fail("Some of those subjects are not taught in that class", 400);
    }
    const { data: have } = await sb.from("teacher_subjects").select("subject_id").eq("teacher_id", String(b.id)).eq("class_id", String(b.classId));
    const haveSet = new Set((have ?? []).map((r) => r.subject_id));
    const toAdd = want.filter((id) => !haveSet.has(id));
    const toRemove = [...haveSet].filter((id) => !want.includes(id));
    if (toRemove.length) {
      const { error } = await sb.from("teacher_subjects").delete()
        .eq("teacher_id", String(b.id)).eq("class_id", String(b.classId)).in("subject_id", toRemove);
      if (error) return fail(error.message);
    }
    if (toAdd.length) {
      const { error } = await sb.from("teacher_subjects")
        .insert(toAdd.map((subject_id) => ({ teacher_id: String(b.id), class_id: String(b.classId), subject_id })));
      if (error) return fail(error.message);
    }
    return NextResponse.json({ ok: true });
  }

  return fail("Unknown action", 400);
}