/**
 * Creates the first (or another) admin login. Requires Supabase keys in .env.local.
 *
 * Usage: npm run create-admin -- admin@company.com "StrongPassword123"
 */
import { supabaseAdmin as supabase } from "./supabase-admin-client";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error('Usage: npm run create-admin -- admin@company.com "StrongPassword123"');
  process.exit(1);
}

async function main() {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    console.error(`Could not create the auth user: ${error?.message}`);
    process.exit(1);
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .upsert({ id: data.user.id, email, role: "admin" }, { onConflict: "id" });
  if (profileError) {
    console.error(`User created, but the admin profile failed: ${profileError.message}`);
    process.exit(1);
  }

  console.log(`Admin account ready: ${email}`);
}

main();
