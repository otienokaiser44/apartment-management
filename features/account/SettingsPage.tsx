import { AtSign, Bell, Database, Palette, ShieldCheck, User, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/components/ui/cn";
import { ROLE_HOME } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { getAccountOverview } from "@/lib/services/account";
import { AccountSection } from "./sections/AccountSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { NotificationsSection } from "./sections/NotificationsSection";
import { PrivacySection } from "./sections/PrivacySection";
import { ProfileSection } from "./sections/ProfileSection";
import { SecuritySection } from "./sections/SecuritySection";

const SECTIONS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "account", label: "Email & account", icon: AtSign },
  { id: "security", label: "Password & security", icon: ShieldCheck },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "privacy", label: "Privacy & data", icon: Database },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[];

type SectionId = (typeof SECTIONS)[number]["id"];
const parseSection = (v: unknown): SectionId => (SECTIONS.find((s) => s.id === v)?.id ?? "profile") as SectionId;

/** Account settings for any signed-in role. `basePath` is the area's own settings route (e.g. /tenant/settings). */
export async function SettingsPage({ section, basePath }: { section?: string; basePath: string }) {
  const user = await requireUser();
  const account = await getAccountOverview();
  const active = parseSection(section);

  return (
    <>
      <PageHeader title="Settings" description="Manage your profile, sign-in and preferences." />
      <div className="grid gap-8 lg:grid-cols-[230px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:sticky lg:top-24 lg:mx-0 lg:flex-col lg:self-start lg:overflow-visible lg:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SECTIONS.map(({ id, label, icon: Icon }) => {
            const isActive = id === active;
            return (
              <Link
                key={id}
                href={`${basePath}?section=${id}`}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0">
          {!account ? (
            <p className="text-sm text-muted-foreground">We could not load your account. Please refresh the page.</p>
          ) : active === "profile" ? (
            <ProfileSection account={account} />
          ) : active === "account" ? (
            <AccountSection account={account} />
          ) : active === "security" ? (
            <SecuritySection />
          ) : active === "notifications" ? (
            <NotificationsSection role={account.role} muted={account.mutedCategories} inboxHref={`${ROLE_HOME[user.role]}/notifications`} />
          ) : active === "appearance" ? (
            <AppearanceSection />
          ) : (
            <PrivacySection role={account.role} />
          )}
        </div>
      </div>
    </>
  );
}
