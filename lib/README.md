# lib

Single home for cross-role logic. Role folders must not duplicate any of it.

- `supabase/` browser, server and middleware clients (and the server-only service-role client)
- `services/` all database access (queries and RPC wrappers), grouped by domain, not by role
- `validation/` Zod schemas
- `auth/` role types, session and role guards
