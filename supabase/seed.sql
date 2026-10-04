-- =====================================================================================
-- DEVELOPMENT SEED DATA ONLY.  Do not run against production.
-- Applied automatically by `supabase db reset` (see [db.seed] in config.toml).
-- All identities are fictional (.test / example.test addresses, no real documents).
-- All seeded accounts share the throw-away LOCAL password:  DevPassword123!
-- Reference data (amenities, document types) lives in migration 029, not here.
-- =====================================================================================

-- ---- auth users (the signup trigger creates profiles + role extension rows) ----------------
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
)
select v.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v.email,
       extensions.crypt('DevPassword123!', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, v.meta::jsonb, now(), now(), '', '', '', ''
from (values
  ('10000000-0000-0000-0000-000000000001'::uuid, 'admin@apartment.test',            '{"full_name":"Platform Admin"}'),
  ('10000000-0000-0000-0000-000000000011'::uuid, 'wanjiku.landlord@example.test',   '{"full_name":"Wanjiku Kamau","role":"landlord","phone":"+254700000011"}'),
  ('10000000-0000-0000-0000-000000000012'::uuid, 'otieno.landlord@example.test',    '{"full_name":"Otieno Odhiambo","role":"landlord","phone":"+254700000012"}'),
  ('10000000-0000-0000-0000-000000000021'::uuid, 'amina.tenant@example.test',       '{"full_name":"Amina Yusuf","phone":"+254711000021"}'),
  ('10000000-0000-0000-0000-000000000022'::uuid, 'brian.tenant@example.test',       '{"full_name":"Brian Mwangi","phone":"+254711000022"}'),
  ('10000000-0000-0000-0000-000000000023'::uuid, 'carol.applicant@example.test',    '{"full_name":"Carol Njeri","phone":"+254711000023"}')
) as v (id, email, meta);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email like '%@apartment.test' or u.email like '%@example.test';

-- Admin accounts are provisioned out-of-band, never by signup: promote the seeded admin here.
update public.profiles set role = 'admin' where id = '10000000-0000-0000-0000-000000000001';
delete from public.tenant_profiles where user_id = '10000000-0000-0000-0000-000000000001';
insert into public.admin_profiles (user_id) values ('10000000-0000-0000-0000-000000000001');

update public.landlord_profiles set business_name = 'Kamau Properties Ltd', verification_status = 'verified'
 where user_id = '10000000-0000-0000-0000-000000000011';
update public.landlord_profiles set business_name = null
 where user_id = '10000000-0000-0000-0000-000000000012';

-- ---- properties -----------------------------------------------------------------------------------
insert into public.properties
  (id, landlord_id, name, property_type, description, address_line_1, city, county_or_region, country,
   latitude, longitude, status, verification_status, published_at)
select p.id, lp.id, p.name, p.ptype::public.property_type, p.descr, p.addr, p.city, p.county, 'KE',
       p.lat, p.lng, p.st::public.property_status, p.vs::public.verification_status,
       case when p.st = 'published' then now() end
from (values
  ('20000000-0000-0000-0000-000000000001'::uuid, '10000000-0000-0000-0000-000000000011'::uuid,
   'Sunrise Apartments', 'apartment', 'Modern apartments near the Ngong Road corridor.',
   'Ngong Road 45', 'Nairobi', 'Nairobi', -1.300000::numeric, 36.780000::numeric, 'published', 'verified'),
  ('20000000-0000-0000-0000-000000000002'::uuid, '10000000-0000-0000-0000-000000000012'::uuid,
   'Green View Apartments', 'apartment', 'Quiet complex with a garden, awaiting verification.',
   'Nyali Road 12', 'Mombasa', 'Mombasa', -4.030000::numeric, 39.710000::numeric, 'published', 'pending'),
  ('20000000-0000-0000-0000-000000000003'::uuid, '10000000-0000-0000-0000-000000000012'::uuid,
   'Kijani Villas', 'villa', 'Draft listing - not yet submitted.',
   'Karen Road 7', 'Nairobi', 'Nairobi', null::numeric, null::numeric, 'draft', 'unverified')
) as p (id, landlord_user, name, ptype, descr, addr, city, county, lat, lng, st, vs)
join public.landlord_profiles lp on lp.user_id = p.landlord_user;

insert into public.property_amenities (property_id, amenity_id)
select '20000000-0000-0000-0000-000000000001', a.id from public.amenities a
 where a.slug in ('parking', 'security', 'generator', 'water-tank', 'elevator');
insert into public.property_amenities (property_id, amenity_id)
select '20000000-0000-0000-0000-000000000002', a.id from public.amenities a where a.slug in ('garden', 'security');

-- ---- units ---------------------------------------------------------------------------------------------
insert into public.units
  (id, property_id, unit_number, unit_type, floor_number, bedrooms, bathrooms, monthly_rent, security_deposit, description, status, available_from)
values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'A01', '1BR', 1, 1, 1, 25000, 25000, 'Sunny one-bedroom.',        'occupied', null),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'A02', '2BR', 1, 2, 2, 38000, 38000, 'Two-bedroom with balcony.', 'vacant',   current_date + 7),
  ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'A03', 'Studio', 2, 0, 1, 15000, 15000, 'Compact studio.',         'vacant',   current_date),
  ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 'A04', '2BR', 2, 2, 1, 36000, 36000, 'Under repair.',              'maintenance', null),
  ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', 'G01', '1BR', 0, 1, 1, 22000, 22000, 'Ground-floor garden unit.',   'vacant',   current_date),
  ('30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000003', 'V1',  'Villa', 0, 4, 3, 120000, 120000, 'Four-bedroom villa.',    'vacant',   null);

