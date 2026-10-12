import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthForm } from "@/components/auth/AuthForm";
import { safeInternalPath } from "@/lib/auth/redirects";
import { authNotice, emailField, loginFields, signupFields } from "@/lib/auth/fields";
import { tenantForgotPasswordAction, tenantLoginAction, tenantSignupAction } from "./actions";

export function TenantSignupPage() {
  return (
    <AuthCard
      title="Create your tenant account"
      description="Find a home, apply for it and manage your tenancy."
      footer={
        <>
          <p>
            Already have an account? <Link className="underline" href="/auth/tenant/login">Tenant login</Link>
          </p>
          <p>
            Own or manage property? <Link className="underline" href="/auth/landlord/signup">List your property</Link>
          </p>
        </>
      }
    >
      <AuthForm action={tenantSignupAction} fields={signupFields} submitLabel="Create tenant account" pendingLabel="Creating account…" />
    </AuthCard>
  );
}

export function TenantLoginPage({ next, error }: { next?: string; error?: string }) {
  const safeNext = safeInternalPath(next);
  return (
    <AuthCard
      title="Tenant login"
      description="Log in to your tenant account."
      notice={authNotice(error)}
      footer={
        <>
          <p><Link className="underline" href="/auth/tenant/forgot-password">Forgot your password?</Link></p>
          <p>
            New here? <Link className="underline" href="/auth/tenant/signup">Create a tenant account</Link>
          </p>
          <p>
            Landlord or property manager? <Link className="underline" href="/auth/landlord/login">Landlord login</Link>
          </p>
        </>
      }
    >
      <AuthForm
        action={tenantLoginAction}
        fields={loginFields}
        submitLabel="Log in"
        pendingLabel="Logging in…"
        hidden={safeNext ? { next: safeNext } : undefined}
      />
    </AuthCard>
  );
}

export function TenantForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter your tenant account email and we will send you a reset link."
      footer={<p><Link className="underline" href="/auth/tenant/login">Back to tenant login</Link></p>}
    >
      <AuthForm action={tenantForgotPasswordAction} fields={[emailField]} submitLabel="Send reset link" pendingLabel="Sending…" />
    </AuthCard>
  );
}
