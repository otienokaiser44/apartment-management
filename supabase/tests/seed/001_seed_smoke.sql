-- Smoke test for supabase/seed.sql (run by `node scripts/db-test.mjs --seed`, which loads the seed first).
begin;
\ir ../support/helpers.sql

select t.eq((select count(*) from public.profiles)::text, '6', 'seed creates 6 users');
select t.eq((select count(*) from public.profiles where role = 'admin')::text, '1', 'exactly one admin');
select t.eq((select count(*) from public.profiles where role = 'landlord')::text, '2', 'two landlords');
select t.eq((select count(*) from public.profiles where role = 'tenant')::text, '3', 'three tenants');
select t.eq((select count(*) from public.admin_profiles)::text, '1', 'admin_profile present');
select t.eq((select count(*) from public.properties)::text, '3', 'three properties');
select t.ok((select count(distinct landlord_id) from public.properties) = 2, 'properties span two landlords');
select t.eq((select count(*) from public.units)::text, '6', 'six units');
select t.eq((select count(*) from public.tenancies where status = 'active')::text, '1', 'one active tenancy');
select t.eq((select count(*) from public.tenant_profiles tp
              where not exists (select 1 from public.tenancies te where te.tenant_id = tp.id and te.status = 'active'))::text,
            '2', 'two tenants have NO active tenancy (accounts exist without a unit)');
select t.eq((select count(*) from public.rental_applications where status = 'pending')::text, '1', 'one pending application');
select t.eq((select count(*) from public.property_verification_requests where status = 'submitted')::text, '1', 'one verification request awaiting review');
select t.eq((select status::text from public.rent_charges where id = '50000000-0000-0000-0000-000000000001'), 'paid', 'seeded paid charge consistent with payment');
select t.eq((select count(*) from public.public_property_listings)::text, '2', 'public site lists the 2 vacant units of the verified property only');
select t.ok((select count(*) from public.amenities) >= 10, 'reference amenities present');
select t.ok((select count(*) from public.verification_document_types where is_required) >= 1, 'a required verification document type exists');
select t.ok(not exists (select 1 from public.units u join public.properties p on p.id = u.property_id
                         where u.status = 'occupied' and not exists (select 1 from public.tenancies te where te.unit_id = u.id and te.status = 'active')),
            'every occupied unit has an active tenancy');

select t.finish();
rollback;
