-- Property managers and caretakers: invitation, acceptance, per-property access and what stays owner-only.
--
-- Layout used here (landlord 1 owns all of P1, P3, P4):
--   P1 published+verified (public), A01 occupied by tenant1, A02 vacant
--   P3 draft (NOT public), unit H01 (2004)      <- manager and caretaker are assigned here (manager also P1)
--   P4 draft (NOT public), unit X01 (2005)      <- nobody is assigned: the negative control
begin;
\ir support/helpers.sql
\ir support/fixtures.sql

insert into auth.users (id, email, phone, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000d01', 'mgr1@example.test', null, '{"full_name":"Manager One","role":"manager"}'),
  ('00000000-0000-0000-0000-000000000d02', 'mgr2@example.test', null, '{"full_name":"Manager Two","role":"manager"}'),
  ('00000000-0000-0000-0000-000000000d03', 'care1@example.test', null, '{"full_name":"Caretaker One","role":"manager"}');

insert into public.properties (id, landlord_id, name, property_type, address_line_1, city, status)
values (t.u('1004'), t.landlord_pid(t.u('b01')), 'Hidden Court', 'apartment', '4 Test Road', 'Nairobi', 'draft');
insert into public.units (id, property_id, unit_number, bedrooms, bathrooms, monthly_rent, security_deposit)
values (t.u('2005'), t.u('1004'), 'X01', 1, 1, 500, 500);

insert into public.tenancies (id, tenant_id, unit_id, landlord_id, start_date, monthly_rent, security_deposit, status)
values (t.u('3001'), t.tenant_pid(t.u('c01')), t.u('2001'), t.landlord_pid(t.u('b01')), current_date - 30, 1000, 1000, 'active');
update public.units set status = 'occupied' where id = t.u('2001');

-- ===== accounts ==============================================================================================
select t.as_owner();
select t.eq((select role::text from public.profiles where id = t.u('d01')), 'manager', 'signup with role=manager creates a manager profile');
select t.eq((select count(*) from public.tenant_profiles where user_id = t.u('d01'))::text, '0', 'no tenant extension row for managers');
select t.eq((select count(*) from public.landlord_profiles where user_id = t.u('d01'))::text, '0', 'no landlord extension row for managers');
select t.eq((select role::text from public.profiles where id = t.u('a01')), 'admin', 'admin provisioning is unchanged');

select t.as_user(t.u('d01'));
select t.eq((select count(*) from public.properties where id = t.u('1003'))::text, '0', 'unassigned manager cannot see a draft property');
select t.eq((select count(*) from public.property_staff)::text, '0', 'and has no staff rows');

-- ===== inviting ==============================================================================================
select t.as_user(t.u('c01'));
select t.throws($q$select public.invite_staff('mgr1@example.test', 'property_manager', array[t.u('1001')])$q$, 'tenant cannot invite staff', '42501');
select t.as_user(t.u('d01'));
select t.throws($q$select public.invite_staff('mgr2@example.test', 'property_manager', array[t.u('1001')])$q$, 'manager cannot invite staff', '42501');
select t.as_user(t.u('b02'));
select t.throws($q$select public.invite_staff('mgr1@example.test', 'property_manager', array[t.u('1001')])$q$, 'landlord cannot invite staff to another owner''s property', 'P0002');
select t.as_user(t.u('b01'));
select t.throws($q$select public.invite_staff('not-an-email', 'property_manager', array[t.u('1001')])$q$, 'bad email rejected', '22023');
select t.throws($q$select public.invite_staff('mgr1@example.test', 'owner', array[t.u('1001')])$q$, 'unknown role rejected', '22023');
select t.throws($q$select public.invite_staff('mgr1@example.test', 'property_manager', array[]::uuid[])$q$, 'at least one property', '22023');
select t.throws($q$select public.invite_staff('mgr1@example.test', 'property_manager', array[t.u('1001')], interval '90 days')$q$, 'lifetime capped', '22023');
select t.throws($q$select public.invite_staff('landlord1@example.test', 'property_manager', array[t.u('1001')])$q$, 'cannot invite yourself', '22023');
select t.throws($q$select public.invite_staff('mgr1@example.test', 'property_manager', array[t.u('1001'), t.u('1002')])$q$, 'mixed ownership rejected', 'P0002');
select t.throws($q$insert into public.staff_invitations (landlord_id, invitee_email, role, property_ids, token_hash, expires_at)
   values (t.landlord_pid(t.u('b01')), 'x@example.test', 'property_manager', array[t.u('1001')], 'h', now() + interval '1 day')$q$, 'clients cannot insert invitations directly', '42501');

select public.invite_staff(' Mgr1@Example.test ', 'property_manager', array[t.u('1001'), t.u('1003')]) as tok_m1 \gset
select public.invite_staff('care1@example.test', 'caretaker', array[t.u('1003')]) as tok_c1 \gset
select t.ok(length(:'tok_m1') >= 40, 'token is long and random');
select t.as_owner();
select t.eq((select count(*) from public.staff_invitations where token_hash = :'tok_m1')::text, '0', 'raw token is not stored');
select t.eq((select count(*) from public.staff_invitations where token_hash = encode(sha256(convert_to(:'tok_m1', 'UTF8')), 'hex'))::text, '1', 'only the hash is stored');
select t.eq((select invitee_email from public.staff_invitations where role = 'property_manager'), 'mgr1@example.test', 'email normalised');
select t.as_user(t.u('b02'));
select t.eq((select count(*) from public.staff_invitations)::text, '0', 'other landlords cannot see invitations');
select t.as_user(t.u('b01'));
select t.eq((select count(*) from public.staff_invitations)::text, '2', 'owner sees their invitations');

-- ===== accepting =============================================================================================
select t.as_user(t.u('d02'));
select t.throws(format('select public.accept_staff_invitation(%L)', :'tok_m1'), 'a different manager account cannot redeem it', '42501', 'different account');
select t.as_user(t.u('c01'));
select t.throws(format('select public.accept_staff_invitation(%L)', :'tok_m1'), 'tenants cannot accept', '42501');
select t.as_user(t.u('b01'));
select t.throws(format('select public.accept_staff_invitation(%L)', :'tok_m1'), 'landlords cannot accept', '42501');
select t.as_user(t.u('d01'));
select t.throws($q$select public.accept_staff_invitation('nope-nope-nope-nope-nope-nope')$q$, 'garbage token', 'P0002');
select t.throws($q$select public.accept_staff_invitation(null)$q$, 'null token', 'P0002');
select t.lives(format('select public.accept_staff_invitation(%L)', :'tok_m1'), 'the invited manager accepts');
select t.throws(format('select public.accept_staff_invitation(%L)', :'tok_m1'), 'a token is single-use', 'P0002', 'invalid or expired');
select t.as_user(t.u('d03'));
select t.lives(format('select public.accept_staff_invitation(%L)', :'tok_c1'), 'the invited caretaker accepts');
select t.as_owner();
select t.eq((select count(*) from public.property_staff where user_id = t.u('d01') and status = 'active')::text, '2', 'manager assigned to both invited properties');
select t.eq((select role from public.property_staff where user_id = t.u('d03') and status = 'active'), 'caretaker', 'caretaker assignment created');
select t.eq((select count(*) from public.notifications where user_id = t.u('b01') and type = 'staff_joined')::text, '2', 'owner notified of both acceptances');
select t.as_user(t.u('d01'));
select t.throws($q$insert into public.property_staff (property_id, user_id, role) values (t.u('1004'), t.u('d01'), 'property_manager')$q$, 'managers cannot grant themselves access', '42501');

-- expired / revoked invitations
select t.as_user(t.u('b01'));
select public.invite_staff('mgr2@example.test', 'property_manager', array[t.u('1001')]) as tok_x \gset
select public.invite_staff('mgr2@example.test', 'property_manager', array[t.u('1001')]) as tok_y \gset
select t.as_owner();
update public.staff_invitations set expires_at = now() - interval '1 minute' where token_hash = encode(sha256(convert_to(:'tok_x', 'UTF8')), 'hex');
select t.as_user(t.u('d02'));
select t.throws(format('select public.accept_staff_invitation(%L)', :'tok_x'), 'expired invitation rejected', 'P0002', 'invalid or expired');
select t.as_user(t.u('b02'));
select t.throws(format($f$select public.revoke_staff_invitation(%L)$f$, (select id from public.staff_invitations limit 1)), 'other landlord cannot revoke', 'P0002');
select t.as_user(t.u('b01'));
select t.lives(format($f$select public.revoke_staff_invitation((select id from public.staff_invitations where token_hash = encode(sha256(convert_to(%L, 'UTF8')), 'hex')))$f$, :'tok_y'), 'owner revokes an invitation');
select t.as_user(t.u('d02'));
select t.throws(format('select public.accept_staff_invitation(%L)', :'tok_y'), 'revoked invitation rejected', 'P0002', 'invalid or expired');

-- ===== PROPERTY MANAGER (assigned: P1 + P3) ===================================================================
select t.as_user(t.u('d01'));
select t.eq((select count(*) from public.properties where id = t.u('1003'))::text, '1', 'manager sees the assigned draft property (not public)');
select t.eq((select count(*) from public.properties where id = t.u('1004'))::text, '0', 'but not the owner''s unassigned draft property');
select t.eq((select count(*) from public.units where id = t.u('2004'))::text, '1', 'manager sees units of an assigned property');
select t.eq((select count(*) from public.units where id = t.u('2005'))::text, '0', 'but not units of an unassigned one');

with u as (update public.units set monthly_rent = 1111 where id = t.u('2004') returning 1)
select t.eq((select count(*) from u)::text, '1', 'manager can edit units of an assigned property');
with u as (update public.units set monthly_rent = 1 where id = t.u('2005') returning 1)
select t.eq((select count(*) from u)::text, '0', 'manager cannot edit units of an unassigned property');
with p as (update public.properties set name = 'Hijack' where id = t.u('1003') returning 1)
select t.eq((select count(*) from p)::text, '0', 'manager cannot edit the property profile (owner-only)');

select t.eq((select count(*) from public.property_settings where property_id = t.u('1001'))::text, '1', 'manager can read billing settings');
with s as (update public.property_settings set default_garbage_fee = 999 where property_id = t.u('1001') returning 1)
select t.eq((select count(*) from s)::text, '0', 'but cannot change them (owner-only)');

select t.eq((select count(*) from public.landlord_tenancy_overview)::text, '1', 'manager sees the property''s tenants through the overview');
select t.eq((select tenant_name from public.landlord_tenancy_overview), 'Tenant One', 'with names');
select t.eq((select count(*) from public.tenancies where id = t.u('3001'))::text, '1', 'and the tenancy row');

-- invitations issued by a manager carry the OWNER's landlord id
select t.lives($q$select public.create_tenant_invitation(t.u('2002'), 'newtenant@example.test')$q$, 'manager can invite a tenant to an assigned unit');
select t.throws($q$select public.create_tenant_invitation(t.u('2005'), 'x@example.test')$q$, 'but not to an unassigned unit', 'P0002', 'unit not found');
select t.as_owner();
select t.eq((select landlord_id::text from public.tenant_invitations where invitee_email = 'newtenant@example.test'), t.landlord_pid(t.u('b01'))::text, 'invitation landlord_id is the owner');
select t.as_user(t.u('d01'));
select t.eq((select count(*) from public.tenant_invitations)::text, '1', 'manager can see invitations for the property');

select t.lives($q$select public.send_announcement(t.u('1001'), 'Water cut', 'Tomorrow', 'all')$q$, 'manager can send announcements');
select t.throws($q$select public.send_announcement(t.u('1004'), 'x', 'y', 'all')$q$, 'but not for an unassigned property', 'P0002');
select t.lives($q$select count(*) from public.create_tenant_invitations_bulk(t.u('1003'), '[{"unit_number":"H01","tenant_email":"bulk@example.test"}]')$q$, 'manager can bulk invite');
select t.throws($q$select * from public.create_tenant_invitations_bulk(t.u('1004'), '[{"unit_number":"X01","tenant_email":"b@example.test"}]')$q$, 'not for an unassigned property', 'P0002');

-- owner-only operations
select t.throws($q$select public.invite_staff('mgr2@example.test', 'property_manager', array[t.u('1001')])$q$, 'manager cannot invite staff', '42501');
select t.throws($q$select public.start_property_verification(t.u('1003'))$q$, 'manager cannot start property verification');
select t.eq((select count(*) from public.property_staff_overview)::text, '0', 'manager cannot read the staff roster');

-- ===== CARETAKER (assigned: P3 only, read-only) ===========================================================================
select t.as_user(t.u('d03'));
select t.eq((select count(*) from public.properties where id = t.u('1003'))::text, '1', 'caretaker sees the assigned draft property');
select t.eq((select count(*) from public.properties where id = t.u('1004'))::text, '0', 'but not an unassigned draft property');
select t.eq((select count(*) from public.units where id = t.u('2004'))::text, '1', 'caretaker sees units of the assigned property');
with u as (update public.units set monthly_rent = 2 where id = t.u('2004') returning 1)
select t.eq((select count(*) from u)::text, '0', 'caretaker cannot edit units');
select t.throws($q$select public.create_tenant_invitation(t.u('2004'), 'z@example.test')$q$, 'caretaker cannot invite tenants', 'P0002');
select t.throws($q$select public.send_announcement(t.u('1003'), 'x', 'y', 'all')$q$, 'caretaker cannot send announcements', 'P0002');
select t.eq((select count(*) from public.landlord_tenancy_overview)::text, '0', 'caretaker does not see tenants');

-- an unrelated manager and another owner stay out
select t.as_user(t.u('d02'));
select t.eq((select count(*) from public.properties where id = t.u('1003'))::text, '0', 'an unrelated manager sees no draft property');
select t.throws($q$select public.create_tenant_invitation(t.u('2004'), 'z@example.test')$q$, 'an unrelated manager cannot invite', 'P0002');
select t.as_user(t.u('b02'));
select t.eq((select count(*) from public.property_staff)::text, '0', 'another owner cannot see this staff');
select t.eq((select count(*) from public.property_staff_overview)::text, '0', 'nor the roster');

-- ===== owner view ============================================================================================================
select t.as_user(t.u('b01'));
select t.eq((select count(*) from public.property_staff_overview)::text, '3', 'owner sees all staff assignments (manager x2, caretaker x1)');
select t.eq((select full_name from public.property_staff_overview where role = 'caretaker'), 'Caretaker One', 'with names');
select t.eq((select count(*) from public.landlord_tenancy_overview)::text, '1', 'owner still sees tenants through the same view');

-- ===== verification documents stay with the owner ==============================================================================
select t.as_owner();
select t.ok(not exists (
  select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'verification docs%' and (coalesce(qual, '') like '%owns_property%' or coalesce(with_check, '') like '%owns_property%')),
  'verification document policies use the owner-only check');

-- ===== removing staff ==============================================================================================================
select id as staff_row from public.property_staff where user_id = t.u('d01') and property_id = t.u('1001') and status = 'active' \gset
select t.as_user(t.u('b02'));
select t.throws(format('select public.remove_staff(%L)', :'staff_row'), 'other owner cannot remove staff', 'P0002');
select t.as_user(t.u('d01'));
select t.throws(format('select public.remove_staff(%L)', :'staff_row'), 'staff cannot remove staff', 'P0002');
select t.as_user(t.u('b01'));
select t.lives(format('select public.remove_staff(%L)', :'staff_row'), 'owner removes the manager from P1');
select t.throws(format('select public.remove_staff(%L)', :'staff_row'), 'cannot remove twice', '22023');
select t.as_user(t.u('d01'));
select t.throws($q$select public.create_tenant_invitation(t.u('2002'), 'after@example.test')$q$, 'removed manager can no longer invite for P1', 'P0002');
select t.eq((select count(*) from public.landlord_tenancy_overview)::text, '0', 'removed manager no longer sees P1 tenants');
select t.eq((select count(*) from public.units where id = t.u('2004'))::text, '1', 'but keeps access to P3 where still assigned');
select t.as_owner();
select t.eq((select count(*) from public.notifications where user_id = t.u('d01') and type = 'staff_removed')::text, '1', 'removed manager is notified');

-- a suspended account loses access even with an active assignment
update public.profiles set status = 'suspended' where id = t.u('d03');
select t.as_user(t.u('d03'));
select t.eq((select count(*) from public.properties where id = t.u('1003'))::text, '0', 'suspended caretaker loses access');

select t.as_owner();
select t.finish();
rollback;
