import { Building2, Droplets, Megaphone, ShieldCheck, UserCog, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/components/ui/cn";

export const PROPERTY_TABS = [
  { id: "units", label: "Units", icon: Building2 },
  { id: "tenants", label: "Tenants & Leases", icon: Users },
  { id: "billing", label: "Billing & Utilities", icon: Droplets },
  { id: "staff", label: "Staff & Managers", icon: UserCog },
  { id: "announcements", label: "Announcements", icon: Megaphone },
  { id: "verification", label: "Verification", icon: ShieldCheck },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[];

export type PropertyTab = (typeof PROPERTY_TABS)[number]["id"];

/** Tabs managers and caretakers never see: staff delegation and verification belong to the owner. */
export const OWNER_ONLY_TABS: readonly PropertyTab[] = ["staff", "verification"];

export const parseTab = (v: unknown): PropertyTab =>
  PROPERTY_TABS.some((t) => t.id === v) ? (v as PropertyTab) : "units";

/**
 * Segmented control. Server-rendered: the active tab lives in the URL (?tab=), so every view is linkable and
 * refresh-safe. The active segment transitions in via colour and shadow.
 */
export function PropertyTabs({ propertyId, active, isOwner }: { propertyId: string; active: PropertyTab; isOwner: boolean }) {
  return (
    <nav aria-label="Property sections" className="mb-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="inline-flex gap-1 rounded-xl border border-border bg-muted/50 p-1">
        {PROPERTY_TABS.filter((t) => isOwner || !OWNER_ONLY_TABS.includes(t.id)).map((t) => {
          const Icon = t.icon;
          const isActive = active === t.id;
          return (
            <Link
              key={t.id}
              href={`/landlord/properties/${propertyId}?tab=${t.id}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-200",
                isActive ? "bg-card text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className={cn("size-4 transition-colors", isActive && "text-primary")} aria-hidden />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
