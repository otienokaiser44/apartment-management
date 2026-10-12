import { Building2, ChevronRight, MapPin } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/layout/EmptyState";
import { StatusBadge } from "@/components/layout/StatusBadge";
import { buttonVariants } from "@/components/ui/button";
import type { PropertySummary } from "@/types/database";

export function PropertyList({ properties, canAdd = true }: { properties: PropertySummary[]; canAdd?: boolean }) {
  if (properties.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No properties yet"
        hint={canAdd ? "Add your first property to start listing units and onboarding tenants." : "You have not been assigned to any property yet. Ask the owner to invite you."}
        action={
          canAdd ? (
            <Link href="/landlord/properties/new" className={buttonVariants()}>
              Add property
            </Link>
          ) : undefined
        }
      />
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {properties.map((p) => {
        const occupied = p.units.filter((u) => u.status === "occupied").length;
        const pct = p.units.length ? Math.round((occupied / p.units.length) * 100) : 0;
        return (
          <li key={p.id}>
            <Link
              href={`/landlord/properties/${p.id}`}
              className="group block rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <Building2 className="size-5" aria-hidden />
                  </span>
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="size-3.5" aria-hidden />
                      {p.city}
                    </p>
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <StatusBadge status={p.status} />
                <StatusBadge status={p.verification_status} />
              </div>
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
                  <span>
                    {p.units.length} unit{p.units.length === 1 ? "" : "s"}
                  </span>
                  <span>{occupied} occupied</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${pct}% occupied`}>
                  <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
