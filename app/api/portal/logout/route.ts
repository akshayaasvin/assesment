import { ok } from "@/lib/api-response";
import { clearCandidateSession } from "@/lib/portal/session";

export async function POST() {
  await clearCandidateSession();
  return ok({ signedOut: true });
}
