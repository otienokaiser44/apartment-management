import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { getSessionUser } from "@/lib/auth/session";
import { staffTokenSchema } from "@/lib/validation/staff";
import { AcceptButton } from "./AcceptButton";

/**
 * Public landing page for staff invitations: /staff-invite?token=...
 * Nothing is accepted on page load (link previews cannot consume the token); the invited person confirms.
 */
export async function StaffInvitePage({ token }: { token?: string }) {
  const parsed = staffTokenSchema.safeParse(token);
  if (!parsed.success) {
    return (
      <AuthCard title="Invitation link" description="This link is incomplete or invalid.">
        <p className="text-sm">Ask the property owner to send the invitation again.</p>
      </AuthCard>
    );
  }
  const user = await getSessionUser();
  const here = `/staff-invite?token=${encodeURIComponent(parsed.data)}`;

  if (!user) {
    return (
      <AuthCard
        title="You have been invited to help manage a property"
        description="Log in, or create a manager account with the email address the invitation was sent to, then open this link again."
        footer={<p>The account email must match the invitation.</p>}
      >
        <div className="flex gap-3">
          <Link className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90" href={`/auth/manager/login?next=${encodeURIComponent(here)}`}>
            Log in
          </Link>
          <Link className="rounded-lg border border-border px-4 py-2 text-sm" href="/auth/manager/signup">
            Create account
          </Link>
        </div>
      </AuthCard>
    );
  }
  if (user.role !== "manager") {
    return (
      <AuthCard title="Manager account needed" description="Staff invitations can only be accepted from a manager account. Owners and tenants have separate accounts.">
        <Link className="text-sm underline" href="/auth/manager/signup">Create a manager account</Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="Accept your invitation"
      description={`Signed in as ${user.email ?? "your account"}. Confirm to get access to the invited properties.`}
    >
      <AcceptButton token={parsed.data} />
    </AuthCard>
  );
}
