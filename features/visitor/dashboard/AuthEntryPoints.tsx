import Link from "next/link";

const primary = "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90";
const secondary = "rounded-lg border border-border px-4 py-2 text-sm font-medium";

/** Two distinct entry points. Browsing listings never requires an account. */
export function AuthEntryPoints() {
  return (
    <section aria-label="Get started" className="mb-8 grid gap-4 sm:grid-cols-2">
      <div className="rounded-lg border border-border p-5">
        <h2 className="font-semibold">Looking for a home?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Apply for a unit and manage your tenancy.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/auth/tenant/signup" className={primary}>Create Tenant Account</Link>
          <Link href="/auth/tenant/login" className={secondary}>Tenant Login</Link>
        </div>
      </div>
      <div className="rounded-lg border border-border p-5">
        <h2 className="font-semibold">Landlord or property manager?</h2>
        <p className="mt-1 text-sm text-muted-foreground">List and manage your rental properties.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/auth/landlord/signup" className={primary}>List Your Property</Link>
          <Link href="/auth/landlord/login" className={secondary}>Landlord Login</Link>
        </div>
      </div>
    </section>
  );
}
