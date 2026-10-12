import { Building2, DoorOpen, Droplets, Megaphone, Percent, Plus, UserCog, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { buttonVariants } from "@/components/ui/button";
import { OPERATOR_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/session";
import { listMyProperties } from "@/lib/services/properties";
import { PropertyList } from "../properties/PropertyList";

function Stat({ label, value, hint, icon: Icon }: { label: string; value: string | number; hint?: string; icon: LucideIcon }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export async function LandlordDashboard() {
  const user = await requireRole(OPERATOR_ROLES);
  const isOwner = user.role === "landlord";
  const properties = await listMyProperties();
  const units = properties.flatMap((p) => p.units);
  const occupied = units.filter((u) => u.status === "occupied").length;
  const vacant = units.filter((u) => u.status === "vacant").length;
  const verified = properties.filter((p) => p.verification_status === "verified").length;
  const occupancy = units.length ? `${Math.round((occupied / units.length) * 100)}%` : "-";

  const quick: { label: string; href: string; icon: LucideIcon; ownerOnly?: boolean }[] = [
    { label: "Manage tenants", href: "/landlord/tenants", icon: Users },
    { label: "Billing & meter readings", href: "/landlord/billing", icon: Droplets },
    { label: "Send announcement", href: "/landlord/announcements", icon: Megaphone },
    { label: "Managers & staff", href: "/landlord/managers", icon: UserCog, ownerOnly: true },
  ];

  return (
    <>
      <PageHeader
        title={isOwner ? "Landlord dashboard" : "Manager dashboard"}
        description={isOwner ? "Your properties, units, tenants, payments and maintenance." : "The properties you were assigned to manage."}
        actions={
          isOwner ? (
            <Link href="/landlord/properties/new" className={buttonVariants()}>
              <Plus className="size-4" aria-hidden />
              Add property
            </Link>
          ) : undefined
        }
      />
      <nav aria-label="Quick actions" className="mb-8 flex flex-wrap gap-2">
        {quick
          .filter((q) => isOwner || !q.ownerOnly)
          .map(({ label, href, icon: Icon }) => (
            <Link key={href} href={href} className={buttonVariants({ variant: "secondary" })}>
              <Icon className="size-4 text-primary" aria-hidden />
              {label}
            </Link>
          ))}
      </nav>
      <section aria-label="Summary" className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={Building2} label="Properties" value={properties.length} hint={`${verified} verified`} />
        <Stat icon={DoorOpen} label="Units" value={units.length} hint={`${vacant} vacant`} />
        <Stat icon={Users} label="Occupied" value={occupied} />
        <Stat icon={Percent} label="Occupancy" value={occupancy} />
      </section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{isOwner ? "Your properties" : "Assigned properties"}</h2>
        {properties.length ? (
          <Link href="/landlord/properties" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            View all
          </Link>
        ) : null}
      </div>
      <PropertyList properties={properties} canAdd={isOwner} />
    </>
  );
}
