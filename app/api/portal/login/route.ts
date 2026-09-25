import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api-response";
import { normalizeEmail, samePhone } from "@/lib/portal/access";
import { setCandidateSession } from "@/lib/portal/session";

const bodySchema = z.object({
  email: z.string().trim().email(),
  phone: z.string().trim().min(1),
});

/** Signs a returning candidate back in with the email + phone they registered with. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("Enter your registered email and phone number.", 400);

  try {
    const admin = createAdminClient();
    const { data: candidate, error } = await admin
      .from("candidates")
      .select("id, phone")
      .eq("email", normalizeEmail(parsed.data.email))
      .maybeSingle();
    if (error) throw error;

    // Same message for "no such email" and "wrong phone" so emails can't be probed.
    if (!candidate || !samePhone(candidate.phone, parsed.data.phone)) {
      return fail("No registration found for that email and phone number.", 401);
    }

    await setCandidateSession(candidate.id);
    return ok({ candidateId: candidate.id });
  } catch (e) {
    console.error("[portal] login failed:", e);
    return fail("Could not sign you in. Please try again.", 500);
  }
}
