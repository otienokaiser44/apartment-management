-- Row Level Security as a real security boundary: every client-facing check below is performed
-- as the "authenticated"/"anon" Postgres role with a JWT sub claim, exactly like PostgREST.
begin;
\ir support/helpers.sql
\ir support/fixtures.sql

-- Setup (as owner) -------------------------------------------------------------------------------
-- T_A: tenant1 active in U1 (landlord1);  T_B: tenant2 active in U3 (landlord2)
insert into public.tenancies (id, tenant_id, unit_id, landlord_id, start_date, monthly_rent, status) values
  (t.u('3001'), t.tenant_pid(t.u('c01')), t.u('2001'), t.landlord_pid(t.u('b01')), current_date, 1000, 'active'),
  (t.u('3002'), t.tenant_pid(t.u('c02')), t.u('2003'), t.landlord_pid(t.u('b02')), current_date,  800, 'active');
update public.units set status = 'occupied' where id in (t.u('2001'), t.u('2003'));
-- A private (draft) property of landlord2.
insert into public.properties (id, landlord_id, name, address_line_1, city)
values (t.u('1004'), t.landlord_pid(t.u('b02')), 'L2 Private Draft', 'x', 'Nakuru');
insert into public.units (id, property_id, unit_number, monthly_rent) values (t.u('2005'), t.u('1004'), 'Z1', 100);

insert into public.rental_applications (id, tenant_id, unit_id, message) values
  (t.u('6001'), t.tenant_pid(t.u('c01')), t.u('2002'), 'c01 wants A02'),
  (t.u('6002'), t.tenant_pid(t.u('c02')), t.u('2002'), 'c02 wants A02');
insert into public.rent_charges (id, tenancy_id, billing_period_start, billing_period_end, due_date, amount)
values (t.u('4001'), t.u('3001'), date '2026-01-01', date '2026-01-31', date '2026-01-05', 1000),
       (t.u('4002'), t.u('3002'), date '2026-01-01', date '2026-01-31', date '2026-01-05', 800);
insert into public.payments (id, tenancy_id, rent_charge_id, tenant_id, amount, status) values
  (t.u('5001'), t.u('3001'), t.u('4001'), t.tenant_pid(t.u('c01')), 1000, 'pending'),
  (t.u('5002'), t.u('3002'), t.u('4002'), t.tenant_pid(t.u('c02')), 800, 'pending');
insert into public.maintenance_requests (id, tenant_id, unit_id, tenancy_id, title) values
  (t.u('7001'), t.tenant_pid(t.u('c01')), t.u('2001'), t.u('3001'), 'Tap leaks'),
  (t.u('7002'), t.tenant_pid(t.u('c02')), t.u('2003'), t.u('3002'), 'Door stuck');
insert into public.notifications (user_id, type, title) values (t.u('c01'), 'test', 'for tenant 1'),
                                                                (t.u('c02'), 'test', 'for tenant 2');
insert into public.favorites (user_id, unit_id) values (t.u('c01'), t.u('2002')), (t.u('c02'), t.u('2002'));
insert into public.property_reports (property_id, reported_by, reason) values (t.u('1001'), t.u('c01'), 'looks fake');

-- ===== TENANT 1 ==========================================================================================
select t.as_user(t.u('c01'));
select t.eq((select count(*) from public.tenancies)::text, '1', 'tenant sees only their own tenancy');
select t.eq((select count(*) from public.tenancies where id = t.u('3002'))::text, '0', 'tenant cannot see another tenant''s tenancy');
select t.throws($q$update public.tenancies set monthly_rent = 1 where id = t.u('3001')$q$,
  'tenant cannot modify own tenancy', '42501');
select t.throws($q$update public.tenancies set status = 'ended', end_date = current_date where id = t.u('3002')$q$,
  'tenant cannot modify another tenant''s tenancy', '42501');
select t.throws($q$update public.tenancies set unit_id = t.u('2002') where id = t.u('3001')$q$,
  'tenant cannot re-point own tenancy at another unit', '42501');
select t.throws($q$insert into public.tenancies (tenant_id, unit_id, landlord_id, start_date, monthly_rent, status)
   values (t.tenant_pid(t.u('c01')), t.u('2002'), t.landlord_pid(t.u('b01')), current_date, 1, 'active')$q$,
  'tenant cannot create a tenancy', '42501');
select t.throws($q$delete from public.tenancies where id = t.u('3001')$q$, 'tenant cannot delete a tenancy', '42501');

