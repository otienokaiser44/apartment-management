-- Shared fixtures (included after helpers.sql, run as the table owner, rolled back with the test).
--
--   admin      00000000-0000-0000-0000-000000000a01
--   landlord 1 00000000-0000-0000-0000-000000000b01   owns P1 (published+verified), P3 (draft)
--   landlord 2 00000000-0000-0000-0000-000000000b02   owns P2 (published+verified)
--   tenant 1/2/3  ...0c01 / ...0c02 / ...0c03          (no tenancy until a test creates one)
--
--   P1 units: U1 (vacant, 1000), U2 (vacant, 1500)    P2 unit: U3 (vacant, 800)
--   P3 unit : U4 (vacant, draft property => not public)

insert into auth.users (id, email, phone, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000a01', 'admin@example.test', null,
     '{"full_name":"Admin One","role":"admin"}'),            -- trigger must IGNORE role=admin
  ('00000000-0000-0000-0000-000000000b01', 'landlord1@example.test', '+254700000001',
     '{"full_name":"Landlord One","role":"landlord"}'),
  ('00000000-0000-0000-0000-000000000b02', 'landlord2@example.test', '+254700000002',
     '{"full_name":"Landlord Two","role":"landlord"}'),
  ('00000000-0000-0000-0000-000000000c01', 'tenant1@example.test', '+254711000001',
     '{"full_name":"Tenant One"}'),
  ('00000000-0000-0000-0000-000000000c02', 'tenant2@example.test', '+254711000002',
     '{"full_name":"Tenant Two"}'),
  ('00000000-0000-0000-0000-000000000c03', 'tenant3@example.test', '+254711000003',
     '{"full_name":"Tenant Three"}');

-- Admins are provisioned out-of-band (service role / owner), never by signup.
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000a01';
delete from public.tenant_profiles where user_id = '00000000-0000-0000-0000-000000000a01';
insert into public.admin_profiles (user_id) values ('00000000-0000-0000-0000-000000000a01');

create function t.tenant_pid(p_user uuid) returns uuid language sql stable security definer set search_path = '' as
  $$ select id from public.tenant_profiles where user_id = p_user $$;
create function t.landlord_pid(p_user uuid) returns uuid language sql stable security definer set search_path = '' as
  $$ select id from public.landlord_profiles where user_id = p_user $$;

insert into public.properties
  (id, landlord_id, name, property_type, address_line_1, city, status, verification_status, published_at)
values
  ('00000000-0000-0000-0000-000000001001', t.landlord_pid('00000000-0000-0000-0000-000000000b01'),
   'Sunrise Apartments', 'apartment', '1 Test Road', 'Nairobi', 'published', 'verified', now()),
  ('00000000-0000-0000-0000-000000001002', t.landlord_pid('00000000-0000-0000-0000-000000000b02'),
   'Green View', 'apartment', '2 Test Road', 'Mombasa', 'published', 'verified', now()),
  ('00000000-0000-0000-0000-000000001003', t.landlord_pid('00000000-0000-0000-0000-000000000b01'),
   'Draft House', 'house', '3 Test Road', 'Nairobi', 'draft', 'unverified', null);

insert into public.units (id, property_id, unit_number, bedrooms, bathrooms, monthly_rent, security_deposit) values
  ('00000000-0000-0000-0000-000000002001', '00000000-0000-0000-0000-000000001001', 'A01', 1, 1, 1000.00, 1000.00),
  ('00000000-0000-0000-0000-000000002002', '00000000-0000-0000-0000-000000001001', 'A02', 2, 1, 1500.00, 1500.00),
  ('00000000-0000-0000-0000-000000002003', '00000000-0000-0000-0000-000000001002', 'B01', 1, 1,  800.00,  800.00),
  ('00000000-0000-0000-0000-000000002004', '00000000-0000-0000-0000-000000001003', 'H01', 3, 2, 3000.00, 3000.00);

-- convenient constants
create function t.u(p_n text) returns uuid language sql immutable as
  $$ select ('00000000-0000-0000-0000-' || lpad(p_n, 12, '0'))::uuid $$;
