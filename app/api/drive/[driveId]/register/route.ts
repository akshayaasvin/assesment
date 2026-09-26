import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, fail } from "@/lib/api-response";
import { getSessionUser, isDriveOpen } from "@/lib/drive/server";

const currentYear = new Date().getFullYear();

const bodySchema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name.").max(120),
    email: z.string().trim().toLowerCase().email("Enter a valid email address."),
    phone: z
      .string()
      .trim()
      .refine((v) => /^\+?[\d\s-]{10,16}$/.test(v) && v.replace(/\D/g, "").length >= 10, "Enter a valid phone number."),
    college: z.string().trim().min(2, "Enter your college.").max(200),
    degree: z.string().trim().min(2, "Enter your degree.").max(100),
    branch: z.string().trim().min(2, "Enter your branch.").max(100),
    graduationYear: z.coerce.number().int().min(1970).max(currentYear + 6, "Enter a valid graduation year."),
    candidateType: z.enum(["fresher", "experienced"]),
    yearsExperience: z.coerce.number().min(0).max(60).nullable().optional(),
    currentCompany: z.string().trim().max(200).nullable().optional(),
    resumePath: z.string().max(300).nullable().optional(),
    consent: z.literal(true, { message: "Please accept the monitoring and data-use consent." }),
  })
  .refine((v) => v.candidateType === "fresher" || (v.yearsExperience ?? null) !== null, {
    message: "Enter your years of experience.",
  });

/**
 * Registers the browser's anonymous Supabase user as a candidate in this drive.
 * One registration per email and per phone per drive (enforced by unique
 * indexes, so it also holds under concurrent submits).
 */
export async function POST(request: Request, context: { params: Promise<{ driveId: string }> }) {
  const { driveId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the form.", 400);
  const input = parsed.data;

  const user = await getSessionUser();
  if (!user) return fail("Your session expired. Please reload the page.", 401);
  if (!user.is_anonymous) return fail("Please sign out of the admin panel in this browser before registering.", 403);
  if (input.resumePath && !input.resumePath.startsWith(`${user.id}/`)) return fail("Invalid resume upload.", 400);

  try {
    const admin = createAdminClient();
    const { data: drive, error: driveError } = await admin.from("drives").select("id, status, start_at, end_at").eq("id", driveId).maybeSingle();
    if (driveError) throw driveError;
    if (!drive || !isDriveOpen(drive)) return fail("This drive is not open for registration right now.", 403);

    const { data: existing, error: existingError } = await admin
      .from("candidates")
      .select("id, drive_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.drive_id === driveId) return ok({ candidateId: existing.id }); // double submit / retry
    if (existing) return fail("This browser is already registered for another drive.", 409);

    const { data: candidate, error } = await admin
      .from("candidates")
      .insert({
        drive_id: driveId,
        auth_user_id: user.id,
        name: input.name,
        email: input.email,
        phone: input.phone,
        college: input.college,
        degree: input.degree,
        branch: input.branch,
        graduation_year: input.graduationYear,
        candidate_type: input.candidateType,
        years_experience: input.candidateType === "experienced" ? (input.yearsExperience ?? null) : null,
        current_company: input.currentCompany || null,
        resume_path: input.resumePath || null,
        consent_at: new Date().toISOString(),
        status: "registered",
      })
      .select("id")
      .single();

    if (error?.code === "23505") {
      const detail = `${error.message} ${error.details ?? ""}`;
      if (detail.includes("phone")) return fail("This phone number is already registered in this drive.", 409);
      return fail("This email is already registered in this drive.", 409);
    }
    if (error || !candidate) throw error ?? new Error("Candidate insert returned no row.");

    return ok({ candidateId: candidate.id }, 201);
  } catch (e) {
    console.error("[drive] register failed:", e);
    return fail("Could not register. Please try again.", 500);
  }
}