-- visibility of units / properties
select t.eq((select count(*) from public.units where id = t.u('2001'))::text, '1', 'tenant can read the unit of their tenancy even though occupied');
select t.eq((select count(*) from public.units where id = t.u('2004'))::text, '0', 'tenant cannot read a private draft unit');
select t.eq((select count(*) from public.properties where id = t.u('1003'))::text, '0', 'tenant cannot read a draft property');
select t.ok((select count(*) from public.profiles where id = t.u('b01')) = 1, 'tenant can read their landlord''s contact profile');
select t.eq((select count(*) from public.profiles where id = t.u('b02'))::text, '0', 'tenant cannot read an unrelated landlord profile');
select t.eq((select count(*) from public.landlord_profiles)::text, '0', 'tenant cannot read landlord_profiles (registration refs)');

-- applications
select t.eq((select count(*) from public.rental_applications)::text, '1', 'tenant sees only own applications');
select t.throws($q$update public.rental_applications set status = 'approved' where id = t.u('6001')$q$,
  'tenant cannot approve own application', '42501');
select t.throws($q$update public.rental_applications set unit_id = t.u('2001') where id = t.u('6001')$q$,
  'tenant cannot retarget an application', '42501');
select t.eq(t.affected($q$update public.rental_applications set status = 'withdrawn' where id = t.u('6002')$q$)::text, '0',
  'tenant cannot touch another tenant''s application');
select t.lives($q$update public.rental_applications set status = 'withdrawn' where id = t.u('6001')$q$,
  'tenant can withdraw own pending application');
select t.lives($q$insert into public.rental_applications (tenant_id, unit_id) values (t.tenant_pid(t.u('c01')), t.u('2002'))$q$,
  'tenant can apply for a vacant public unit');
select t.throws($q$insert into public.rental_applications (tenant_id, unit_id) values (t.tenant_pid(t.u('c02')), t.u('2002'))$q$,
  'tenant cannot apply on behalf of someone else', '42501');
select t.throws($q$insert into public.rental_applications (tenant_id, unit_id) values (t.tenant_pid(t.u('c01')), t.u('2004'))$q$,
  'tenant cannot apply to a non-public unit', '42501');
select t.throws($q$insert into public.rental_applications (tenant_id, unit_id) values (t.tenant_pid(t.u('c01')), t.u('2003'))$q$,
  'tenant cannot apply to an occupied unit', '42501');
select t.throws($q$insert into public.rental_applications (tenant_id, unit_id, status)
   values (t.tenant_pid(t.u('c01')), t.u('2002'), 'approved')$q$,
  'tenant cannot create an already-approved application', '42501');

-- payments
select t.eq((select count(*) from public.payments)::text, '1', 'tenant sees only own payments');
select t.eq((select count(*) from public.rent_charges)::text, '1', 'tenant sees only own charges');
select t.throws($q$update public.payments set status = 'successful', paid_at = now() where id = t.u('5001')$q$,
  'tenant cannot mark a payment successful', '42501');
select t.throws($q$insert into public.payments (tenancy_id, tenant_id, amount, status, paid_at)
   values (t.u('3001'), t.tenant_pid(t.u('c01')), 1000, 'successful', now())$q$,
  'tenant cannot insert an already-successful payment', '42501');
select t.lives($q$insert into public.payments (tenancy_id, rent_charge_id, tenant_id, amount, status)
   values (t.u('3001'), t.u('4001'), t.tenant_pid(t.u('c01')), 100, 'pending')$q$,
  'tenant can initiate a pending payment');
select t.throws($q$insert into public.payments (tenancy_id, tenant_id, amount) values (t.u('3002'), t.tenant_pid(t.u('c01')), 5)$q$,
  'tenant cannot pay into someone else''s tenancy');
select t.eq(t.affected($q$update public.rent_charges set status = 'paid' where id = t.u('4001')$q$)::text, '0',
  'tenant cannot write charges (no policy: 0 rows)');

-- maintenance
select t.eq((select count(*) from public.maintenance_requests)::text, '1', 'tenant sees only own maintenance requests');
select t.lives($q$insert into public.maintenance_requests (tenant_id, unit_id, tenancy_id, title)
   values (t.tenant_pid(t.u('c01')), t.u('2001'), t.u('3001'), 'Light out')$q$, 'tenant can raise a request for own tenancy');
select t.throws($q$insert into public.maintenance_requests (tenant_id, unit_id, tenancy_id, title)
   values (t.tenant_pid(t.u('c01')), t.u('2003'), t.u('3002'), 'Sneaky')$q$,
  'tenant cannot raise a request on another tenancy');
select t.throws($q$update public.maintenance_requests set status = 'resolved' where id = t.u('7001')$q$,
  'tenant cannot resolve own maintenance request', '42501');
