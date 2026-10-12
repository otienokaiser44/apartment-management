# Architecture

Next.js (App Router, TypeScript, Tailwind) on Supabase (Auth, Postgres, RLS, Storage). Security is enforced in Postgres; the UI only reflects it.

## Four product areas

| Area | Routes (`app/`) | Implementation (`features/`) | Audience |
|---|---|---|---|
| Visitor | `app/visitor/`, `app/page.tsx` | `features/visitor/` | Anyone, no session |
| Tenant | `app/tenant/` | `features/tenant/` | `profiles.role = tenant` |
| Landlord | `app/landlord/` | `features/landlord/` | `profiles.role = landlord` |
| Admin | `app/admin/` | `features/admin/` | `profiles.role = admin` |

Each area has its own `layout.tsx` and a dashboard at its root route (`/visitor`, `/tenant`, `/landlord`, `/admin`). `/` renders the visitor feature.

```
app/<role>/           routing and page composition only (layout.tsx, page.tsx, route segments)
features/<role>/      role-specific UI, server actions and query wrappers; exports via index.ts
components/           shared UI (layout/, ui/, theme/)
features/account/     shared account features (settings, notifications inbox) used by every role area
lib/                  supabase clients, services (DB access), validation (Zod), auth
types/                database types and shared domain types
hooks/                shared client hooks
```

Rules:
1. `app/<role>` imports only from `features/<role>` plus shared folders. Pages stay thin.
2. `features/<role>` never imports another role's feature. Shared needs move to `components/`, `lib/`, `types/` or `hooks/`. ESLint (`eslint.config.mjs`) enforces this.
3. Supabase clients, generated DB types, Zod schemas, auth helpers and DB access (`lib/services/*`) exist once, in shared folders. Role folders must not import `@supabase/*` directly.
4. Per-role README files list ownership, tables, RPCs and security rules: see `features/*/README.md`.

## Delegated access (property managers and caretakers)

An owner is whoever `properties.landlord_id` points at. Managers have `profiles.role = manager` and work inside `/landlord`; what they can touch is decided per property by `property_staff` rows (created only by accepting an owner invitation) and enforced by RLS, not by the URL.

| | Owner | Property Manager | Caretaker |
|---|---|---|---|
| View property, units | yes | assigned | assigned (read-only) |
| Maintenance tickets (view, update status, comment) | yes | assigned | assigned |
| Units, tenants, requests, invites, meter readings, invoices, payments, announcements | yes | assigned | no |
| Edit property profile, billing settings, verification and its documents, staff | yes | no | no |

`owns_property` / `owns_unit` / `owns_tenancy` mean "owner or assigned property manager". Use `is_property_owner` where a manager must be excluded.

## Data model invariant

Tenants never point at properties directly:

```
tenant_profile -> tenancy -> unit -> property -> landlord
```

`tenancies` is the only link. Move-out ends the tenancy (history kept) and the unit returns to `vacant`. There is no `tenant.property_id` or `current_unit_id`.

## Lifecycle transitions

Frontend code never performs lifecycle transitions by writing status columns. Server actions call the approved RPCs; RLS and guard triggers block everything else.

| Transition | RPC | Caller |
|---|---|---|
| Approve / reject application | `approve_rental_application`, `reject_rental_application` | landlord |
| Confirm move-in | `confirm_move_in` | landlord, admin |
| Cancel pending / end tenancy | `cancel_pending_tenancy`, `end_tenancy` | landlord |
| Invite / revoke / accept | `create_tenant_invitation`, `revoke_tenant_invitation`, `accept_tenant_invitation` | landlord / tenant |
| Bulk roster invite (all-or-nothing) | `create_tenant_invitations_bulk` | landlord |
| Landlord links an existing account / tenant answers / cancel | `request_tenant_link`, `respond_tenant_link`, `cancel_tenant_link_request` | landlord / tenant / landlord |
| Tenant requests a unit by property code (becomes a rental application, approved with `approve_rental_application`) | `submit_unit_link_request` | tenant |
| Verification | `start_`, `submit_`, `withdraw_property_verification` | landlord |
| Verification decision | `review_property_verification` | admin only |
| Manual payment | `record_manual_payment` | landlord |
| Notices / conversations | `send_notice`, `start_conversation` | landlord, tenant |
| Staff invite / accept / revoke / remove | `invite_staff`, `accept_staff_invitation`, `revoke_staff_invitation`, `remove_staff` | owner / manager / owner / owner |
| Close own account | `deactivate_my_account` | any non-admin user |
| Maintenance ticket: submit / update / comment / cancel | `submit_maintenance_ticket`, `update_maintenance_ticket`, `comment_on_maintenance_ticket`, `cancel_maintenance_ticket` | tenant / owner, manager, caretaker / either / tenant |
| Move-out notice: submit / withdraw / advance (acknowledge, inspection, refund) | `submit_vacate_notice`, `withdraw_vacate_notice`, `advance_vacate_notice` | tenant / tenant / owner, manager |
| Moderation | `admin_set_user_status`, `admin_set_landlord_verification`, `admin_set_property_status` | admin only |

## Access control layers

1. `proxy.ts` (Next 16 middleware) refreshes the session and redirects by role (UX only).
2. Role `layout.tsx` re-checks the role on the server via `lib/auth` (`requireRole`, UX only).
3. **RLS, guard triggers and RPC checks in Postgres (the real boundary).**

## Dependency direction

```
app/<role> -> features/<role> -> lib/services -> lib/supabase -> Postgres (RLS + RPC)
                              -> lib/validation, components/*, hooks/*, types/*
```

## Status

Implemented: database layer (migrations 001-029, tests), role route skeletons, layouts, empty-state dashboards, boundary lint rules. Authentication (see [auth.md](auth.md)): Supabase clients, proxy, tenant/landlord signup/login/reset. Not yet implemented: DB services, feature pages (see `docs/superpowers/plans/`).
