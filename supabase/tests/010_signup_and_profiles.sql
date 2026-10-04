-- Signup trigger, role extension rows, admin non-registrability, profile guards.
begin;
\ir support/helpers.sql
\ir support/fixtures.sql

-- Signup creates profile + matching extension row ------------------------------------------
select t.eq((select role::text from public.profiles where id = t.u('c01')), 'tenant', 'plain signup -> tenant');
select t.eq((select role::text from public.profiles where id = t.u('b01')), 'landlord', 'landlord signup -> landlord');
select t.ok(exists (select 1 from public.tenant_profiles where user_id = t.u('c01')), 'tenant gets a tenant_profile');
select t.ok(not exists (select 1 from public.landlord_profiles where user_id = t.u('c01')), 'tenant gets no landlord_profile');
select t.ok(exists (select 1 from public.landlord_profiles where user_id = t.u('b01')), 'landlord gets a landlord_profile');
select t.ok(not exists (select 1 from public.tenant_profiles where user_id = t.u('b01')), 'landlord gets no tenant_profile');
select t.eq((select full_name from public.profiles where id = t.u('c01')), 'Tenant One', 'full_name copied from metadata');

-- Admin can NOT be created through signup metadata ------------------------------------------
insert into auth.users (id, email, raw_user_meta_data)
values (t.u('d01'), 'sneaky@example.test', '{"role":"admin","full_name":"Sneaky"}'),
       (t.u('d02'), 'weird@example.test',  '{"role":"superuser"}'),
       (t.u('d03'), 'nometa@example.test',  '{}');
select t.eq((select role::text from public.profiles where id = t.u('d01')), 'tenant', 'signup with role=admin metadata -> tenant');
select t.ok(not exists (select 1 from public.admin_profiles where user_id = t.u('d01')), 'signup never creates admin_profile');
select t.eq((select role::text from public.profiles where id = t.u('d02')), 'tenant', 'unknown role metadata -> tenant');
select t.eq((select role::text from public.profiles where id = t.u('d03')), 'tenant', 'no metadata -> tenant');
select t.eq((select role::text from public.profiles where id = t.u('a01')), 'admin', 'admin provisioned out-of-band keeps admin role');

-- No tenant->property/unit pointer exists anywhere on identity tables ----------------------
select t.ok(not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name in ('profiles', 'tenant_profiles', 'landlord_profiles')
    and column_name in ('property_id', 'unit_id', 'current_property_id', 'current_unit_id')
), 'tenant/profile tables carry no property_id/unit_id');

-- Profile column guards ----------------------------------------------------------------------
select t.as_user(t.u('c01'));
select t.throws($q$update public.profiles set role = 'admin' where id = t.u('c01')$q$,
  'tenant cannot promote self to admin', '42501');
select t.throws($q$update public.profiles set role = 'landlord' where id = t.u('c01')$q$,
  'tenant cannot switch role to landlord', '42501');
select t.eq(t.affected($q$update public.profiles set full_name = 'Tenant 1 Renamed' where id = t.u('c01')$q$)::text, '1',
  'tenant can edit own name');
select t.eq(t.affected($q$update public.profiles set full_name = 'Hacked' where id = t.u('c02')$q$)::text, '0',
  'tenant cannot edit another profile (row invisible)');
select t.eq((select count(*) from public.profiles where id = t.u('c02'))::text, '0',
  'tenant cannot read another tenant''s profile');
select t.eq((select count(*) from public.tenant_profiles)::text, '1', 'tenant sees only own tenant_profile');
select t.eq(t.affected($q$update public.tenant_profiles set emergency_contact_name = 'Mum' where user_id = t.u('c01')$q$)::text, '1',
  'tenant edits own tenant_profile');
select t.throws($q$update public.tenant_profiles set user_id = t.u('c02') where user_id = t.u('c01')$q$,
  'tenant_profile user_id immutable', '42501');
select t.throws($q$insert into public.admin_profiles (user_id) values (t.u('c01'))$q$,
  'tenant cannot insert admin_profile', '42501');
select t.throws($q$insert into public.profiles (id, role) values (gen_random_uuid(), 'admin')$q$,
  'clients cannot insert profiles', '42501');

-- Landlord: own profile only; no access to tenant national ids ------------------------------
select t.as_user(t.u('b01'));
select t.eq((select count(*) from public.tenant_profiles)::text, '0', 'landlord cannot read tenant_profiles');
select t.throws($q$update public.landlord_profiles set verification_status = 'verified' where user_id = t.u('b01')$q$,
  'landlord cannot self-verify account', '42501');
select t.eq(t.affected($q$update public.landlord_profiles set business_name = 'Sunrise Ltd' where user_id = t.u('b01')$q$)::text, '1',
  'landlord edits own business name');
select t.eq((select count(*) from public.landlord_profiles)::text, '1', 'landlord sees only own landlord_profile');

-- Admin: sees and manages everyone ------------------------------------------------------------
select t.as_user(t.u('a01'));
select t.ok((select count(*) from public.profiles) >= 8, 'admin reads all profiles');
select t.lives($q$update public.landlord_profiles set verification_status = 'verified' where user_id = t.u('b01')$q$,
  'admin can verify a landlord account');
select t.lives($q$update public.profiles set status = 'suspended' where id = t.u('c02')$q$,
  'admin can change user status');

-- Suspended admin loses powers; suspended landlord loses ownership ---------------------------
select t.as_owner();
update public.profiles set status = 'suspended' where id = t.u('a01');
select t.as_user(t.u('a01'));
select t.ok(not public.is_admin(), 'suspended admin is no longer admin');
select t.as_owner();
update public.profiles set status = 'suspended' where id = t.u('b01');
select t.as_user(t.u('b01'));
select t.ok(not public.owns_property(t.u('1001')), 'suspended landlord owns nothing');

-- Anonymous visitors have no access to identity tables ------------------------------------------
select t.as_anon();
select t.throws($q$select * from public.profiles$q$, 'anon cannot read profiles', '42501');
select t.throws($q$select * from public.tenant_profiles$q$, 'anon cannot read tenant_profiles', '42501');

select t.as_owner();
select t.finish();
rollback;