select t.lives($q$update public.maintenance_requests set status = 'cancelled' where id = t.u('7001')$q$,
  'tenant can cancel own open request');

-- notifications / favorites / reports / audit
select t.eq((select count(*) from public.notifications)::text, '1', 'user sees only own notifications');
select t.throws($q$insert into public.notifications (user_id, type, title) values (t.u('c01'), 'x', 'forged')$q$,
  'clients cannot forge notifications', '42501');
select t.throws($q$update public.notifications set title = 'changed' where user_id = t.u('c01')$q$,
  'only read_at can change on a notification', '42501');
select t.eq(t.affected($q$update public.notifications set read_at = now() where user_id = t.u('c01')$q$)::text, '1', 'user can mark own notification read');
select t.eq(t.affected($q$update public.notifications set read_at = now() where user_id = t.u('c02')$q$)::text, '0', 'user cannot mark others'' notifications');
select t.eq((select count(*) from public.favorites)::text, '1', 'user sees only own favorites');
select t.eq((select count(*) from public.property_reports)::text, '1', 'reporter sees own report');
select t.eq((select count(*) from public.audit_logs)::text, '0', 'non-admin reads no audit logs');
select t.throws($q$insert into public.audit_logs (action, entity_type) values ('forged', 'x')$q$, 'clients cannot write audit logs', '42501');
select t.throws($q$delete from public.audit_logs$q$, 'clients cannot delete audit logs', '42501');
select t.throws($q$select public.write_audit_log('forged', 'x', null)$q$, 'clients cannot call write_audit_log', '42501');
select t.throws($q$select public.notify_user(public.current_user_id(), 'x', 'forged')$q$, 'clients cannot call notify_user', '42501');

-- ===== TENANT 2 (the other tenant) =========================================================================
select t.as_user(t.u('c02'));
select t.eq((select count(*) from public.payments where tenant_id = t.tenant_pid(t.u('c01')))::text, '0', 'tenant2 cannot see tenant1 payments');
select t.eq((select count(*) from public.maintenance_requests where id = t.u('7001'))::text, '0', 'tenant2 cannot see tenant1 maintenance');
select t.eq((select count(*) from public.notifications where user_id = t.u('c01'))::text, '0', 'tenant2 cannot see tenant1 notifications');
select t.eq((select count(*) from public.profiles where id = t.u('c01'))::text, '0', 'tenant2 cannot see tenant1 profile');

-- ===== LANDLORD 1 ==============================================================================================
select t.as_user(t.u('b01'));
select t.eq((select count(*) from public.properties where id in (t.u('1001'), t.u('1003')))::text, '2', 'landlord sees own properties');
select t.eq((select count(*) from public.properties where id = t.u('1004'))::text, '0', 'landlord cannot see another landlord''s private property');
select t.eq((select count(*) from public.units where id = t.u('2005'))::text, '0', 'landlord cannot see another landlord''s private unit');
select t.eq(t.affected($q$update public.properties set name = 'Mine now' where id = t.u('1002')$q$)::text, '0', 'landlord cannot edit another landlord''s (even public) property');
select t.eq(t.affected($q$update public.properties set name = 'Mine now' where id = t.u('1004')$q$)::text, '0', 'landlord cannot edit another landlord''s private property');
select t.eq(t.affected($q$delete from public.properties where id = t.u('1004')$q$)::text, '0', 'landlord cannot delete another landlord''s property');
select t.throws($q$insert into public.properties (landlord_id, name, address_line_1, city)
   values (t.landlord_pid(t.u('b02')), 'Forged', 'x', 'y')$q$, 'landlord cannot create a property for someone else', '42501');
select t.throws($q$insert into public.units (property_id, unit_number, monthly_rent) values (t.u('1004'), 'EVIL', 1)$q$,
  'landlord cannot add units to another landlord''s property', '42501');
select t.eq(t.affected($q$update public.units set monthly_rent = 1 where id = t.u('2003')$q$)::text, '0', 'landlord cannot reprice another landlord''s unit');
select t.lives($q$insert into public.units (property_id, unit_number, monthly_rent) values (t.u('1001'), 'A09', 900)$q$, 'landlord can add units to own property');
select t.lives($q$update public.properties set name = 'Sunrise Apartments II', description = 'nice' where id = t.u('1001')$q$, 'landlord edits own property');

-- verification can never be set by a landlord
select t.throws($q$update public.properties set verification_status = 'verified' where id = t.u('1003')$q$,
  'landlord cannot verify a property', '42501');
