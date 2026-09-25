import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api-response";
import { normalizeEmail } from "@/lib/portal/access";
import { setCandidateSession } from "@/lib/portal/session";

const bodySchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  phone: z.string().trim().regex(/\d{6,}/, "Enter a valid phone number."),
  college: z.string().trim().min(1),
  district: z.string().trim().min(1),
  department: z.string().trim().min(1),
});

/** Creates a candidate account and signs them in. Existing emails must log in instead. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Please fill in all fields with valid values.", 400);
  const { name, phone, college, district, department } = parsed.data;
  const email = normalizeEmail(parsed.data.email);

  try {
    const admin = createAdminClient();
    const { data: existing, error: findError } = await admin.from("candidates").select("id").eq("email", email).maybeSingle();
    if (findError) throw findError;
    if (existing) return fail("This email is already registered. Please log in with your email and phone number.", 409);

    const { data: candidate, error } = await admin
      .from("candidates")
      .insert({ name, email, phone, college, district, department })
      .select("id")
      .single();
    if (error?.code === "23505") {
      return fail("This email is already registered. Please log in with your email and phone number.", 409);
    }
    if (error || !candidate) throw error ?? new Error("Candidate insert returned no row.");

    await setCandidateSession(candidate.id);
    return ok({ candidateId: candidate.id }, 201);
  } catch (e) {
    console.error("[portal] register failed:", e);
    return fail("Could not register. Please try again.", 500);
  }
}
