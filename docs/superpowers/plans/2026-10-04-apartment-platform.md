# Apartment Management Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-landlord rental platform (visitor/tenant/landlord/admin) whose Supabase schema + RLS + RPCs are the foundation, with a Next.js UI on top.

**Architecture:** Modular numbered SQL migrations define tables, helper functions, RLS, storage policies and SECURITY DEFINER RPCs for every state transition. Next.js App Router server components/actions call Supabase (RLS-enforced) and RPCs; middleware gates routes by role.

**Tech Stack:** Next.js (App Router), TypeScript, Tailwind CSS, Zod, Supabase (Auth, Postgres, RLS, Storage), Supabase CLI via `npx supabase`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-04-apartment-platform-design.md` (brief: `Downloads/claude_apartment_platform_from_scratch_prompt.md`)

## Global Constraints
- No `tenant.property_id` / `current_unit_id` anywhere; tenant↔unit only via `tenancies`.
- Money is `numeric(12,2)`; UUID PKs; `created_at`/`updated_at` + update trigger on mutable tables; indexes on all FKs.
- RLS enabled on every `public` table. SECURITY DEFINER functions: `set search_path = ''`, schema-qualified, `revoke execute ... from public, anon` unless needed.
- Partial unique index `tenancies(unit_id) WHERE status='active'`; `UNIQUE(property_id, unit_number)`; `token_hash` unique.
- Roles: `admin|landlord|tenant` only; public signup can never yield admin.
- `verification-documents` bucket PRIVATE. No secrets committed; `.env.example` only.
- Migrations: numbered, focused, no `DROP ... CASCADE`. Files `supabase/migrations/<ts>_NNN_<name>.sql` (timestamps ascending, e.g. `20261004000001_001_extensions_and_types.sql`).
- Phase pause: stop after Task 8 for user review of DB layer.

## Review Focus
- Landlord sets `properties.verification_status='verified'` via direct UPDATE → must be rejected (Task 7).
- Tenant UPDATEs own `tenancies`/`rental_applications`/`payments` status → must be rejected (Task 7).
- Two concurrent approvals / invitation + approval for the same unit → only one active/open tenancy (Task 6).
- Invitation token reuse, expired, revoked, or wrong-email acceptance → rejected (Task 6).
- Signup metadata requesting `role=admin` → becomes tenant (Task 3).

---

### Task 1: Scaffold project
**Files:** Create `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind`/postcss config, `app/layout.tsx`, `app/page.tsx` (placeholder), `.env.example`, `.gitignore`, `supabase/config.toml`, `vitest.config.ts`.
**Interfaces:** Produces npm scripts `dev`, `build`, `lint`, `test`, `db:start`, `db:reset`, `db:test`, `db:types`.
- [ ] Step 1: Scaffold with `npx create-next-app@latest` (TS, Tailwind, App Router, ESLint, no src dir) into the existing folder; add `@supabase/supabase-js @supabase/ssr zod` and dev `vitest`.
- [ ] Step 2: `npx supabase init` (or hand-write `supabase/config.toml` with project id `apartment-management`, storage enabled, auth email signup on).
- [ ] Step 3: `.env.example` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (empty values); add npm db scripts wrapping `npx supabase`.
- [ ] Step 4: Run `npm run build` → passes. Commit (`git init` first if user agreed).

### Task 2: Migrations 001–003 — extensions, types, profiles, role profiles
**Files:** Create migrations 001, 002, 003; `supabase/tests/001_profiles.test.sql`.
**Interfaces:** Produces enums (`user_role`, `user_status`, `verification_status`, etc. — all status enums from the brief, defined in 001), `public.set_updated_at()` trigger fn, tables `profiles`, `tenant_profiles`, `landlord_profiles`, `admin_profiles`.
- [ ] Step 1: Write test: inserting an `auth.users` row with `raw_user_meta_data={"role":"admin"}` yields `profiles.role='tenant'`; role `landlord` yields a `landlord_profiles` row; tenant yields `tenant_profiles` row.
- [ ] Step 2: Implement 001 (pgcrypto, citext optional, enums, `set_updated_at`), 002 (`profiles` + `handle_new_user` trigger on `auth.users`, SECURITY DEFINER; allowed roles from metadata: tenant|landlord, default tenant), 003 (role extension tables with unique `user_id`).
- [ ] Step 3: Apply (`npm run db:reset`) and run test → PASS. Commit.

### Task 3: Migrations 004–006 — properties, amenities, units
**Files:** migrations 004 (properties), 005 (amenities, property_amenities, property_images), 006 (units, unit_images).
**Interfaces:** Produces tables per brief §6 with checks (rent ≥ 0, bedrooms/bathrooms ≥ 0), `UNIQUE(property_id, unit_number)`, indexes on FKs and on `(city)`, `(monthly_rent)`, partial `units(status)`.
- [ ] Step 1: Test: duplicate `(property_id, unit_number)` fails; negative rent fails.
- [ ] Step 2: Implement; apply; PASS; commit.

### Task 4: Migrations 007–011 — applications, invitations, tenancies/leases, finance, maintenance
**Files:** migrations 007–011.
**Interfaces:** Tables per brief §7–10. Partial unique: `rental_applications(tenant_id, unit_id) WHERE status='pending'`; `tenancies(unit_id) WHERE status='active'`; `tenancies(unit_id) WHERE status IN ('pending','active')` (name `uq_tenancies_open_per_unit`); `payments(provider, provider_reference) WHERE provider_reference IS NOT NULL`; `tenant_invitations.token_hash` unique. Trigger on `tenancies` insert/update enforcing `landlord_id` = owner of unit's property.
- [ ] Step 1: Tests: second active tenancy for same unit fails; duplicate pending application fails; mismatched `landlord_id` fails.
- [ ] Step 2: Implement; apply; PASS; commit.

### Task 5: Migrations 012–018 — notices, messaging, notifications, favorites/inquiries, verification, reports, audit
**Files:** migrations 012–018.
**Interfaces:** Tables per brief §11–16. `favorites` CHECK exactly one of `property_id`/`unit_id`, unique per (user,target). `notice_recipients` PK `(notice_id, tenant_id)`. `audit_logs` plain table (policies later).
- [ ] Step 1: Test: favorite with both/neither target fails.
- [ ] Step 2: Implement; apply; PASS; commit.

### Task 6: Migrations 019, 027 — helper functions and business RPCs
**Files:** migrations 019 (helpers), 027 (RPCs), `supabase/tests/030_lifecycle.test.sql`.
**Interfaces:**
- Helpers (all `stable security definer`): `current_user_id() uuid`, `is_admin() bool`, `is_landlord() bool`, `is_tenant() bool`, `owns_property(uuid) bool`, `owns_unit(uuid) bool`, `is_tenant_of_unit(uuid) bool`, `is_tenant_of_tenancy(uuid) bool`, `is_conversation_participant(uuid) bool`, `my_tenant_profile_id() uuid`, `my_landlord_profile_id() uuid`.
- RPCs: `approve_rental_application(p_application_id uuid) returns uuid` (tenancy id; locks unit row `FOR UPDATE`), `reject_rental_application(p_application_id uuid, p_reason text)`, `confirm_move_in(p_tenancy_id uuid)`, `create_tenant_invitation(p_unit_id uuid, p_email text, p_phone text, p_ttl interval default '7 days') returns text` (raw token, stored as sha256 hex), `accept_tenant_invitation(p_token text) returns uuid`, `end_tenancy(p_tenancy_id uuid, p_end_date date, p_notes text)`, `submit_property_verification(p_property_id uuid) returns uuid`, `review_property_verification(p_request_id uuid, p_decision text, p_reason text)` (admin only; decision `approved|rejected`), `record_manual_payment(p_charge_id uuid, p_amount numeric, p_method text)`, `write_audit_log(p_action text, p_entity_type text, p_entity_id uuid, p_old jsonb, p_new jsonb, p_meta jsonb)`.
- [ ] Step 1: Lifecycle tests (impersonate via `set local role authenticated; set local request.jwt.claims`): approval creates `pending` tenancy + `reserved` unit + notification + audit row; confirm_move_in → `active`/`occupied`; invitation accept creates `active` tenancy; reuse/expired/revoked token fails; end_tenancy sets `ended`, unit `vacant`, keeps rows; second approval for same unit fails; wrong landlord cannot approve/invite.
- [ ] Step 2: Implement helpers then RPCs (each validates caller via helpers, runs atomically, writes notification + audit). Revoke execute from `anon`/`public`; grant to `authenticated`.
- [ ] Step 3: Apply; run tests → PASS. Commit.

### Task 7: Migrations 020–026 — RLS and storage
**Files:** migrations 020–026, `supabase/tests/040_rls.test.sql`, `050_storage.test.sql`.
**Interfaces:** Policies per brief §19; column-guard triggers: `profiles` (role/status admin-only), `properties` (`verification_status`, and `published` requires verified-or-admin path), `tenancies`/`rental_applications`/`payments`/`rent_charges` (no direct status/identity changes by tenant; landlord limited to RPC paths); `audit_logs` insert-only via RPC; buckets `property-images`,`unit-images`,`avatars` (public read except avatars owner-read), `verification-documents`,`maintenance-attachments` private with path-prefix policies.
- [ ] Step 1: Tests (as listed in brief §35): tenant can't read others' tenancy or modify own; landlord can't see other landlord's properties or set verified; tenant can't change application status or mark payment successful; non-participant can't read messages; `anon` selects only from `public_property_listings`/published+verified rows; verification docs not readable by other landlords.
- [ ] Step 2: Implement policies (use helper fns, never subquery protected tables recursively); apply; run tests → PASS. Commit.

### Task 8: Migrations 028–029, seed, types, remaining SQL tests
**Files:** migrations 028 (triggers, indexes, `public_property_listings` view), 029 (amenities, document types), `supabase/seed.sql`, `scripts/create-admin.ts`, `types/database.ts`, `supabase/tests/060_relationships_verification.test.sql`.
- [ ] Step 1: Tests: view exposes no landlord private/verification columns and only published+verified; verification flow submit→admin approve sets `verified`; reject records reason; landlord direct verify blocked.
- [ ] Step 2: Implement; seed clearly marked DEV ONLY (sample landlord/tenant via `auth.users` inserts with fake emails, 2 properties, units, one active tenancy, one pending application, one verification request); `create-admin.ts` uses service role to create admin and set role.
- [ ] Step 3: `npm run db:reset && npm run db:test` all PASS; generate `types/database.ts` via `npx supabase gen types typescript --local` (if stack unavailable, hand-write from migrations and note it). Commit.
- [ ] Step 4: **STOP — user reviews database layer.** If Docker/local stack cannot run, report that SQL was not executed.

### Task 9: Supabase clients, middleware, Zod schemas, auth pages
**Files:** `lib/supabase/{server,client}.ts`, `middleware.ts`, `lib/auth/roles.ts`, `lib/validation/auth.ts`, `app/auth/{login,register,forgot-password,reset-password,invite}/page.tsx`, `app/auth/actions.ts`, `lib/auth/roles.test.ts`.
**Interfaces:** `getSessionProfile(): Promise<{userId:string; role:'admin'|'landlord'|'tenant'} | null>`; `roleHome(role): string`; `canAccess(role, pathname): boolean` (pure, unit-tested); Zod `registerSchema` (role limited to tenant|landlord), `loginSchema`.
- [ ] Step 1: Vitest tests for `canAccess` (tenant blocked from `/landlord`,`/admin`; visitor blocked from dashboards; admin allowed `/admin`) and `registerSchema` rejecting `role:'admin'`. Run → FAIL.
- [ ] Step 2: Implement; tests PASS. Middleware refreshes session and redirects by `canAccess`. Invite page: token from query, requires login/register then calls `accept_tenant_invitation`.
- [ ] Step 3: `npm run build` passes. Commit.

### Task 10: Public site
**Files:** `app/visitor/{page,properties/page,properties/[id]/page,units/[id]/page}.tsx`, `features/visitor/*` + `lib/services/listings.ts`, `lib/validation/search.ts`, `components/{ListingCard,SearchFilters,VerifiedBadge}.tsx`.
**Interfaces:** `searchListings(filters: SearchFilters): Promise<ListingRow[]>` querying `public_property_listings`; `SearchFilters` Zod schema (city, minRent, maxRent, bedrooms, propertyType, amenities[]); invalid params fall back to defaults, never throw.
- [ ] Step 1: Vitest: `parseSearchParams` handles garbage/negative/missing values. FAIL → implement → PASS.
- [ ] Step 2: Pages with real queries + empty states; build passes; commit.

### Task 11: Tenant area
**Files:** `app/tenant/{page(dashboard),tenancy,applications,invitations,history,payments,maintenance,notices,messages,profile}/page.tsx`, `features/tenant/*` + `lib/services/tenancies.ts`, server actions for apply/withdraw/maintenance create/mark notice read.
- [ ] Dashboard derives from active tenancy→unit→property→landlord; "No Active Tenancy" state with links when none. Apply action inserts application via RLS; accept invitation via RPC. Build passes; commit.

### Task 12: Landlord area
**Files:** `app/landlord/{page,properties,properties/[id],units,tenants,applications,invitations,payments,maintenance,notices,verification,profile}/…`, `features/landlord/*` + `lib/services/*`, actions calling `approve/reject/confirm_move_in/end_tenancy/create_tenant_invitation/submit_property_verification/record_manual_payment`.
- [ ] Dashboard metrics from queries with property switcher (`?property=` param validated by Zod uuid). Invitation URL shown once from RPC result. Build passes; commit.

### Task 13: Admin area
**Files:** `app/admin/{dashboard,users,landlords,properties,verifications,reports,audit-logs}/page.tsx`, `features/admin/*` + `lib/services/admin.ts`, actions: `review_property_verification`, suspend user/property (via admin-only RPC `admin_set_user_status`, `admin_set_property_status` added in a migration 030 with a test).
- [ ] Build passes; commit.

### Task 14: README and clean-checkout verification
**Files:** `README.md` (all 15 sections of brief §37, Mermaid ERD, permission matrix, migration order, deploy notes).
- [ ] Follow README from scratch in a temp copy: `npm ci`, `npx supabase start`, `npm run db:reset`, `npm run db:test`, `npm run test`, `npm run lint`, `npm run build` — all pass. Report anything not runnable.