select t.throws($q$update public.properties set verification_status = 'unverified' where id = t.u('1001')$q$,
  'landlord cannot downgrade/alter verification either', '42501');
select t.throws($q$insert into public.properties (landlord_id, name, address_line_1, city, verification_status)
   values (t.landlord_pid(t.u('b01')), 'Pre-verified', 'x', 'y', 'verified')$q$, 'landlord cannot insert a pre-verified property', '42501');
select t.throws($q$update public.properties set status = 'suspended' where id = t.u('1003')$q$, 'landlord cannot suspend/unsuspend properties', '42501');
select t.throws($q$update public.properties set landlord_id = t.landlord_pid(t.u('b02')) where id = t.u('1003')$q$,
  'landlord cannot give a property away', '42501');
select t.lives($q$update public.properties set status = 'published' where id = t.u('1003')$q$, 'landlord can publish own draft...');
select t.as_anon();
select t.eq((select count(*) from public.properties where id = t.u('1003'))::text, '0', '...but an unverified property stays invisible to the public');
select t.as_user(t.u('b01'));

-- occupancy states are controlled by tenancy operations
select t.throws($q$update public.units set status = 'reserved' where id = t.u('2002')$q$, 'landlord cannot hand-set a unit reserved', '42501');
select t.throws($q$update public.units set status = 'occupied' where id = t.u('2002')$q$, 'landlord cannot hand-set a unit occupied', '42501');
select t.throws($q$update public.units set status = 'vacant' where id = t.u('2001')$q$, 'landlord cannot hand-release an occupied unit', '42501');
select t.throws($q$update public.units set property_id = t.u('1003') where id = t.u('2002')$q$, 'a unit cannot be moved between properties', '42501');
select t.lives($q$update public.units set status = 'maintenance' where id = t.u('2002')$q$, 'landlord can put a vacant unit into maintenance');
select t.lives($q$update public.units set status = 'vacant' where id = t.u('2002')$q$, 'and back to vacant');

-- tenancy / application / payment boundaries as landlord
select t.eq((select count(*) from public.tenancies)::text, '1', 'landlord sees only tenancies on own properties');
select t.eq((select count(*) from public.tenancies where id = t.u('3002'))::text, '0', 'landlord cannot see another landlord''s tenancy');
select t.throws($q$update public.tenancies set status = 'ended', end_date = current_date where id = t.u('3001')$q$,
  'landlord ends tenancies only through end_tenancy()', '42501');
select t.eq((select count(*) from public.rental_applications)::text, '3', 'landlord sees applications for own units only (3: 2 seeded + 1 new)');
select t.eq(t.affected($q$update public.rental_applications set status = 'approved' where id = t.u('6002')$q$)::text, '0',
  'landlord cannot approve applications by direct UPDATE');
select t.eq((select count(*) from public.payments)::text, '2', 'landlord sees payments of own tenancies only');
select t.throws($q$insert into public.payments (tenancy_id, tenant_id, amount, status, paid_at)
   values (t.u('3001'), t.tenant_pid(t.u('c01')), 1, 'successful', now())$q$,
  'landlord cannot forge a successful payment row (must use record_manual_payment)', '42501');
select t.throws($q$update public.rent_charges set status = 'paid' where id = t.u('4001')$q$,
  'landlord cannot mark a charge paid directly', '42501');
select t.lives($q$insert into public.rent_charges (tenancy_id, billing_period_start, billing_period_end, due_date, amount)
   values (t.u('3001'), date '2026-02-01', date '2026-02-28', date '2026-02-05', 1000)$q$, 'landlord can bill own tenancy');
select t.throws($q$insert into public.rent_charges (tenancy_id, billing_period_start, billing_period_end, due_date, amount)
   values (t.u('3002'), date '2026-02-01', date '2026-02-28', date '2026-02-05', 800)$q$,
  'landlord cannot bill another landlord''s tenancy', '42501');
select t.eq((select count(*) from public.maintenance_requests)::text, '2', 'landlord sees maintenance on own units only (2 incl. cancelled)');
select t.lives($q$update public.maintenance_requests set status = 'in_progress', assigned_to = t.u('b01') where id = t.u('7001')$q$,
  'landlord progresses maintenance workflow');
select t.eq((select count(*) from public.tenant_profiles)::text, '0', 'landlord never reads tenant_profiles');
select t.eq((select count(*) from public.profiles where id = t.u('c01'))::text, '1', 'landlord sees contact profile of own tenant');
select t.eq((select count(*) from public.profiles where id = t.u('c03'))::text, '0', 'landlord cannot see unrelated tenant profile');

