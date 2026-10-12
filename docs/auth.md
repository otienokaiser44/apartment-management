# Authentication

Supabase email/password auth, one project, two registration experiences (tenant, landlord). Admins are never self-registered.

## Routes

| URL | Purpose |
|---|---|
| `/auth/tenant/signup`, `/login`, `/forgot-password` | Tenant experience (`features/tenant/auth/`) |
| `/auth/landlord/signup`, `/login`, `/forgot-password` | Landlord / property manager experience (`features/landlord/auth/`) |
| `/auth/callback` | Email confirmation + password recovery (PKCE `code`, or `token_hash`+`type`) |
| `/auth/reset-password` | Role-neutral "choose a new password" page (needs the recovery session) |
| `/auth/signout` | POST only; clears the session, redirects to `/` |

`app/auth/*` only composes feature components. The homepage (`features/visitor/dashboard/AuthEntryPoints.tsx`) links to all four entry points; browsing listings needs no account.

## Where the code lives

- `lib/supabase/` browser, server and proxy (session refresh) clients. No service-role client is used by auth.
- `lib/services/auth.ts` sign-up, sign-in, reset, update-password, sign-out (the only place that calls `supabase.auth`).
- `lib/auth/` roles + `LOGIN_PATH`, `session.ts` (`getSessionUser`, `requireRole`), `redirects.ts` (open-redirect guard), `fields.ts`, shared `actions.ts`.
- `lib/validation/auth.ts` Zod schemas (server-side authoritative; the forms reuse the same fields).
- `components/auth/` `AuthCard`, `AuthForm` (password visibility, loading, error/success states).
- `proxy.ts` (Next 16 name for middleware) refreshes the session on every request and sends signed-out users from `/tenant`, `/landlord`, `/admin` to the matching login with `?next=`.

## Roles and profiles (no new mechanism)

The existing `handle_new_user` trigger (migration 003) creates `profiles` plus `tenant_profiles` or `landlord_profiles`. It maps signup metadata `role` to `landlord` and **everything else, including `admin`, to `tenant`**. The server action fixes the value (`"tenant"` or `"landlord"`); the forms have no role field and the Zod schemas strip one. Because anyone can call Supabase directly, the guarantee that matters is the database one: metadata can at most pick tenant or landlord, never admin, and `profiles.role` cannot be changed by clients (guard triggers, tested in `supabase/tests/010_signup_and_profiles.sql`). Admins come only from `scripts/create-admin.mjs`.

Registration does not verify a landlord or property and does not create a tenancy. Tenants join units only through the existing application / invitation / tenancy RPCs.

## Behavior notes

- Login enforces the page's role: a landlord using tenant login is signed out with a pointer to the right page. Admins may use either login page.
- Suspended accounts cannot log in and are redirected away from dashboards.
- Forgot-password always answers with the same message (no account enumeration).
- `next` is accepted only as a same-origin path and never into another role's area (`lib/auth/redirects.ts`).
- Role layouts (`requireRole`) validate the user with `auth.getUser()` and the real `profiles.role`. This is UX; RLS stays the security boundary.

## Account settings (all roles)

Every signed-in person has **Settings** (avatar menu -> Settings) at `/tenant/settings`, `/landlord/settings` (owners and managers) and `/admin/settings`, backed by the shared `features/account` module.

| Section | What it does | How |
|---|---|---|
| Profile | name, phone, picture; landlord business name; tenant emergency contact | direct updates under RLS; the picture goes to the private `avatars` bucket and is served by `/account/avatar` |
| Email & account | change sign-in email | `auth.updateUser({ email })`; Supabase emails a confirmation link and `profiles.email` follows through a trigger once confirmed |
| Password & security | change password (current password required), sign out other devices / everywhere | the current password is checked with a throw-away, non-persisting client; then `updateUser` and `signOut({ scope })` |
| Notifications | mute in-app categories (announcements, billing, tenancy, team) | `notification_preferences`; a trigger on `notifications` skips muted categories, so every writer is covered |
| Appearance | System / Light / Dark | `data-theme` on `<html>`, saved in localStorage, applied before first paint |
| Privacy & data | download my data (JSON), deactivate account | `/account/export`; `deactivate_my_account()` (blocked while a tenancy is active or pending; admins excluded) |

Security notes: `profiles.email` can no longer be edited by users (migration 034), because invitation checks compare against it. Avatars are accepted only if their first bytes are PNG, JPEG or WebP (never SVG), and must live in the user own storage folder. Not built yet: two-factor authentication, language/time-zone preferences, email/SMS delivery of notifications, permanent self-service deletion (support handles erasure so tenancy and payment records stay consistent).

## Configuration

`.env.example` already has everything needed: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (anon/publishable), `NEXT_PUBLIC_SITE_URL` (used for email links). `SUPABASE_SERVICE_ROLE_KEY` is not used by auth and must never be `NEXT_PUBLIC_`.

Supabase dashboard / `supabase/config.toml`: add `<site>/auth/callback` to the redirect allow-list (local `additional_redirect_urls` already covers localhost). Local config has `enable_confirmations = false`; **turn it on in production**. With confirmation on, signup shows "check your email" and the callback signs the user in.

## Tests

```bash
npm test          # node:test unit tests (redirect guard, validation)
npm run typecheck
npm run lint
npm run build
node scripts/db-test.mjs   # SQL: signup trigger, role guards, RLS (needs local Supabase)
```
Flows that need a live Supabase (signup, login, confirmation, recovery, session refresh) are verified manually against `supabase start`; not covered by automated tests yet.
