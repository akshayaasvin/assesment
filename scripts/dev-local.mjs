// `npm run dev:local`: runs `next dev` against LOCAL Supabase (.env.test.local).
// Real environment variables beat .env.local in Next.js, so the production
// values in .env.local are overridden. Refuses the production project.
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { parse } from "dotenv";

const file = process.env.SUPABASE_ENV_FILE ?? ".env.test.local";
if (!existsSync(file)) {
  console.error(`${file} not found. Run \`supabase start\` then \`npx tsx scripts/local-setup.ts\`.`);
  process.exit(1);
}
const env = parse(readFileSync(file));
if ((env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes("ieqrugvsgjpidrrsqufn")) {
  console.error("Refusing: dev:local must not point at the PRODUCTION Supabase project.");
  process.exit(1);
}
const child = spawn("npx", ["next", "dev", ...process.argv.slice(2)], { stdio: "inherit", shell: true, env: { ...process.env, ...env } });
child.on("exit", (code) => process.exit(code ?? 0));
