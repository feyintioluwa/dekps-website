"use server";

import { createClient as createAdminClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

function admin() {
  return createAdminClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } }
  );
}

function makeLoginId(name: string) {
  const clean = name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${clean.slice(0, 10)}${suffix}`;
}

export async function addStudent(formData: FormData) {
  const supabase = admin();

  const name = String(formData.get("name") || "").trim();
  const classId = String(formData.get("class_id") || "");
  const stream = String(formData.get("stream") || "").trim() || null;
  const rawPin = String(formData.get("pin") || "").trim();

  if (!name) return { ok: false, error: "Name is required." };
  if (!classId) return { ok: false, error: "Class is required." };
  if (!/^\d{4}$/.test(rawPin)) return { ok: false, error: "PIN must be exactly 4 digits." };

  const loginId = makeLoginId(name);

  // 1. Hash the PIN using the DB function
  const { data: hashedPin, error: hashErr } = await supabase.rpc("hash_pin", { p_pin: rawPin });
  if (hashErr) return { ok: false, error: "Failed to hash PIN." };

  // 2. Insert the student
  const { data, error } = await supabase
    .from("students")
    .insert({
      name,
      login_id: loginId,
      class_id: classId,
      stream: stream || null,
      is_active: true,
      pin_hash: hashedPin,
    })
    .select()
    .single();

  if (error) {
    console.error("Add student error:", error);
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/students");
  return { ok: true, student: data, pin: rawPin };
}