# Apartment Management Platform

Multi-landlord rental platform on Next.js and Supabase with four product areas: visitor, tenant, landlord and admin. See [docs/architecture.md](docs/architecture.md).

## Structure

```
app/
  admin/  landlord/  tenant/  visitor/   routing and page composition per role (own layout + dashboard)
  page.tsx                               public homepage (composes features/visitor)
features/
  admin/  landlord/  tenant/  visitor/   role-specific UI and business logic (each has a README)
components/  lib/  types/  hooks/        shared code: UI, Supabase clients, services, validation, auth, types
supabase/                                migrations, seed, SQL tests
scripts/                                 create-admin, db-test
```

Ownership and boundaries:

- [features/visitor](features/visitor/README.md): public discovery, search, details, homepage
- [features/tenant](features/tenant/README.md): tenancy, applications, payments, maintenance, notices, messages
- [features/landlord](features/landlord/README.md): properties, units, tenants, applications, invitations, verification, payments, maintenance
- [features/admin](features/admin/README.md): users, landlords, verification, moderation, reports, audit logs

Key rules: a role never imports another role's feature (enforced by ESLint); shared code lives in `components/`, `lib/`, `types/`, `hooks/`; tenancy is always `tenant_profile -> tenancy -> unit -> property -> landlord`; lifecycle changes go through Supabase RPCs, never direct status writes.

## Development

```bash
npm install
npm run dev
npm run lint
npm run build
```

Open http://localhost:3000. Routes: `/`, `/visitor`, `/tenant`, `/landlord`, `/admin`.

## Database

Schema and RLS are in `supabase/migrations/` (001-029) with tests in `supabase/tests/`. Admin accounts are created only with `scripts/create-admin.mjs`.
