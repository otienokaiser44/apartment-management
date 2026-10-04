# features/landlord

Business and UI implementation for the **landlord** product area. Routes live in `app/landlord/` and only compose what is exported from here.

## Ownership
Landlord feature team. Nobody else edits this folder without review from the owner.

## Allowed responsibilities
Properties, units, tenants, rental applications, tenant invitations, verification submission, payments, maintenance and the landlord dashboard.

Not allowed: verifying properties or landlords, suspending users or properties (admin), anything on the public discovery pages (visitor), tenant-only self-service (tenant).

## Suggested layout
```
features/landlord/
  dashboard/    properties/    units/    tenants/    applications/
  invitations/  verification/  payments/ maintenance/
  nav.ts        index.ts       (public surface used by app/landlord)
```
Each area may hold `components/`, `actions/` (server actions) and `queries/` (thin calls into `lib/services`).

## Database
Tables: `landlord_profiles`, `properties`, `property_amenities`, `property_images`, `units`, `unit_images`, `rental_applications`, `tenant_invitations`, `tenancies`, `leases`, `rent_charges`, `payments`, `maintenance_requests`, `maintenance_attachments`, `notices`, `notice_recipients`, `property_verification_requests`, `property_verification_documents`, `conversations`/`messages`.
Views: `landlord_tenancy_overview`, `landlord_application_overview`.

Tenant relationship is always **tenant_profile → tenancy → unit → property → landlord**. Never store or query a tenant as "belonging" to a property or landlord directly; go through `tenancies`.

## RPCs
`approve_rental_application`, `reject_rental_application`, `confirm_move_in`, `cancel_pending_tenancy`, `end_tenancy`, `create_tenant_invitation`, `revoke_tenant_invitation`, `start_property_verification`, `submit_property_verification`, `withdraw_property_verification`, `record_manual_payment`, `send_notice`, `start_conversation`.

## Integration rules
- Every lifecycle change (approve, move-in, end tenancy, invite, verify submit, record payment) is one RPC call from a server action. No client-side multi-step writes and no direct `update` of `status` columns.
- Read and write through `lib/services/*`, validate with `lib/validation/*`, take types from `types/database.ts`.
- Do not import from `features/tenant|admin|visitor`. If two roles need it, move it to `components/`, `lib/`, `hooks/` or `types/`.

## Security restrictions
- RLS is the authority; UI hiding is cosmetic. Assume every call is attacker-controlled.
- Never touch `verification_status`, `profiles.role/status`, or a property's `published` state directly. Submission goes through the verification RPCs; only an admin can verify.
- Never use the service-role client. Verification documents live in the private bucket and are accessed only via signed URLs from the shared storage service.
- Never accept a landlord/owner id from the client; it is derived from `auth.uid()` in the database.

## Shared code to use
`lib/supabase` (clients), `lib/services`, `lib/validation`, `lib/auth`, `types/database.ts`, `components/ui` and `components/layout`, `hooks/`.
