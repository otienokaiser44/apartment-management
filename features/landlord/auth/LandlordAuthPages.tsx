import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthForm } from "@/components/auth/AuthForm";
import { safeInternalPath } from "@/lib/auth/redirects";
import { authNotice, emailField, loginFields, signupFields } from "@/lib/auth/fields";
import { landlordForgotPasswordAction, landlordLoginAction, landlordSignupAction } from "./actions";

export function LandlordSignupPage() {
  return (
    <AuthCard
      title="List your property"
      description="Create a landlord or property manager account to list and manage rentals. Listings are published after administrator verification."
      footer={
        <>
          <p>
            Already registered? <Link className="underline" href="/auth/landlord/login">Landlord login</Link>
          </p>
          <p>
            Looking for a home? <Link className="underline" href="/auth/tenant/signup">Create a tenant account</Link>
          </p>
        </>
      }
    >
      <AuthForm action={landlordSignupAction} fields={signupFields} submitLabel="Create landlord account" pendingLabel="Creating account…" />
    </AuthCard>
  );
}

export function LandlordLoginPage({ next, error }: { next?: string; error?: string }) {
  const safeNext = safeInternalPath(next);
  return (
    <AuthCard
      title="Landlord login"
      description="Log in to manage your properties, units and tenants."
      notice={authNotice(error)}
      footer={
        <>
          <p><Link className="underline" href="/auth/landlord/forgot-password">Forgot your password?</Link></p>
          <p>
            New landlord? <Link className="underline" href="/auth/landlord/signup">List your property</Link>
          </p>
          <p>
            Looking for a home? <Link className="underline" href="/auth/tenant/login">Tenant login</Link>
          </p>
        </>
      }
    >
      <AuthForm
        action={landlordLoginAction}
        fields={loginFields}
        submitLabel="Log in"
        pendingLabel="Logging in…"
        hidden={safeNext ? { next: safeNext } : undefined}
      />
    </AuthCard>
  );
}

export function LandlordForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter your landlord account email and we will send you a reset link."
      footer={<p><Link className="underline" href="/auth/landlord/login">Back to landlord login</Link></p>}
    >
      <AuthForm action={landlordForgotPasswordAction} fields={[emailField]} submitLabel="Send reset link" pendingLabel="Sending…" />
    </AuthCard>
  );
}
