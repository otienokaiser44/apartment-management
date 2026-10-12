import { KeyRound } from "lucide-react";
import { ActionButton } from "@/components/forms/ActionButton";
import { formatDate, formatMoney } from "@/lib/format";
import type { LeaseOffer } from "@/lib/services/tenant";
import { respondToLinkAction } from "../linking/actions";

/**
 * A landlord has linked you to a unit and is waiting for your answer. Accepting makes you the tenant of that unit
 * (it creates the tenancy); declining leaves everything unchanged.
 */
export function LeaseOfferBanner({ offer }: { offer: LeaseOffer }) {
  return (
    <section
      aria-label={`Lease offer for unit ${offer.unit_number}`}
      className="overflow-hidden rounded-2xl border border-primary/40 bg-gradient-to-br from-accent to-card shadow-sm"
    >
      <div className="flex flex-wrap items-start gap-5 p-5 sm:p-6">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <KeyRound className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-accent-foreground">Waiting for your answer</p>
          <h2 className="mt-1 text-lg font-semibold">
            {offer.landlord_name ?? "Your landlord"} has offered you Unit {offer.unit_number}
          </h2>
          <p className="text-sm text-muted-foreground">
            {offer.property_name}
            {offer.address_line_1 ? ` · ${offer.address_line_1}` : ""}
            {offer.city ? `, ${offer.city}` : ""}
          </p>

          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Unit</dt>
              <dd className="mt-0.5 font-medium">
                {offer.unit_number}
                {offer.floor_number !== null ? ` · Floor ${offer.floor_number}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Base rent</dt>
              <dd className="mt-0.5 font-medium">{formatMoney(offer.monthly_rent, offer.currency)} / month</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Security deposit</dt>
              <dd className="mt-0.5 font-medium">{formatMoney(offer.security_deposit, offer.currency)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Offer expires</dt>
              <dd className="mt-0.5 font-medium">{formatDate(offer.expires_at)}</dd>
            </div>
          </dl>

          <div className="mt-5 flex flex-wrap items-start gap-3">
            <ActionButton variant="primary" label="Accept lease" pendingLabel="Accepting…" confirm={`Accept Unit ${offer.unit_number} at ${offer.property_name}? You will become its tenant.`} action={respondToLinkAction.bind(null, offer.request_id, true)} />
            <ActionButton label="Decline" confirm="Decline this offer?" action={respondToLinkAction.bind(null, offer.request_id, false)} />
          </div>
        </div>
      </div>
    </section>
  );
}
