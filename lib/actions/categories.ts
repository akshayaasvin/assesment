"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { toUserError } from "@/lib/db-errors";

export async function createCategory(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Category name is required." };

  const auth = await requireAdmin();
  if (!auth.ok) return { error: auth.error };

  const { data, error } = await auth.supabase
    .from("categories")
    .upsert({ name: trimmed }, { onConflict: "name" })
    .select("id, name")
    .single();
  if (error) return { error: toUserError(error, "Unable to create category.") };

  revalidatePath("/admin/question-bank");
  return { success: true, category: data };
}
