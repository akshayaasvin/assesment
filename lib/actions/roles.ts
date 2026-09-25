"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { NOT_FOUND_OR_FORBIDDEN, toUserError } from "@/lib/db-errors";

export async function createRole(formData: FormData) {
  const key = String(formData.get("key") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  if (!key || !label) return { error: "Key and label are required." };
  if (/\s/.test(key)) return { error: "Key can't contain spaces." };

  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const { error } = await auth.supabase.from("roles").insert({ key, label });
  if (error) {
    if (error.code === "23505") return { error: "A role with this key already exists." };
    return { error: toUserError(error, "Unable to create role.") };
  }

  revalidatePath("/admin/roles");
  return { success: true };
}

export async function updateRole(id: string, formData: FormData) {
  const key = String(formData.get("key") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  if (!key || !label) return { error: "Key and label are required." };
  if (/\s/.test(key)) return { error: "Key can't contain spaces." };

  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const { data: updated, error } = await auth.supabase.from("roles").update({ key, label }).eq("id", id).select("id");
  if (error) {
    if (error.code === "23505") return { error: "A role with this key already exists." };
    return { error: toUserError(error, "Unable to save role.") };
  }
  if (!updated?.length) return { error: NOT_FOUND_OR_FORBIDDEN };

  revalidatePath("/admin/roles");
  return { success: true };
}

export async function toggleRoleActive(id: string, isActive: boolean) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const { data: updated, error } = await auth.supabase
    .from("roles")
    .update({ is_active: isActive })
    .eq("id", id)
    .select("id");
  if (error) return { error: toUserError(error, "Unable to update role.") };
  if (!updated?.length) return { error: NOT_FOUND_OR_FORBIDDEN };

  revalidatePath("/admin/roles");
  return { success: true };
}

export async function deleteRole(id: string) {
  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  // assessments.role_id is ON DELETE SET NULL, so assessments survive this.
  const { data: deleted, error } = await auth.supabase.from("roles").delete().eq("id", id).select("id");
  if (error) return { error: toUserError(error, "Unable to delete role.") };
  if (!deleted?.length) return { error: NOT_FOUND_OR_FORBIDDEN };

  revalidatePath("/admin/roles");
  return { success: true };
}
