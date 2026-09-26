/**
 * Chooses which Supabase project a script (or the e2e/load tests) talk to.
 *
 * Default: LOCAL Supabase (`supabase start`), via .env.test.local, which
 * scripts/local-setup.ts generates. Override the file with SUPABASE_ENV_FILE.
 *
 * Production is refused unless BOTH are given, deliberately, for the
 * approved cutover steps:
 *   --production                                 on the command line, and
 *   CONFIRM_PRODUCTION=<production project ref>  in the environment.
 */
import { existsSync } from "node:fs";
import { config } from "dotenv";

export const PRODUCTION_PROJECT_REF = "ieqrugvsgjpidrrsqufn";
export const DEFAULT_ENV_FILE = ".env.test.local";

export function isProductionUrl(url: string | undefined) {
  return (url ?? "").includes(PRODUCTION_PROJECT_REF);
}

/** Loads the target env file into process.env and enforces the production guard. Returns the file used. */
export function loadTargetEnv({ allowProductionFlag = true }: { allowProductionFlag?: boolean } = {}): string {
  const wantsProduction = process.argv.includes("--production");
  const file = process.env.SUPABASE_ENV_FILE ?? (wantsProduction ? ".env.local" : DEFAULT_ENV_FILE);
  if (!existsSync(file)) {
    throw new Error(
      `${file} not found. For local Supabase run \`supabase start\` then \`npx tsx scripts/local-setup.ts\` (see README).`
    );
  }
  config({ path: file, override: true, quiet: true });

  if (isProductionUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
    const confirmed = wantsProduction && allowProductionFlag && process.env.CONFIRM_PRODUCTION === PRODUCTION_PROJECT_REF;
    if (!confirmed) {
      throw new Error(
        `Refusing to run against the PRODUCTION Supabase project (${PRODUCTION_PROJECT_REF}).` +
          (allowProductionFlag ? ` Approved cutover steps only: pass --production and set CONFIRM_PRODUCTION=${PRODUCTION_PROJECT_REF}.` : "")
      );
    }
    console.warn(`!! PRODUCTION project ${PRODUCTION_PROJECT_REF} - approved cutover step.`);
  }
  return file;
}

/** Positional CLI arguments, without flags like --production / --apply. */
export function positionalArgs() {
  return process.argv.slice(2).filter((a) => !a.startsWith("--"));
}
