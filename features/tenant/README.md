# features/tenant

Business and UI implementation for the **tenant** product area. Routes live in `app/tenant/` and only compose what is exported from here.

## Ownership
Tenant feature team.

## Allowed responsibilities
Current tenancy, rental applications, invitations (accepting), payments (viewing and initiating), maintenance requests, notices, messages, profile and the tenant dashboard.

Not allowed: approving anything, marking a payment successful, editing unit/property data, seeing another tenant's data, public discovery pages (visitor).

## Suggested layout
```
features/tenant/
  dashboard/  tenancy/  applications/  invitations/  payments/
  maintenance/  notices/  messages/  profile/
  nav.ts  index.ts
```

## Database
Tables: `tenant_profiles`, `tenancies`, `leases`, `rental_applications`, `tenant_invitations`, `rent_charges`, `payments`, `maintenance_requests`, `maintenance_attachments`, `notices`, `notice_recipients`, `conversations`, `conversation_participants`, `messages`, `notifications`, `favorites`.
Views: `tenant_tenancy_overview`.

**Do not put tenancy on the tenant profile.** The chain is **tenant_profile → tenancy → unit → property → landlord**. "Current unit" is the tenant's `active` tenancy; history is the `ended` ones. There is no `tenant.property_id` or `current_unit_id`.

## RPCs
`accept_tenant_invitation`, `start_conversation`. Applications, maintenance requests, notice read-state and message sends are plain RLS-protected inserts/updates on their own tables (guard triggers restrict which columns a tenant may change).

## Integration rules
- Joining a unit is only possible by `accept_tenant_invitation(token)` or by a landlord approving an application. The tenant UI never creates a tenancy.
- Use `lib/services/*`, `lib/validation/*`, `types/database.ts`. Do not import from other `features/*` folders.

## Security restrictions
- A tenant can never set a payment to `successful`; payment confirmation comes from the landlord RPC or a service-role webhook.
- Invitation tokens are single-use and appear only in the URL; never log or persist the raw token.
- Do not send `role`, `status`, `landlord_id`, `unit_id` ownership fields from forms; the database derives or rejects them.
- No service-role client.

## Shared code to use
`lib/supabase`, `lib/services`, `lib/validation`, `lib/auth`, `types/database.ts`, `components/ui`, `components/layout`, `hooks/` (e.g. realtime/message hooks).
