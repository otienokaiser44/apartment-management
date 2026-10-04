# features/admin

Business and UI implementation for the **admin** product area. Routes live in `app/admin/` and only compose what is exported from here.

## Ownership
Platform team. Smallest, most restricted area; changes need security review.

## Allowed responsibilities
Platform administration, users, landlords, property verification review, moderation, reports, audit logs and the admin dashboard.

Not allowed: acting as a landlord or tenant (no editing their data through admin UI shortcuts), public pages (visitor).

## Suggested layout
```
features/admin/
  dashboard/  users/  landlords/  verification/  moderation/
  reports/    audit-logs/
  nav.ts  index.ts
```

## Database
Tables: `profiles`, `admin_profiles`, `landlord_profiles`, `properties`, `property_verification_requests`, `property_verification_documents`, `verification_document_types`, `property_reports`, `audit_logs` (read-only), `notifications`.

## RPCs
`review_property_verification`, `admin_set_user_status`, `admin_set_landlord_verification`, `admin_set_property_status`. `write_audit_log` is called by the database functions, not by the UI.

## Integration rules
- Every status or role change goes through the RPCs above. Never `update profiles set role/status` from the client.
- Audit logs are append-only and read-only in the UI.
- Admin accounts are provisioned only by `scripts/create-admin.mjs`; there is no admin registration form.
- Shared access goes through `lib/services`; no imports from other `features/*`.

## Security restrictions
- Every RPC re-checks `is_admin()` in the database. Route guards and layouts are not the security boundary.
- No service-role key in admin UI code or the browser bundle.
- Show private verification documents only through short-lived signed URLs.
- Always send a `reason` for suspensions and rejections so the audit trail is meaningful.

## Shared code to use
`lib/supabase`, `lib/services`, `lib/validation`, `lib/auth`, `types/database.ts`, `components/ui` (tables, badges), `components/layout`, `hooks/`.
