import { ArrowRight, DoorOpen, Hourglass, Megaphone, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/layout/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/alert";
import { Card, CardHeader } from "@/components/ui/card";
import { formatDate, formatMoney, formatMonth } from "@/lib/format";
import { requireRole } from "@/lib/auth/session";
import { listMyAnnouncements } from "@/lib/services/billing";
import { listMyVacateNotices } from "@/lib/services/moveouts";
import { getLeaseOffers, getMyTenancies, getOpenTicketCount, getPropertyContacts, getStatements } from "@/lib/services/tenant";
import { VACATE_STATUS_LABEL } from "@/lib/validation/portal";
import { LinkApartmentForm } from "../linking/LinkApartmentForm";
import { NoticeCard } from "../notices/NoticesPage";
import { ContactCard } from "./ContactCard";
import { LeaseOfferBanner } from "./LeaseOfferBanner";
import { ResidencyCard } from "./ResidencyCard";
import { StatementSummary } from "./StatementSummary";

function QuickLink({ href, icon: Icon, title, hint, count }: { href: string; icon: LucideIcon; title: string; hint: string; count?: number }) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-muted">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
      {count ? <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">{count}</span> : null}
      <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

/** The tenant's home page: pending offers, the current residency, contacts, this month's bill and what needs attention. */
export async function TenantDashboard() {
  const user = await requireRole("tenant");
  const [tenancies, offers, openTickets, notices, vacateNotices] = await Promise.all([
    getMyTenancies(),
    getLeaseOffers(),
    getOpenTicketCount(),
    listMyAnnouncements(20),
    listMyVacateNotices(),
  ]);
  const active = tenancies.find((t) => t.tenancy_status === "active");
  const pending = tenancies.filter((t) => t.tenancy_status === "pending");
  const [contacts, statements] = active
    ? await Promise.all([getPropertyContacts(active.property_id), getStatements(active.tenancy_id, 1)])
    : [[], []];
  const statement = statements[0];
  const openVacate = vacateNotices.find((n) => ["submitted", "approved", "inspection_pending"].includes(n.status));
  const urgent = notices.filter((n) => n.category === "urgent" && !n.read);
  const unread = notices.filter((n) => !n.read).length;
  const firstName = user.fullName?.split(" ")[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Tenant dashboard"}
        description={active ? `${active.property_name} · Unit ${active.unit_number}` : "Your home, bills, repairs and notices in one place."}
      />

      <div className="space-y-4 empty:hidden">
        {urgent.length > 0 ? (
          <Alert variant="error">
            <p className="font-medium">{urgent.length === 1 ? "Urgent alert" : `${urgent.length} urgent alerts`}</p>
            <ul className="mt-1 text-sm">
              {urgent.slice(0, 3).map((n) => (
                <li key={n.id}>{n.title}</li>
              ))}
            </ul>
            <Link href="/tenant/notices" className="mt-1 inline-block text-sm font-medium underline">
              Read now
            </Link>
          </Alert>
        ) : null}

        {offers.map((o) => (
          <LeaseOfferBanner key={o.request_id} offer={o} />
        ))}

        {pending.map((t) => (
          <Alert key={t.tenancy_id} variant="info">
            <span className="inline-flex items-center gap-2">
              <Hourglass className="size-4" aria-hidden />
              <span>
                <strong>Unit {t.unit_number}</strong> at {t.property_name} was approved. Your landlord will confirm your move-in soon, and then your residency card appears here.
              </span>
            </span>
          </Alert>
        ))}

        {openVacate ? (
          <Alert variant="info">
            Your move-out notice for {formatDate(openVacate.intended_move_out_date)} is <strong>{VACATE_STATUS_LABEL[openVacate.status].toLowerCase()}</strong>.{" "}
            <Link href="/tenant/vacate" className="font-medium underline">
              Track it
            </Link>
          </Alert>
        ) : null}

        {statement && statement.status === "overdue" ? (
          <Alert variant="error">
            Your {formatMonth(statement.billing_period_start)} statement of <strong>{formatMoney(statement.total_amount, statement.currency)}</strong> is overdue.{" "}
            <Link href="/tenant/invoices" className="font-medium underline">
              See how to pay
            </Link>
          </Alert>
        ) : null}
      </div>

      {active ? (
        <div className="mt-6 space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ResidencyCard tenancy={active} />
            </div>
            <ContactCard contacts={contacts} fallback={{ name: active.landlord_business_name ?? active.landlord_name, phone: active.landlord_phone, email: active.landlord_email }} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <StatementSummary statement={statement} />
            </div>
            <Card>
              <CardHeader title="Quick actions" />
              <div className="-mx-2 space-y-1">
                <QuickLink href="/tenant/tickets" icon={Wrench} title="Report a problem" hint="Maintenance tickets" count={openTickets || undefined} />
                <QuickLink href="/tenant/notices" icon={Megaphone} title="Notices & alerts" hint="From your landlord" count={unread || undefined} />
                <QuickLink href="/tenant/vacate" icon={DoorOpen} title="Move out" hint="Give notice to vacate" />
              </div>
            </Card>
          </div>

          {notices.length > 0 ? (
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Latest notices</h2>
                <Link href="/tenant/notices" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                  View all
                </Link>
              </div>
              <div className="space-y-3">
                {notices.slice(0, 3).map((n) => (
                  <NoticeCard key={n.id} notice={n} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {offers.length === 0 && pending.length === 0 ? (
            <EmptyState title="You are not linked to a home yet" hint="Accept an invitation from your landlord, or ask for the property code and link to your apartment below." />
          ) : null}
          <Card>
            <CardHeader title="Link to your apartment" description="Ask your landlord for the property code, then enter it with your unit number. They approve the request." />
            <LinkApartmentForm />
          </Card>
        </div>
      )}
    </>
  );
}