-- ---- one real tenancy: Amina rents A01 (history rows would sit alongside it) -----------------------------------
insert into public.tenancies (id, tenant_id, unit_id, landlord_id, start_date, monthly_rent, security_deposit, status, move_in_notes)
select '40000000-0000-0000-0000-000000000001', tp.id, '30000000-0000-0000-0000-000000000001', lp.id,
       date_trunc('month', current_date)::date - 60, 25000, 25000, 'active', 'Keys handed over; meter readings recorded.'
from public.tenant_profiles tp, public.landlord_profiles lp
where tp.user_id = '10000000-0000-0000-0000-000000000021' and lp.user_id = '10000000-0000-0000-0000-000000000011';

insert into public.rent_charges (id, tenancy_id, billing_period_start, billing_period_end, due_date, amount, status) values
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   (date_trunc('month', current_date) - interval '1 month')::date, (date_trunc('month', current_date) - interval '1 day')::date,
   (date_trunc('month', current_date) - interval '1 month' + interval '4 days')::date, 25000, 'paid'),
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001',
   date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
   (date_trunc('month', current_date) + interval '4 days')::date, 25000, 'pending');

insert into public.payments (tenancy_id, rent_charge_id, tenant_id, amount, payment_method, provider, provider_reference, status, paid_at)
select '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', tp.id,
       25000, 'bank_transfer', 'manual', 'DEV-SEED-0001', 'successful', now() - interval '25 days'
from public.tenant_profiles tp where tp.user_id = '10000000-0000-0000-0000-000000000021';

insert into public.maintenance_requests (tenant_id, unit_id, tenancy_id, title, description, priority)
select tp.id, '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
       'Kitchen tap dripping', 'The kitchen mixer tap drips continuously.', 'low'
from public.tenant_profiles tp where tp.user_id = '10000000-0000-0000-0000-000000000021';

-- ---- one pending application: Carol -> A02 ---------------------------------------------------------------------------
insert into public.rental_applications (tenant_id, unit_id, message, desired_move_in_date)
select tp.id, '30000000-0000-0000-0000-000000000002', 'Working nearby; looking to move next month.', current_date + 14
from public.tenant_profiles tp where tp.user_id = '10000000-0000-0000-0000-000000000023';

-- ---- one verification request: Green View awaiting admin review --------------------------------------------------------
insert into public.property_verification_requests (id, property_id, submitted_by_landlord_id, status, submitted_at)
select '60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', lp.id, 'submitted', now() - interval '1 day'
from public.landlord_profiles lp where lp.user_id = '10000000-0000-0000-0000-000000000012';
insert into public.property_verification_documents (verification_request_id, document_type, storage_path) values
  ('60000000-0000-0000-0000-000000000001', 'ownership_proof', '20000000-0000-0000-0000-000000000002/60000000-0000-0000-0000-000000000001/dev-placeholder-deed.pdf');

-- ---- a notice to Sunrise tenants ---------------------------------------------------------------------------------------------
insert into public.notices (id, created_by, property_id, title, body)
values ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000011',
        '20000000-0000-0000-0000-000000000001', 'Scheduled water maintenance', 'Water will be off on Saturday 9am-1pm.');
insert into public.notice_recipients (notice_id, tenant_id)
select '70000000-0000-0000-0000-000000000001', tp.id from public.tenant_profiles tp
 where tp.user_id = '10000000-0000-0000-0000-000000000021';

insert into public.notifications (user_id, type, title, body)
values ('10000000-0000-0000-0000-000000000021', 'notice', 'Scheduled water maintenance', 'Water will be off on Saturday 9am-1pm.');
