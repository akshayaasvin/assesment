"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createCategory(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Category name is required." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .upsert({ name: trimmed }, { onConflict: "name" })
    .select("id, name")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/admin/question-bank");
  return { success: true, category: data };
}
