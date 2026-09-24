"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createRole(formData: FormData) {
  const key = String(formData.get("key") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  if (!key || !label) return { error: "Key and label are required." };

  const supabase = await createClient();
  const { error } = await supabase.from("roles").insert({ key, label });
  if (error) return { error: error.message.includes("duplicate") ? "A role with this key already exists." : error.message };

  revalidatePath("/admin/roles");
  return { success: true };
}

export async function updateRole(id: string, formData: FormData) {
  const key = String(formData.get("key") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  if (!key || !label) return { error: "Key and label are required." };

  const supabase = await createClient();
  const { error } = await supabase.from("roles").update({ key, label }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/roles");
  return { success: true };
}

export async function toggleRoleActive(id: string, isActive: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("roles").update({ is_active: isActive }).eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin/roles");
  return { success: true };
}

export async function deleteRole(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("roles").delete().eq("id", id);
  if (error) return { error: "Could not delete this role - it may still be used by an assessment." };

  revalidatePath("/admin/roles");
  return { success: true };
}