-- ===== LANDLORD 2 ===============================================================================================
select t.as_user(t.u('b02'));
select t.eq((select count(*) from public.tenancies where id = t.u('3001'))::text, '0', 'landlord2 cannot see landlord1 tenancy');
select t.eq((select count(*) from public.payments where tenancy_id = t.u('3001'))::text, '0', 'landlord2 cannot see landlord1 payments');
select t.eq((select count(*) from public.maintenance_requests where id = t.u('7001'))::text, '0', 'landlord2 cannot see landlord1 maintenance');
select t.eq((select count(*) from public.rental_applications where unit_id = t.u('2002'))::text, '0', 'landlord2 cannot see applications for landlord1 units');
select t.throws($q$select public.approve_rental_application(t.u('6002'))$q$, 'landlord2 cannot approve landlord1 applications', '42501');

-- ===== ANONYMOUS VISITOR ===========================================================================================
select t.as_anon();
select t.eq((select string_agg(id::text, ',' order by id) from public.properties), t.u('1001')::text || ',' || t.u('1002')::text,
  'visitor sees exactly the published+verified properties');
select t.eq((select count(*) from public.units where status in ('occupied', 'maintenance', 'unavailable'))::text, '0',
  'visitor cannot see occupied/maintenance units');
select t.eq((select count(*) from public.units where property_id in (t.u('1003'), t.u('1004')))::text, '0',
  'visitor cannot see units of non-public properties');
select t.eq((select count(*) from public.public_property_listings where unit_id = t.u('2002'))::text, '1', 'listings view shows the vacant public unit');
select t.eq((select count(*) from public.public_property_listings where unit_id in (t.u('2001'), t.u('2003'), t.u('2004'), t.u('2005')))::text, '0',
  'listings view hides occupied and non-public units');
select t.ok(not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'public_property_listings'
    and column_name ~ '(email|phone|national|registration|token|tenant|notes|status_internal|landlord_id)'
), 'listings view exposes no private columns');
select t.throws($q$select * from public.tenancies$q$, 'visitor cannot read tenancies', '42501');
select t.throws($q$select * from public.payments$q$, 'visitor cannot read payments', '42501');
select t.throws($q$select * from public.landlord_profiles$q$, 'visitor cannot read landlord_profiles', '42501');
select t.throws($q$select * from public.tenant_invitations$q$, 'visitor cannot read invitations', '42501');
select t.throws($q$select * from public.audit_logs$q$, 'visitor cannot read audit logs', '42501');
select t.throws($q$select * from public.property_verification_documents$q$, 'visitor cannot read verification documents', '42501');
select t.throws($q$insert into public.units (property_id, unit_number, monthly_rent) values (t.u('1001'), 'ANON', 1)$q$, 'visitor cannot write units', '42501');
select t.lives($q$insert into public.property_inquiries (property_id, sender_name, sender_email, message)
   values (t.u('1001'), 'Visitor', 'v@example.test', 'Is A02 still available?')$q$, 'visitor can inquire about a public property');
select t.throws($q$insert into public.property_inquiries (property_id, sender_name, sender_email, message)
   values (t.u('1004'), 'Visitor', 'v@example.test', 'hi')$q$, 'visitor cannot inquire about a non-public property', '42501');
select t.throws($q$insert into public.property_inquiries (property_id, sender_user_id, sender_name, sender_email, message)
   values (t.u('1001'), t.u('c01'), 'Fake', 'v@example.test', 'spoof')$q$, 'visitor cannot spoof a user id on an inquiry', '42501');
select t.throws($q$select * from public.property_inquiries$q$, 'visitor cannot read inquiries', '42501');
select t.ok((select count(*) from public.amenities) >= 0, 'visitor can read the amenity catalogue');
select t.throws($q$select public.approve_rental_application(t.u('6001'))$q$, 'visitor cannot call lifecycle RPCs', '42501');

-- inquiries: owner sees, others do not
select t.as_user(t.u('b01'));
select t.eq((select count(*) from public.property_inquiries)::text, '1', 'owner landlord receives the inquiry');
select t.as_user(t.u('b02'));
select t.eq((select count(*) from public.property_inquiries)::text, '0', 'other landlord does not see it');

-- ===== ADMIN ================================================================================================================
select t.as_user(t.u('a01'));
select t.eq((select count(*) from public.tenancies)::text, '2', 'admin sees all tenancies');
select t.ok((select count(*) from public.properties) >= 4, 'admin sees all properties');
select t.lives($q$update public.properties set name = 'Admin edited' where id = t.u('1004')$q$, 'admin can edit properties');

select t.as_owner();
select t.finish();
rollback;
