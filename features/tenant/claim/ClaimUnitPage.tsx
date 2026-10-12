import Link from "next/link";
import { AuthCard } from "@/components/auth/AuthCard";
import { getSessionUser } from "@/lib/auth/session";
import { inviteTokenSchema } from "@/lib/validation/onboarding";
import { ClaimButton } from "./ClaimButton";

/**
 * Public landing page for invitation links: /claim-unit?token=...
 * Nothing is claimed on page load (so link previews and prefetchers cannot consume the token); the tenant confirms.
 */
export async function ClaimUnitPage({ token }: { token?: string }) {
  const parsed = inviteTokenSchema.safeParse(token);
  if (!parsed.success) {
    return (
      <AuthCard title="Invitation link" description="This link is incomplete or invalid.">
        <p className="text-sm">Ask your landlord to send the invitation again.</p>
      </AuthCard>
    );
  }
  const user = await getSessionUser();
  const here = `/claim-unit?token=${encodeURIComponent(parsed.data)}`;

  if (!user) {
    return (
      <AuthCard
        title="You have been invited to a unit"
        description="Log in, or create a tenant account with the email or phone your landlord invited, then open this link again."
        footer={<p>The account email or phone must match the invitation.</p>}
      >
        <div className="flex gap-3">
          <Link
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            href={`/auth/tenant/login?next=${encodeURIComponent(here)}`}
          >
            Log in
          </Link>
          <Link className="rounded-lg border border-border px-4 py-2 text-sm" href="/auth/tenant/signup">
            Create account
          </Link>
        </div>
      </AuthCard>
    );
  }
  if (user.role !== "tenant") {
    return (
      <AuthCard title="Tenant account needed" description="Invitations can only be claimed from a tenant account.">
        <Link className="text-sm underline" href="/auth/tenant/login">Go to tenant login</Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="Claim your unit"
      description={`Signed in as ${user.email ?? "your account"}. Confirm to become the tenant of the invited unit.`}
    >
      <ClaimButton token={parsed.data} />
    </AuthCard>
  );
}
