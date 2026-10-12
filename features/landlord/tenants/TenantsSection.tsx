import { Hash, Inbox, KeyRound, Link2, Upload, UserPlus, Users } from "lucide-react";
import { ActionButton } from "@/components/forms/ActionButton";
import { EmptyState } from "@/components/layout/EmptyState";
import { Card, CardHeader } from "@/components/ui/card";
import { listPendingApplications, listPropertyLinkRequests } from "@/lib/services/onboarding";
import { listUnits } from "@/lib/services/properties";
import { listActiveTenancies } from "@/lib/services/tenancies";
import {
  approveRequestAction, cancelLinkAction, rejectRequestAction,
} from "./actions";
import { InviteTenantForm } from "./InviteTenantForm";
import { LinkExistingTenantForm } from "./LinkExistingTenantForm";
import { RosterImport } from "./RosterImport";

const th = "py-2 pr-4 text-xs font-medium uppercase tracking-wide text-muted-foreground";

/** Tenants & leases for one property: current tenants, invite/assign, requests, link-existing and roster import. */
export async function TenantsSection({
  propertyId,
  propertyCode,
  selectedUnitId,
}: {
  propertyId: string;
  propertyCode: string;
  selectedUnitId?: string;
}) {
  const [units, linkRequests, applications, tenancies] = await Promise.all([
    listUnits(propertyId),
    listPropertyLinkRequests(propertyId),
    listPendingApplications(propertyId),
    listActiveTenancies(propertyId),
  ]);
  const vacant = units.filter((u) => u.status === "vacant").map((u) => ({ id: u.id, unit_number: u.unit_number }));
  const preselect = vacant.some((u) => u.id === selectedUnitId) ? selectedUnitId : undefined;

  return (
    <section aria-label="Tenants and leases" className="space-y-6">
      <Card>
        <CardHeader icon={Users} title={`Current tenants (${tenancies.length})`} description="Everyone with an active tenancy in this property." />
        {tenancies.length === 0 ? (
          <EmptyState icon={Users} title="No active tenants yet" hint="Invite a tenant to a vacant unit below, link an existing account, or approve a request." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border">
                <tr><th className={th}>Unit</th><th className={th}>Tenant</th><th className={th}>Since</th><th className={th}>Rent</th></tr>
              </thead>
              <tbody>
                {tenancies.map((t) => (
                  <tr key={t.tenancy_id} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-4 font-medium">{t.unit_number}</td>
                    <td className="py-2.5 pr-4">{t.tenant_name ?? "—"}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{t.start_date}</td>
                    <td className="py-2.5 tabular-nums">{t.currency} {Number(t.monthly_rent).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div id="invite" className="scroll-mt-24">
        <Card>
          <CardHeader icon={UserPlus} title="Assign / invite a tenant to a unit" description="Creates a single-use invite link for the tenant to claim the unit." />
          <InviteTenantForm units={vacant} selectedUnitId={preselect} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon={Hash} title="Property code" description="Share it so tenants can request a link themselves." />
          <p className="font-mono text-3xl font-semibold tracking-[0.3em] text-primary">{propertyCode}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Tenants enter this code plus their unit number on their dashboard. You approve each request.
          </p>
        </Card>

        <Card>
          <CardHeader icon={Inbox} title={`Requests from tenants (${applications.length})`} description="Tenants who asked to be linked to a unit." />
          {applications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending requests.</p>
          ) : (
            <ul className="space-y-3">
              {applications.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 text-sm">
                  <span>
                    <strong>Unit {a.unit_number}</strong>
                    {a.message ? <span className="block text-xs text-muted-foreground">“{a.message}”</span> : null}
                  </span>
                  <span className="flex gap-2">
                    <ActionButton variant="primary" label="Approve" pendingLabel="Approving…" action={approveRequestAction.bind(null, propertyId, a.id)} />
                    <ActionButton label="Reject" confirm="Reject this request?" action={rejectRequestAction.bind(null, propertyId, a.id)} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader icon={Link2} title="Link an existing tenant account" description="For tenants who already have an account. They must accept before anything changes." />
        <LinkExistingTenantForm propertyId={propertyId} units={vacant} />
        {linkRequests.length > 0 ? (
          <ul className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
            {linkRequests.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3">
                <span>Unit {r.unit_number}: awaiting tenant response</span>
                <ActionButton label="Cancel" action={cancelLinkAction.bind(null, propertyId, r.id)} />
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card>
        <CardHeader icon={Upload} title="Invite tenants from a roster" description="Upload a spreadsheet to invite many tenants at once." />
        <RosterImport propertyId={propertyId} />
      </Card>

      <KeyHint />
    </section>
  );
}

function KeyHint() {
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <KeyRound className="size-3.5" aria-hidden />
      Invite links are shown once and expire after 7 days. Tenants must sign in with the invited email or phone to claim a unit.
    </p>
  );
}
