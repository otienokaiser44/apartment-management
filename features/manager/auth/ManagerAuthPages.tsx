import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthForm } from "@/components/auth/AuthForm";
import { authNotice, loginFields, signupFields } from "@/lib/auth/fields";
import { safeInternalPath } from "@/lib/auth/redirects";
import { managerLoginAction, managerSignupAction } from "./actions";

export function ManagerSignupPage() {
  return (
    <AuthCard
      title="Create your manager account"
      description="For property managers and caretakers. Use the email address your invitation was sent to."
      footer={
        <p>
          Already have an account? <Link className="underline" href="/auth/manager/login">Manager login</Link>
        </p>
      }
    >
      <AuthForm action={managerSignupAction} fields={signupFields} submitLabel="Create manager account" pendingLabel="Creating account…" />
    </AuthCard>
  );
}

export function ManagerLoginPage({ next, error }: { next?: string; error?: string }) {
  const safeNext = safeInternalPath(next);
  return (
    <AuthCard
      title="Manager login"
      description="Log in to manage the properties you were invited to."
      notice={authNotice(error)}
      footer={
        <>
          <p>
            New here? <Link className="underline" href="/auth/manager/signup">Create a manager account</Link>
          </p>
          <p>
            Property owner? <Link className="underline" href="/auth/landlord/login">Landlord login</Link>
          </p>
        </>
      }
    >
      <AuthForm
        action={managerLoginAction}
        fields={loginFields}
        submitLabel="Log in"
        pendingLabel="Logging in…"
        hidden={safeNext ? { next: safeNext } : undefined}
      />
    </AuthCard>
  );
}
