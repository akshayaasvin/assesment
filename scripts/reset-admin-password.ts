/**
 * Resets the admin account's password directly via the Supabase Admin API -
 * no email delivery involved, no code path in the app itself. Defaults to the
 * account configured in ADMIN_UID; pass an email as the second argument to
 * reset a different account instead.
 *
 * Usage:
 *   npm run reset-admin-password -- "NewStrongPassword123"
 *   npm run reset-admin-password -- "NewStrongPassword123" someone@else.com
 */
import { supabaseAdmin as supabase } from "./supabase-admin-client";

const [password, email] = process.argv.slice(2);

if (!password || password.length < 8) {
  console.error('Usage: npm run reset-admin-password -- "NewStrongPassword123" [email]');
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

async function resolveUserId(): Promise<{ id: string; email: string } | null> {
  if (email) {
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) {
      console.error(`Could not list users: ${error.message}`);
      return null;
    }
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!match) {
      console.error(`No user found with email ${email}.`);
      return null;
    }
    return { id: match.id, email: match.email ?? email };
  }

  const uid = process.env.ADMIN_UID;
  if (!uid) {
    console.error("ADMIN_UID is not set in .env.local, and no email was given.");
    console.error('Usage: npm run reset-admin-password -- "NewStrongPassword123" [email]');
    return null;
  }
  return { id: uid, email: "" };
}

async function main() {
  const target = await resolveUserId();
  if (!target) process.exit(1);

  const { data, error } = await supabase.auth.admin.updateUserById(target.id, { password });
  if (error) {
    console.error(`Could not update password: ${error.message}`);
    process.exit(1);
  }

  console.log(`Password updated for ${data.user.email ?? target.id}.`);
}

main();
