# Tenant portal

What a tenant can do, where it lives, and how it maps onto the schema. Migration `035_tenant_portal.sql`; tests `supabase/tests/110_tenant_portal.sql`.

## Pages (`app/tenant/*`, implemented in `features/tenant/`)

| Route | Purpose |
|---|---|
| `/tenant` | Dashboard: pending lease offers, residency card, contacts, this month's bill, quick actions, latest notices |
| `/tenant/invoices` | Itemised statement (rent, water, garbage, penalties, balance brought forward), payment status, how to pay, history |
| `/tenant/tickets`, `/tenant/tickets/[id]` | Maintenance: tracker board, submit-ticket dialog (with attachments), ticket timeline and replies |
| `/tenant/vacate` | Formal notice to vacate and a tracker for acknowledgement, inspection and deposit refund |
| `/tenant/notices` | Announcements with category badges (General notice, Maintenance, Urgent alert) |
| `/tenant/notifications`, `/tenant/settings` | Notification inbox and account settings (shared `features/account`) |

Landlords, property managers and caretakers get the other side: `/landlord/maintenance`, `/landlord/move-outs`, a category on every announcement, and payment instructions in the billing settings.

## How the request maps onto existing tables

The data model stays **tenant -> tenancy -> unit -> property -> landlord**; nothing was duplicated.

| Request | Implementation |
|---|---|
| "lease" with `pending_approval` | A landlord-initiated **link request** (`tenant_link_requests`) waiting for the tenant: shown as a banner with Accept lease / Decline. An application the landlord approved shows as "move-in pending". There is no separate lease status. |
| Active residency card | `tenant_tenancy_overview` + the unit's floor/type + `tenant_property_contacts` |
| `maintenance_tickets` | Existing `maintenance_requests` (+ `category`) and a new timeline table `maintenance_updates`. `property_id` comes from the unit. |
| `vacate_notices.lease_id` | `tenancy_id` (a tenancy is the occupancy record) |
| Announcement categories | `notices.category` (`general`, `maintenance`, `urgent`) |
| Invoices / utility billing view | `invoice_overview` (031), tenant read access via RLS, readings via `utility_readings` |
| M-Pesa Paybill instructions | `property_settings.mpesa_paybill` + `payment_instructions`, exposed to tenants through `tenant_payment_info` |

## Tickets

`submit_maintenance_ticket`, `update_maintenance_ticket`, `comment_on_maintenance_ticket`, `cancel_maintenance_ticket`.

- Categories: plumbing, electrical, carpentry, general. Tenants choose low, medium or high priority.
- Status: open -> in progress -> resolved -> closed (a tenant may cancel while open). The database enforces the allowed moves.
- Owners, property managers **and caretakers** can work tickets; every change is a timeline entry that names the role, and notifies the other side.
- Attachments (up to 3 files, 8 MB each; PNG, JPEG, WebP, PDF) are uploaded by the browser to the private `maintenance-attachments` bucket under `<ticket id>/...` and shown through short-lived signed URLs. File type is decided by content, not by name.
- A tenant may have at most 20 open tickets.

## Move-out notices

`submit_vacate_notice`, `withdraw_vacate_notice`, `advance_vacate_notice` (`acknowledge` -> `schedule_inspection` -> `record_refund`).

- The date is mandatory: tomorrow or later, at most a year ahead. One live notice per tenancy.
- Status: submitted -> approved ("acknowledged") -> inspection_pending -> deposit_refunded (a tenant can withdraw until the inspection is scheduled).
- Refund plus deductions cannot exceed the deposit snapshot taken at submission; deductions need an explanation.
- Ending the tenancy stays a separate, existing action (`end_tenancy`): the move-outs page offers it once the deposit is refunded.
- Refund account details are visible to the tenant, owner and property managers, not to caretakers.

## Not built (yet)

- M-Pesa STK Push or any payment initiation: tenants see Paybill instructions; the landlord records payments (`record_manual_payment`).
- Tenant "report a payment" (M-Pesa code) for landlords to confirm.
- Email/SMS delivery of notifications (in-app only).
