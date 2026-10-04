# Apartment Management Platform — Design Spec

Date: 2026-10-04
Source brief: `Downloads/claude_apartment_platform_from_scratch_prompt.md` (authoritative for table/column lists, statuses, RLS intent; this spec records decisions and ordering, not a copy of the brief).

## 1. Goal
A multi-landlord rental platform with four experiences — visitor (unauthenticated), tenant, landlord, admin — on Next.js (App Router, TS, Tailwind, Zod) + Supabase (Auth, Postgres, RLS, Storage). The Supabase schema is the foundation; security is enforced in Postgres, not the UI.

**Core invariant:** tenants link to units only via `tenancies`. No `tenant.property_id` / `current_unit_id`. Move-out ends the tenancy (history kept), unit returns to `vacant`.

## 2. Decisions / assumptions
| Topic | Decision |
|---|---|
| Roles | `profiles.role` in (`admin`,`landlord`,`tenant`); visitor = no row. Role/status changes admin-only (column-guard trigger + RPC). Public signup can only choose tenant/landlord (signup trigger ignores any `admin` request). |
| Admin provisioning | Seed/script only (`scripts/create-admin`), never public registration. |
| Profile creation | `handle_new_user` trigger on `auth.users` creates `profiles` + role extension row. |
| Money | `numeric(12,2)`; no floats. |
| Enums | Postgres enum types for statuses. |
| Application approval | `approve_rental_application` creates tenancy `pending`, unit `reserved`, application `approved`. `confirm_move_in(tenancy_id)` (landlord/admin) → tenancy `active`, unit `occupied`. |
| Invitation accept | `accept_tenant_invitation(token)` → tenancy `active` directly, unit `occupied`. Token raw only in URL; `token_hash` (sha256) stored, unique, single-use, expiring. |
| End tenancy | `end_tenancy(id,end_date,notes)` → `ended`, unit `vacant` (unless other pending), notify, audit. |
| Active uniqueness | Partial unique index on `tenancies(unit_id) WHERE status='active'`; also one open (`pending`/`active`) per unit. |
| Verification | Landlord submits via `submit_property_verification`; only `review_property_verification` (admin) sets `verified`/`rejected`; a trigger blocks direct client changes to `verification_status` and `status=published` without conditions. |
| Public listings | `public_property_listings` view (security_invoker off, explicit safe columns) over published+verified properties and vacant/reserved units. |
| Payments | Generic provider abstraction; landlord manual recording via RPC; tenant cannot set `successful`; webhooks use service role. No M-Pesa yet. |
| Storage | Buckets: `property-images`, `unit-images` (public read, owner write), `avatars` (owner), `verification-documents` (PRIVATE, landlord-owner + admin), `maintenance-attachments` (private, tenant/landlord/admin). Path convention `<owner-or-entity-id>/...` used by policies. |
| Audit | Append-only; inserts via security-definer fn; admin read only. |
| Tooling | Supabase CLI not installed; use `npx supabase`. Docker present → apply migrations/tests on a local stack if it starts; otherwise report unverified. |

## 3. Migrations (modular, sequential, `supabase/migrations/NNN_*.sql`)
Timestamp-prefix is required by the CLI, so files are named `<14-digit-ts>_NNN_name.sql`-style ordered; logical order below.
001 extensions/types · 002 profiles + signup trigger · 003 tenant/landlord/admin profiles · 004 properties · 005 amenities + property images · 006 units + unit images · 007 rental applications · 008 tenant invitations · 009 tenancies + leases · 010 rent charges + payments · 011 maintenance · 012 notices · 013 messaging · 014 notifications · 015 favorites + inquiries · 016 property verification · 017 reports · 018 audit logs · 019 security helper functions · 020 RLS profiles · 021 RLS properties/units/images · 022 RLS tenant flows · 023 RLS finance+maintenance · 024 RLS communication · 025 RLS verification/audit/reports · 026 storage buckets+policies · 027 business RPCs · 028 triggers/indexes/public view · 029 reference seed (amenities, document types).
`supabase/seed.sql` = clearly-labelled dev data (landlord, tenant, properties, units, tenancy, application, verification request); no real secrets.

Helper functions (`SECURITY DEFINER`, `set search_path = ''`, schema-qualified, execute revoked from `public`/`anon` except where needed): `current_user_id`, `is_admin`, `is_landlord`, `is_tenant`, `owns_property`, `owns_unit`, `is_tenant_of_unit`, `is_tenant_of_tenancy`, plus `is_conversation_participant`. Used inside policies to avoid recursion.

RPCs: `approve_rental_application`, `reject_rental_application`, `confirm_move_in`, `create_tenant_invitation` (returns raw token once), `accept_tenant_invitation`, `end_tenancy`, `submit_property_verification`, `review_property_verification`, `record_manual_payment`, `write_audit_log`.

## 4. Application structure
Next.js App Router with route groups `(public)`, `auth`, `tenant`, `landlord`, `admin` (per brief §28/29), `lib/supabase/{server,client,middleware}`, `lib/validation` (Zod), `services/*` (thin wrappers calling RPCs/queries), `components/`, `types/database.ts` (generated if the local stack runs, otherwise hand-maintained from migrations). Middleware refreshes the session and gates `/tenant`, `/landlord`, `/admin` by role read from `profiles`. Server actions call RPCs for every state transition; no client-side multi-step writes. Dashboards show real data or empty states; no fake defaults.

## 5. Testing
`supabase/tests/*.sql` (pgTAP-style or plain assertion scripts runnable with `supabase test db` / psql) covering brief §35: RLS isolation, tenant cannot self-approve/pay, landlord cannot verify, non-participant messages, public view limits, relationships, active-tenancy uniqueness, approval/invitation/end-tenancy lifecycle, verification flow. A minimal Vitest suite for Zod schemas/role-guard helpers.

## 6. Phases & checkpoints
1. Scaffold + migrations + seed + types
2. SQL tests → **CHECKPOINT: user reviews DB layer**
3. Auth + role route protection + invite flow
4. Public site (home, search/filter, property/unit detail)
5. Tenant, landlord, admin dashboards and pages
6. README (architecture, ERD in Mermaid, permission matrix, setup, deploy notes); clean-checkout verification (`npm run build`, lint, tests).

## 7. Out of scope (YAGNI)
Real payment provider integration, email/SMS delivery (notifications are in-app rows), multi-landlord co-management, multiple occupants per unit, map rendering beyond storing coordinates.
