-- Tenant portal: maintenance tickets (with timeline), vacate notices, announcement categories and the tenant-facing views.
--
--   P1 (landlord 1): A01 (2001, tenant1 lives here, deposit 1000), A02 (2002, vacant)
--   d01 = property manager of P1, d02 = caretaker of P1, d03 = manager with no assignment
begin;
\ir support/helpers.sql
\ir support/fixtures.sql

insert into auth.users (id, email, phone, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000d01', 'mgr1@example.test', null, '{"full_name":"Manager One","role":"manager"}'),
  ('00000000-0000-0000-0000-000000000d02', 'care1@example.test', null, '{"full_name":"Caretaker One","role":"manager"}'),
  ('00000000-0000-0000-0000-000000000d03', 'mgr3@example.test', null, '{"full_name":"Manager Three","role":"manager"}');
insert into public.property_staff (property_id, user_id, role) values
  (t.u('1001'), t.u('d01'), 'property_manager'),
  (t.u('1001'), t.u('d02'), 'caretaker');
update public.landlord_profiles set business_name = 'Sunrise Holdings' where user_id = t.u('b01');

insert into public.tenancies (id, tenant_id, unit_id, landlord_id, start_date, monthly_rent, security_deposit, status)
values (t.u('3001'), t.tenant_pid(t.u('c01')), t.u('2001'), t.landlord_pid(t.u('b01')), current_date - 60, 1000, 1000, 'active');
update public.units set status = 'occupied', floor_number = 1 where id = t.u('2001');

-- ===== helpers ======================================================================================================
select t.as_owner();
select t.eq(public.notification_category('maintenance_update'), 'maintenance', 'maintenance notifications have their own category');
select t.eq(public.notification_category('vacate_update'), 'tenancy', 'vacate notifications are tenancy');

-- ===== maintenance: submitting =========================================================================================
select t.as_user(t.u('c02'));
select t.throws($q$select public.submit_maintenance_ticket(t.u('3001'), 'Leaking sink', 'plumbing', 'high')$q$, 'a tenant cannot file against someone else''s tenancy', 'P0002');
select t.as_user(t.u('b01'));
select t.throws($q$select public.submit_maintenance_ticket(t.u('3001'), 'Leaking sink', 'plumbing', 'high')$q$, 'landlords cannot submit tickets', '42501');
select t.as_user(t.u('c01'));
select t.throws($q$select public.submit_maintenance_ticket(t.u('3001'), 'x', 'plumbing', 'high')$q$, 'title must be long enough', '22023');
select t.throws($q$select public.submit_maintenance_ticket(t.u('3001'), 'Leaking sink', 'gardening', 'high')$q$, 'category must be known', '22023');
select t.throws($q$select public.submit_maintenance_ticket(t.u('3001'), 'Leaking sink', 'plumbing', 'urgent')$q$, 'tenants choose low, medium or high', '22023');
select t.throws(format($q$select public.submit_maintenance_ticket(t.u('3001'), 'Leaking sink', 'plumbing', 'low', %L)$q$, repeat('x', 4001)), 'description is capped', '22023');

select public.submit_maintenance_ticket(t.u('3001'), 'Leaking sink', 'plumbing', 'high', 'Water under the kitchen sink') as tk1 \gset
select t.as_owner();
select t.eq((select category || '/' || priority::text || '/' || status::text from public.maintenance_requests where id = :'tk1'), 'plumbing/high/open', 'ticket stored with category, priority and open status');
select t.eq((select count(*) from public.maintenance_updates where request_id = :'tk1' and kind = 'created')::text, '1', 'a created entry starts the timeline');
select t.eq((select count(*) from public.notifications where type = 'maintenance_submitted')::text, '3', 'owner, manager and caretaker are notified');

-- ===== maintenance: visibility ============================================================================================
select t.as_user(t.u('c01'));
select t.eq((select count(*) from public.maintenance_requests)::text, '1', 'the tenant sees their ticket');
select t.as_user(t.u('c02'));
select t.eq((select count(*) from public.maintenance_requests)::text, '0', 'other tenants do not');
select t.as_user(t.u('b02'));
select t.eq((select count(*) from public.maintenance_requests)::text, '0', 'other landlords do not');
select t.as_user(t.u('b01'));
select t.eq((select count(*) from public.maintenance_requests)::text, '1', 'the owner sees it');
select t.as_user(t.u('d01'));
select t.eq((select count(*) from public.maintenance_requests)::text, '1', 'the property manager sees it');
select t.as_user(t.u('d02'));
select t.eq((select count(*) from public.maintenance_requests)::text, '1', 'the caretaker sees it');
select t.eq((select count(*) from public.maintenance_updates)::text, '1', 'and its timeline');
select t.as_user(t.u('d03'));
select t.eq((select count(*) from public.maintenance_requests)::text, '0', 'an unassigned manager does not');
select t.eq((select count(*) from public.maintenance_updates)::text, '0', 'nor the timeline');

-- ===== maintenance: handling ================================================================================================
select t.as_user(t.u('c01'));
select t.throws(format($q$select public.update_maintenance_ticket(%L, 'resolved')$q$, :'tk1'), 'tenants cannot change a ticket''s status', 'P0002');
select t.as_user(t.u('d03'));
select t.throws(format($q$select public.update_maintenance_ticket(%L, 'in_progress')$q$, :'tk1'), 'unassigned staff cannot', 'P0002');
select t.as_user(t.u('d02'));
select t.throws(format($q$select public.update_maintenance_ticket(%L)$q$, :'tk1'), 'an empty update is rejected', '22023');
select t.throws(format($q$select public.update_maintenance_ticket(%L, 'open')$q$, :'tk1'), 'setting the same status changes nothing', '22023');
select t.throws(format($q$select public.update_maintenance_ticket(%L, 'cancelled')$q$, :'tk1'), 'staff cannot cancel on a tenant''s behalf', '22023');
select t.lives(format($q$select public.update_maintenance_ticket(%L, 'in_progress', 'Plumber booked for Thursday')$q$, :'tk1'), 'the caretaker moves it to in progress');
select t.as_owner();
select t.eq((select author_role from public.maintenance_updates where request_id = :'tk1' and kind = 'status_change'), 'caretaker', 'the timeline records who acted, as a caretaker');
select t.eq((select count(*) from public.notifications where user_id = t.u('c01') and type = 'maintenance_update')::text, '1', 'the tenant is notified');
select t.as_user(t.u('d01'));
select t.lives(format($q$select public.update_maintenance_ticket(%L, 'resolved', 'Pipe replaced')$q$, :'tk1'), 'the manager resolves it');
select t.as_owner();
select t.ok((select resolved_at is not null from public.maintenance_requests where id = :'tk1'), 'resolved_at is set');
select t.as_user(t.u('b01'));
select t.throws(format($q$select public.update_maintenance_ticket(%L, 'open')$q$, :'tk1'), 'a resolved ticket cannot go back to open', '22023');
select t.lives(format($q$select public.update_maintenance_ticket(%L, 'closed')$q$, :'tk1'), 'the owner closes it');
select t.as_user(t.u('c01'));
select t.throws(format($q$select public.comment_on_maintenance_ticket(%L, 'thanks')$q$, :'tk1'), 'a closed ticket takes no more comments', '22023');
select t.eq((select count(*) from public.maintenance_updates where request_id = :'tk1')::text, '4', 'the tenant sees the full timeline (created, 3 status changes)');

-- comments and cancelling
select public.submit_maintenance_ticket(t.u('3001'), 'Broken window latch', 'carpentry', 'low') as tk2 \gset
select t.lives(format($q$select public.comment_on_maintenance_ticket(%L, 'It is the bedroom window')$q$, :'tk2'), 'the tenant comments');
select t.as_user(t.u('c02'));
select t.throws(format($q$select public.comment_on_maintenance_ticket(%L, 'hello')$q$, :'tk2'), 'other tenants cannot comment', 'P0002');
select t.throws(format($q$select public.cancel_maintenance_ticket(%L)$q$, :'tk2'), 'other tenants cannot cancel', 'P0002');
select t.as_user(t.u('b01'));
select t.lives(format($q$select public.comment_on_maintenance_ticket(%L, 'We will send someone')$q$, :'tk2'), 'the owner replies');
select t.as_user(t.u('c01'));
select t.lives(format($q$select public.cancel_maintenance_ticket(%L)$q$, :'tk2'), 'the tenant cancels an open ticket');
select t.throws(format($q$select public.cancel_maintenance_ticket(%L)$q$, :'tk2'), 'cannot cancel twice', '22023');
select t.as_owner();
select t.eq((select status::text from public.maintenance_requests where id = :'tk2'), 'cancelled', 'the ticket is cancelled');
select t.eq((select string_agg(author_role || ':' || kind, ',' order by created_at) from public.maintenance_updates where request_id = :'tk2'),
            'tenant:created,tenant:comment,landlord:comment,tenant:status_change', 'the timeline reads in order');

-- clients cannot write the timeline or tickets' protected columns directly
select t.as_user(t.u('c01'));
select t.throws(format($q$insert into public.maintenance_updates (request_id, author_role, kind, message) values (%L, 'tenant', 'comment', 'forged')$q$, :'tk1'),
  'the timeline cannot be written directly', '42501');

-- open-ticket cap
select t.as_owner();
insert into public.maintenance_requests (tenant_id, unit_id, tenancy_id, title)
select t.tenant_pid(t.u('c01')), t.u('2001'), t.u('3001'), 'Bulk ' || g from generate_series(1, 25) g;
select t.as_user(t.u('c01'));
select t.throws($q$select public.submit_maintenance_ticket(t.u('3001'), 'One more', 'general', 'low')$q$, 'too many open tickets are refused', '22023', 'too many open tickets');

-- ===== vacate notices: submitting =============================================================================================
select t.as_user(t.u('c02'));
select t.throws($q$select public.submit_vacate_notice(t.u('3001'), current_date + 45, 'Moving', null)$q$, 'only the tenant of the tenancy can give notice', 'P0002');
select t.as_user(t.u('b01'));
select t.throws($q$select public.submit_vacate_notice(t.u('3001'), current_date + 45, 'Moving', null)$q$, 'landlords cannot give notice', '42501');
select t.as_user(t.u('c01'));
select t.throws($q$select public.submit_vacate_notice(t.u('3001'), null, 'Moving', null)$q$, 'a move-out date is mandatory', '22023', 'choose your move-out date');
select t.throws($q$select public.submit_vacate_notice(t.u('3001'), current_date, 'Moving', null)$q$, 'today is not allowed', '22023', 'in the future');
select t.throws($q$select public.submit_vacate_notice(t.u('3001'), current_date - 3, 'Moving', null)$q$, 'the past is not allowed', '22023');
select t.throws($q$select public.submit_vacate_notice(t.u('3001'), current_date + 400, 'Moving', null)$q$, 'more than a year ahead is not allowed', '22023');
select t.throws($q$select public.submit_vacate_notice(t.u('3001'), current_date + 45, 'x', null)$q$, 'a reason is required', '22023');

select public.submit_vacate_notice(t.u('3001'), current_date + 45, 'Relocating for work', 'M-Pesa 0700 000 000') as vn1 \gset
select t.throws($q$select public.submit_vacate_notice(t.u('3001'), current_date + 60, 'Changed my mind', null)$q$, 'only one open notice per tenancy', '23505');
select t.as_owner();
select t.eq((select status || '/' || deposit_held::text from public.vacate_notices where id = :'vn1'), 'submitted/1000.00', 'stored as submitted with the deposit snapshot');
select t.eq((select count(*) from public.notifications where type = 'vacate_submitted')::text, '3', 'owner, manager and caretaker are told');

-- visibility
select t.as_user(t.u('c01'));
select t.eq((select count(*) from public.vacate_notices)::text, '1', 'the tenant sees their notice');
select t.as_user(t.u('c02'));
select t.eq((select count(*) from public.vacate_notices)::text, '0', 'other tenants do not');
select t.as_user(t.u('b01'));
select t.eq((select count(*) from public.vacate_notices)::text, '1', 'the owner sees it (including refund details)');
select t.as_user(t.u('d01'));
select t.eq((select count(*) from public.vacate_notices)::text, '1', 'the property manager sees it');
select t.as_user(t.u('d02'));
select t.eq((select count(*) from public.vacate_notices)::text, '0', 'the caretaker does not (private refund details)');
select t.as_user(t.u('b02'));
select t.eq((select count(*) from public.vacate_notices)::text, '0', 'other landlords do not');

-- ===== vacate notices: the landlord side ===========================================================================================
select t.as_user(t.u('c01'));
select t.throws(format($q$select public.advance_vacate_notice(%L, 'acknowledge')$q$, :'vn1'), 'tenants cannot advance their own notice', 'P0002');
select t.throws(format($q$update public.vacate_notices set status = 'deposit_refunded' where id = %L$q$, :'vn1'), 'no direct status writes', '42501');
select t.as_user(t.u('d02'));
select t.throws(format($q$select public.advance_vacate_notice(%L, 'acknowledge')$q$, :'vn1'), 'caretakers cannot advance notices', 'P0002');
select t.as_user(t.u('b02'));
select t.throws(format($q$select public.advance_vacate_notice(%L, 'acknowledge')$q$, :'vn1'), 'other landlords cannot', 'P0002');

select t.as_user(t.u('b01'));
select t.throws(format($q$select public.advance_vacate_notice(%L, 'schedule_inspection', now() + interval '10 days')$q$, :'vn1'), 'cannot schedule before acknowledging', '22023');
select t.throws(format($q$select public.advance_vacate_notice(%L, 'record_refund', null, 500)$q$, :'vn1'), 'cannot refund before the inspection', '22023');
select t.throws(format($q$select public.advance_vacate_notice(%L, 'explode')$q$, :'vn1'), 'unknown actions are refused', '22023');
select t.lives(format($q$select public.advance_vacate_notice(%L, 'acknowledge', null, null, null, 'Noted, thanks')$q$, :'vn1'), 'the owner acknowledges');
select t.as_owner();
select t.eq((select status from public.vacate_notices where id = :'vn1'), 'approved', 'status is approved');
select t.ok((select acknowledged_at is not null from public.vacate_notices where id = :'vn1'), 'acknowledgement time is recorded');
select t.eq((select count(*) from public.notifications where user_id = t.u('c01') and type = 'vacate_update')::text, '1', 'the tenant is notified');

select t.as_user(t.u('d01'));
select t.throws(format($q$select public.advance_vacate_notice(%L, 'schedule_inspection')$q$, :'vn1'), 'an inspection time is required', '22023');
select t.throws(format($q$select public.advance_vacate_notice(%L, 'schedule_inspection', now() - interval '1 day')$q$, :'vn1'), 'it cannot be in the past', '22023');
select t.lives(format($q$select public.advance_vacate_notice(%L, 'schedule_inspection', now() + interval '20 days')$q$, :'vn1'), 'the manager schedules the inspection');
select t.as_user(t.u('c01'));
select t.throws(format($q$select public.withdraw_vacate_notice(%L)$q$, :'vn1'), 'too late to withdraw once the inspection is scheduled', '22023');
select t.as_user(t.u('b01'));
select t.throws(format($q$select public.advance_vacate_notice(%L, 'record_refund')$q$, :'vn1'), 'the refund amount is required', '22023');
select t.throws(format($q$select public.advance_vacate_notice(%L, 'record_refund', null, -5)$q$, :'vn1'), 'refunds cannot be negative', '22023');
select t.throws(format($q$select public.advance_vacate_notice(%L, 'record_refund', null, 900, 200, 'Painting')$q$, :'vn1'), 'refund plus deductions cannot exceed the deposit', '22023', 'cannot exceed the deposit');
select t.throws(format($q$select public.advance_vacate_notice(%L, 'record_refund', null, 800, 200)$q$, :'vn1'), 'deductions need an explanation', '22023');
select t.lives(format($q$select public.advance_vacate_notice(%L, 'record_refund', null, 800, 200, 'Wall repair')$q$, :'vn1'), 'the refund is recorded');
select t.as_owner();
select t.eq((select status || '/' || refund_amount::text || '/' || deductions::text from public.vacate_notices where id = :'vn1'), 'deposit_refunded/800.00/200.00', 'refund and deductions are stored');
select t.ok((select refunded_at is not null from public.vacate_notices where id = :'vn1'), 'refund time is recorded');
select t.as_user(t.u('b01'));
select t.throws(format($q$select public.advance_vacate_notice(%L, 'acknowledge')$q$, :'vn1'), 'a finished notice cannot be advanced again', '22023');

-- withdrawing a new notice
select t.as_user(t.u('c01'));
select public.submit_vacate_notice(t.u('3001'), current_date + 90, 'Plans changed later', null) as vn2 \gset
select t.as_user(t.u('c02'));
select t.throws(format($q$select public.withdraw_vacate_notice(%L)$q$, :'vn2'), 'other tenants cannot withdraw', 'P0002');
select t.as_user(t.u('c01'));
select t.lives(format($q$select public.withdraw_vacate_notice(%L)$q$, :'vn2'), 'the tenant withdraws a submitted notice');
select t.throws(format($q$select public.withdraw_vacate_notice(%L)$q$, :'vn2'), 'cannot withdraw twice', '22023');
select t.throws($q$insert into public.vacate_notices (tenancy_id, tenant_id, intended_move_out_date, reason) values (t.u('3001'), t.tenant_pid(t.u('c01')), current_date + 10, 'direct')$q$,
  'notices cannot be inserted directly', '42501');

-- ===== announcement categories =======================================================================================================
select t.as_user(t.u('b01'));
select t.throws($q$select public.send_announcement(t.u('1001'), 'T', 'M', 'all', null, null, 'spam')$q$, 'unknown categories are refused', '22023');
select public.send_announcement(t.u('1001'), 'Burst main', 'Water is off', 'all', null, null, 'urgent') as an1 \gset
select public.send_announcement(t.u('1001'), 'Plain notice', 'Hello', 'all') as an2 \gset
select t.as_owner();
select t.eq((select category from public.notices where id = :'an1'), 'urgent', 'the chosen category is stored');
select t.eq((select category from public.notices where id = :'an2'), 'general', 'the default category is general');
select t.as_user(t.u('c01'));
select t.eq((select count(*) from public.notices where category = 'urgent')::text, '1', 'the tenant can read it, with its category');

-- ===== what a tenant sees about their home =============================================================================================
select t.as_user(t.u('b01'));
select public.request_tenant_link(t.u('2002'), 'tenant2@example.test') as lr \gset
select t.as_user(t.u('c02'));
select t.eq((select unit_number || '/' || property_name || '/' || monthly_rent::text from public.tenant_link_request_overview), 'A02/Sunrise Apartments/1500.00',
  'a pending link request shows the unit, property and rent');
select t.as_user(t.u('c01'));
select t.eq((select count(*) from public.tenant_link_request_overview)::text, '0', 'other tenants do not see it');
select t.as_user(t.u('b01'));
select t.eq((select count(*) from public.tenant_link_request_overview)::text, '0', 'the landlord sees nothing through the tenant view');

select t.as_user(t.u('c01'));
select t.eq((select count(*) from public.tenant_property_contacts)::text, '3', 'an active tenant sees the owner, the manager and the caretaker');
select t.eq((select display_name from public.tenant_property_contacts where contact_role = 'owner'), 'Sunrise Holdings', 'the owner appears under their business name');
select t.eq((select string_agg(contact_role, ',' order by contact_role) from public.tenant_property_contacts), 'caretaker,owner,property_manager', 'with their roles');
select t.as_user(t.u('c02'));
select t.eq((select count(*) from public.tenant_property_contacts)::text, '0', 'someone without a tenancy there sees no contacts');
select t.as_user(t.u('b02'));
select t.eq((select count(*) from public.tenant_property_contacts)::text, '0', 'neither does an unrelated landlord');

select t.as_user(t.u('b01'));
select t.throws($q$update public.property_settings set mpesa_paybill = 'abc' where property_id = t.u('1001')$q$, 'a paybill must be 5 to 7 digits', '23514');
select t.eq(t.affected($q$update public.property_settings set mpesa_paybill = '123456', payment_instructions = 'Account: your unit number' where property_id = t.u('1001')$q$)::text, '1',
  'the owner sets payment instructions');
select t.as_user(t.u('d01'));
with s as (update public.property_settings set payment_instructions = 'hijack' where property_id = t.u('1001') returning 1)
select t.eq((select count(*) from s)::text, '0', 'a manager cannot change them');
select t.as_user(t.u('c01'));
select t.eq((select mpesa_paybill || '|' || payment_instructions from public.tenant_payment_info), '123456|Account: your unit number', 'the tenant sees how to pay');
select t.as_user(t.u('c02'));
select t.eq((select count(*) from public.tenant_payment_info)::text, '0', 'but only tenants of that property');

select t.as_owner();
select t.finish();
rollback;
