#!/usr/bin/env node
// Provision a platform administrator. Public registration can NEVER create an admin: the signup
// trigger maps any requested role other than "landlord" to "tenant". This script uses the
// service-role key (server-side secret) to create the auth user, then promotes the profile.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-admin.mjs admin@yourco.com "Full Name"
//   (password is read from ADMIN_PASSWORD, or generated and printed once)
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const [email, fullName = "Platform Admin"] = process.argv.slice(2);

if (!url || !serviceKey || !email) {
  console.error(
    'Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-admin.mjs <email> ["Full Name"]',
  );
  process.exit(1);
}

const password = process.env.ADMIN_PASSWORD ?? randomBytes(18).toString("base64url");
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName },
});
if (error) {
  console.error("Could not create the auth user:", error.message);
  process.exit(1);
}
const userId = data.user.id;

// The signup trigger made a tenant profile; swap it for an admin profile (service role bypasses RLS).
const steps = [
  supabase.from("profiles").update({ role: "admin" }).eq("id", userId),
  supabase.from("tenant_profiles").delete().eq("user_id", userId),
  supabase.from("admin_profiles").insert({ user_id: userId }),
];
for (const step of steps) {
  const { error: stepError } = await step;
  if (stepError) {
    console.error("Promotion failed (user was created; fix manually):", stepError.message);
    process.exit(1);
  }
}

console.log(`Admin created: ${email} (${userId})`);
if (!process.env.ADMIN_PASSWORD) console.log(`One-time password: ${password}`);
