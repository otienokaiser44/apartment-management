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
components/           shared UI (layout/, ui/)
lib/                  supabase clients, services (DB access), validation (Zod), auth
types/                database types and shared domain types
hooks/                shared client hooks
```

Rules:
1. `app/<role>` imports only from `features/<role>` plus shared folders. Pages stay thin.
2. `features/<role>` never imports another role's feature. Shared needs move to `components/`, `lib/`, `types/` or `hooks/`. ESLint (`eslint.config.mjs`) enforces this.
3. Supabase clients, generated DB types, Zod schemas, auth helpers and DB access (`lib/services/*`) exist once, in shared folders. Role folders must not import `@supabase/*` directly.
4. Per-role README files list ownership, tables, RPCs and security rules: see `features/*/README.md`.

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
| Verification | `start_`, `submit_`, `withdraw_property_verification` | landlord |
| Verification decision | `review_property_verification` | admin only |
| Manual payment | `record_manual_payment` | landlord |
| Notices / conversations | `send_notice`, `start_conversation` | landlord, tenant |
| Moderation | `admin_set_user_status`, `admin_set_landlord_verification`, `admin_set_property_status` | admin only |

## Access control layers

1. `middleware` refreshes the session and redirects by role (UX only).
2. Role `layout.tsx` re-checks the role on the server via `lib/auth` once auth is implemented (UX only).
3. **RLS, guard triggers and RPC checks in Postgres (the real boundary).**

## Dependency direction

```
app/<role> -> features/<role> -> lib/services -> lib/supabase -> Postgres (RLS + RPC)
                              -> lib/validation, components/*, hooks/*, types/*
```

## Status

Implemented: database layer (migrations 001-029, tests), role route skeletons, layouts, empty-state dashboards, boundary lint rules. Not yet implemented: Supabase clients, auth/middleware, services, feature pages (see `docs/superpowers/plans/`).
