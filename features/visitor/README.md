# features/visitor

Business and UI implementation for the **public / unauthenticated** area. Routes live in `app/visitor/`; the homepage `app/page.tsx` composes this feature too.

## Ownership
Public site team (discovery and SEO).

## Allowed responsibilities
Public property discovery, search, filtering, property and unit details, homepage and static public pages (about, contact, terms).

Not allowed: anything that requires a session, reads private data, or mutates lifecycle state. Sign-in/registration pages are shared auth routes, not visitor features.

## Suggested layout
```
features/visitor/
  dashboard/  search/  property-details/  unit-details/  pages/
  nav.ts  index.ts
```
(`dashboard/` is the discovery landing page shown at `/visitor` and `/`.)

## Database
Read-only through the `public_property_listings` view (published and verified properties; vacant or reserved units; explicit safe columns). Reference data: `amenities`, `property_amenities`, public `property_images`/`unit_images`.
Optional, with a signed-in user via the shared flow: `property_inquiries`, `favorites`.

## RPCs
None. Visitors never call lifecycle RPCs.

## Integration rules
- Query only the public view and public reference tables via `lib/services`; validate search/filter params with `lib/validation`.
- Sending an inquiry or saving a favourite requires login and is delegated to shared services, not reimplemented here.
- No imports from other `features/*`.

## Security restrictions
- Never select from base tables such as `properties`, `units` or `profiles` here; the view is the contract.
- Never expose landlord contact details, addresses beyond what the view returns, or verification documents.
- Treat all search params as untrusted input.

## Shared code to use
`lib/supabase` (anon/server client), `lib/services`, `lib/validation/search`, `types/database.ts`, `components/ui` (listing cards, badges), `components/layout`.
