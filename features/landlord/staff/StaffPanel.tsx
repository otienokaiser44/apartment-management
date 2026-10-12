import { MailPlus, Clock, UserCog, Users } from "lucide-react";
import { ActionButton } from "@/components/forms/ActionButton";
import { EmptyState } from "@/components/layout/EmptyState";
import { Card, CardHeader } from "@/components/ui/card";
import { listMyProperties } from "@/lib/services/properties";
import { listPendingStaffInvites, listStaff } from "@/lib/services/staff";
import { STAFF_ROLE_LABEL } from "@/lib/validation/staff";
import { removeStaffAction, revokeStaffInviteAction } from "./actions";
import { InviteStaffForm } from "./InviteStaffForm";

/**
 * Staff & managers for the owner. With a `propertyId` it shows that property's team; without, all properties.
 * The owner is implicit (never a row): they always have full access.
 */
export async function StaffPanel({ propertyId }: { propertyId?: string }) {
  const [properties, staff, invites] = await Promise.all([listMyProperties(), listStaff(propertyId), listPendingStaffInvites()]);
  const names = new Map(properties.map((p) => [p.id, p.name]));
  const pending = propertyId ? invites.filter((i) => i.property_ids.includes(propertyId)) : invites;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader icon={MailPlus} title="Invite a manager or caretaker" description="They get access only to the properties you choose." />
        <InviteStaffForm properties={properties.map((p) => ({ id: p.id, name: p.name }))} preselectedId={propertyId} />
      </Card>

      <Card>
        <CardHeader icon={Users} title={`Team (${staff.length})`} description="People with delegated access. You always keep full control." />
        {staff.length === 0 ? (
          <EmptyState icon={UserCog} title="No staff yet" hint="You are the only person with access. Invite a property manager above to share the workload." />
        ) : (
          <ul className="divide-y divide-border">
            {staff.map((s) => (
              <li key={s.staff_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0">
                <span>
                  <strong>{s.full_name ?? s.email}</strong>{" "}
                  <span className="ml-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">{STAFF_ROLE_LABEL[s.role]}</span>
                  <span className="block text-xs text-muted-foreground">
                    {s.email} · {s.property_name}
                  </span>
                </span>
                <ActionButton
                  label="Remove access"
                  confirm={`Remove ${s.full_name ?? s.email} from ${s.property_name}?`}
                  action={removeStaffAction.bind(null, s.staff_id)}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>

      {pending.length > 0 ? (
        <Card>
          <CardHeader icon={Clock} title={`Pending invitations (${pending.length})`} description="Not accepted yet." />
          <ul className="divide-y divide-border">
            {pending.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0">
                <span>
                  <strong>{i.invitee_email}</strong> · {STAFF_ROLE_LABEL[i.role]}
                  <span className="block text-xs text-muted-foreground">
                    {i.property_ids.map((id) => names.get(id) ?? "property").join(", ")} · expires {new Date(i.expires_at).toLocaleDateString()}
                  </span>
                </span>
                <ActionButton label="Revoke" confirm="Revoke this invitation?" action={revokeStaffInviteAction.bind(null, i.id)} />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
