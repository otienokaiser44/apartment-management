import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthForm } from "@/components/auth/AuthForm";
import { resetPasswordAction } from "@/lib/auth/actions";
import { resetFields } from "@/lib/auth/fields";
import { createClient } from "@/lib/supabase/server";

/** Reached from the recovery email via /auth/callback, which establishes a session first. */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/auth/tenant/forgot-password");

  return (
    <AuthCard title="Choose a new password" description="Enter a new password for your account.">
      <AuthForm action={resetPasswordAction} fields={resetFields} submitLabel="Update password" pendingLabel="Updating…" />
    </AuthCard>
  );
}
