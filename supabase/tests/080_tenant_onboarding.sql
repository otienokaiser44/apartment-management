-- Tenant onboarding: bulk roster invitations, landlord->tenant link requests, tenant->unit requests by property code.
begin;
\ir support/helpers.sql
\ir support/fixtures.sql

insert into public.units (id, property_id, unit_number, monthly_rent, security_deposit)
values (t.u('2010'), t.u('1001'), 'A10', 900, 900), (t.u('2011'), t.u('1001'), 'A11', 950, 950);

-- ===== property code ========================================================================================
select t.as_owner();
select t.ok((select property_code ~ '^[A-HJKMNP-Z2-9]{8}$' from public.properties where id = t.u('1001')), 'every property has an 8-char unambiguous code');
select t.ok((select count(distinct property_code) = count(*) from public.properties), 'codes are unique');
select t.as_user(t.u('b01'));
select t.throws($q$update public.properties set property_code = 'AAAAAAAA' where id = t.u('1001')$q$, 'landlord cannot change the code', '42501');
select t.lives($q$insert into public.properties (landlord_id, name, address_line_1, city)
                   values (t.landlord_pid(t.u('b01')), 'New Place', '9 Rd', 'Nairobi')$q$, 'landlord can insert a property (code default runs for them)');

-- ===== A. bulk roster ===============================================================================================
select t.as_owner();
create table t.bulk_out (unit_id uuid, unit_number text, invitee_name text, invitee_email text, invitee_phone text, token text);
grant all on t.bulk_out to public;
create function t.bulk_detail(p_prop uuid, p_roster jsonb) returns text language plpgsql as $$
declare v_detail text;
begin
  perform * from public.create_tenant_invitations_bulk(p_prop, p_roster);
  return 'no error';
exception when others then
  get stacked diagnostics v_detail = pg_exception_detail;
  return coalesce(v_detail, '');
end $$;
select t.as_user(t.u('c01'));
select t.throws($q$select * from public.create_tenant_invitations_bulk(t.u('1001'), '[{"unit_number":"A01","tenant_email":"a@example.test"}]')$q$, 'tenant cannot bulk invite', '42501');
select t.as_user(t.u('b02'));
select t.throws($q$select * from public.create_tenant_invitations_bulk(t.u('1001'), '[{"unit_number":"A01","tenant_email":"a@example.test"}]')$q$, 'landlord cannot use another landlord''s property', 'P0002');
select t.as_user(t.u('b01'));
select t.throws($q$select * from public.create_tenant_invitations_bulk(t.u('1001'), '[]')$q$, 'empty roster rejected', '22023');
select t.throws($q$select * from public.create_tenant_invitations_bulk(t.u('1001'), '{"a":1}')$q$, 'non-array roster rejected', '22023');

-- one bad row => nothing is created, every problem is reported
select t.throws($q$select * from public.create_tenant_invitations_bulk(t.u('1001'), '[
  {"unit_number":"A10","tenant_name":"Ok One","tenant_email":"ok1@example.test"},
  {"unit_number":"NOPE","tenant_email":"x@example.test"},
  {"unit_number":"A11"},
  {"unit_number":"a10","tenant_email":"dup@example.test"},
  {"unit_number":"A02","tenant_email":"not-an-email"}]')$q$,
  'invalid roster is rejected as a whole', '22023', 'nothing was created');
select t.as_owner();
select t.eq((select count(*) from public.tenant_invitations)::text, '0', 'no invitation was created by the failed roster');
select t.as_user(t.u('b01'));
select t.ok(
  (select position('unit not found in this property' in d) > 0 and position('tenant_email or tenant_phone is required' in d) > 0
      and position('duplicate unit_number in roster' in d) > 0 and position('not a valid email' in d) > 0
   from (select t.bulk_detail(t.u('1001'), '[
     {"unit_number":"A10","tenant_name":"Ok One","tenant_email":"ok1@example.test"},
     {"unit_number":"NOPE","tenant_email":"x@example.test"},
     {"unit_number":"A11"},
     {"unit_number":"a10","tenant_email":"dup@example.test"},
     {"unit_number":"A02","tenant_email":"not-an-email"}]'::jsonb) as d) x),
  'the error detail lists every bad row');

-- happy path
insert into t.bulk_out
  select * from public.create_tenant_invitations_bulk(t.u('1001'), '[
    {"unit_number":"A10","tenant_name":"Jane Doe","tenant_email":"Jane@Example.test"},
    {"unit_number":"a11","tenant_name":"John Roe","tenant_phone":"+254722000000"}]');
select t.eq((select count(*) from t.bulk_out)::text, '2', 'one token per roster row');
select t.ok((select bool_and(length(token) >= 40) from t.bulk_out), 'tokens are long and random');
select t.as_owner();
select t.eq((select count(*) from public.tenant_invitations where invitee_name is not null)::text, '2', 'tenant names stored');
select t.eq((select invitee_email from public.tenant_invitations where invitee_name = 'Jane Doe'), 'jane@example.test', 'email normalised');
select t.eq((select count(*) from public.tenant_invitations i join t.bulk_out b on i.token_hash = b.token)::text, '0', 'raw tokens are not stored');
select t.as_user(t.u('b01'));
select t.throws($q$select * from public.create_tenant_invitations_bulk(t.u('1001'), '[{"unit_number":"A10","tenant_email":"z@example.test"}]')$q$,
  'a unit with a pending invitation cannot be re-invited', '22023', 'nothing was created');

-- ===== B. claim (existing accept RPC) ===================================================================================
select token as jane_token from t.bulk_out where unit_number = 'A10' \gset
select t.as_owner();
update public.profiles set email = 'jane@example.test' where id = t.u('c03');
select t.as_user(t.u('c02'));
select t.throws(format('select public.accept_tenant_invitation(%L)', :'jane_token'), 'wrong account cannot claim', '42501');
select t.as_user(t.u('c03'));
select t.lives(format('select public.accept_tenant_invitation(%L)', :'jane_token'), 'matching tenant claims the unit');
select t.as_owner();
select t.eq((select status::text from public.tenancies where unit_id = t.u('2010')), 'active', 'claim creates an active tenancy');
select t.eq((select status::text from public.units where id = t.u('2010')), 'occupied', 'unit occupied after claim');

-- ===== C. landlord links an existing account ==========================================================================
select t.as_user(t.u('c01'));
select t.throws($q$select public.request_tenant_link(t.u('2001'), 'tenant2@example.test')$q$, 'tenant cannot create link requests', '42501');
select t.as_user(t.u('b02'));
select t.throws($q$select public.request_tenant_link(t.u('2001'), 'tenant2@example.test')$q$, 'other landlord cannot link to this unit', 'P0002', 'unit not found');
select t.as_user(t.u('b01'));
select t.throws($q$select public.request_tenant_link(t.u('2001'))$q$, 'contact required', '22023');
select t.throws($q$select public.request_tenant_link(t.u('2001'), 'nobody@example.test')$q$, 'unknown account', 'P0002', 'send an invitation');
select t.throws($q$select public.request_tenant_link(t.u('2001'), 'landlord2@example.test')$q$, 'a landlord account cannot be linked as tenant', 'P0002');
select t.throws($q$select public.request_tenant_link(t.u('2010'), 'tenant1@example.test')$q$, 'occupied unit cannot be linked', '22023');

select public.request_tenant_link(t.u('2001'), 'Tenant1@Example.test') as req1 \gset
select t.throws($q$select public.request_tenant_link(t.u('2001'), 'tenant2@example.test')$q$, 'one pending request per unit', '23505');
select t.as_owner();
select t.eq((select count(*) from public.notifications where user_id = t.u('c01') and type = 'link_request_received')::text, '1', 'tenant notified');
select t.eq((select status::text from public.units where id = t.u('2001')), 'vacant', 'unit stays vacant until the tenant accepts');
select t.as_user(t.u('c02'));
select t.eq((select count(*) from public.tenant_link_requests)::text, '0', 'other tenants cannot see the request');
select t.throws(format('select public.respond_tenant_link(%L, true)', :'req1'), 'other tenant cannot respond', 'P0002');
select t.throws($q$update public.tenant_link_requests set status = 'accepted'$q$, 'clients cannot update requests directly', '42501');
select t.as_user(t.u('b01'));
select t.throws(format('select public.respond_tenant_link(%L, true)', :'req1'), 'landlord cannot accept for the tenant', '42501');
select t.as_user(t.u('c01'));
select t.eq((select count(*) from public.tenant_link_requests)::text, '1', 'addressed tenant sees the request');
select t.lives(format('select public.respond_tenant_link(%L, true)', :'req1'), 'tenant accepts');
select t.as_owner();
select t.eq((select status::text from public.tenancies where unit_id = t.u('2001')), 'active', 'accept creates an active tenancy');
select t.eq((select status::text from public.units where id = t.u('2001')), 'occupied', 'accept occupies the unit');
select t.eq((select status from public.tenant_link_requests where id = :'req1'), 'accepted', 'request marked accepted');
select t.as_user(t.u('c01'));
select t.throws(format('select public.respond_tenant_link(%L, true)', :'req1'), 'a request is single-use', '22023', 'already accepted');

-- reject, cancel, expiry
select t.as_user(t.u('b01'));
select public.request_tenant_link(t.u('2002'), null, '+254 711 000 002') as req2 \gset
select t.as_user(t.u('c02'));
select t.lives(format('select public.respond_tenant_link(%L, false)', :'req2'), 'tenant rejects');
select t.as_owner();
select t.eq((select count(*) from public.tenancies where unit_id = t.u('2002'))::text, '0', 'reject creates no tenancy');
select t.eq((select status::text from public.units where id = t.u('2002')), 'vacant', 'reject leaves the unit vacant');
select t.eq((select count(*) from public.notifications where user_id = t.u('b01') and type = 'link_request_rejected')::text, '1', 'landlord notified of rejection');

select t.as_user(t.u('b01'));
select public.request_tenant_link(t.u('2002'), 'tenant2@example.test') as req3 \gset
select t.as_user(t.u('b02'));
select t.throws(format('select public.cancel_tenant_link_request(%L)', :'req3'), 'other landlord cannot cancel', 'P0002');
select t.as_user(t.u('b01'));
select t.lives(format('select public.cancel_tenant_link_request(%L)', :'req3'), 'landlord cancels a pending request');
select public.request_tenant_link(t.u('2002'), 'tenant2@example.test') as req4 \gset
select t.as_owner();
update public.tenant_link_requests set expires_at = now() - interval '1 minute' where id = :'req4';
select t.as_user(t.u('c02'));
select t.throws(format('select public.respond_tenant_link(%L, true)', :'req4'), 'expired request cannot be accepted', '22023', 'expired');

-- unit taken before the tenant accepts
select t.as_user(t.u('b01'));
select public.request_tenant_link(t.u('2002'), 'tenant2@example.test') as req5 \gset
select t.as_owner();
update public.units set status = 'maintenance' where id = t.u('2002');
select t.as_user(t.u('c02'));
select t.throws(format('select public.respond_tenant_link(%L, true)', :'req5'), 'cannot accept when unit is no longer vacant', '22023', 'no longer available');
select t.as_owner();
update public.units set status = 'vacant' where id = t.u('2002');

-- ===== D. tenant requests a unit by property code ===================================================================
select property_code as p1code from public.properties where id = t.u('1001') \gset
select t.as_user(t.u('b01'));
select t.throws(format('select public.submit_unit_link_request(%L, %L)', :'p1code', 'A02'), 'landlords cannot submit unit requests', '42501');
select t.as_user(t.u('c02'));
select t.throws($q$select public.submit_unit_link_request('ZZZZZZZZ', 'A02')$q$, 'unknown code', 'P0002', 'property or unit not found');
select t.throws(format('select public.submit_unit_link_request(%L, %L)', :'p1code', 'NOPE'), 'unknown unit', 'P0002', 'property or unit not found');
select t.throws(format('select public.submit_unit_link_request(%L, %L)', :'p1code', 'A01'), 'occupied unit not available', '22023', 'not available');
select t.throws(format('select public.submit_unit_link_request(%L, %L, %L)', :'p1code', 'A02', repeat('x', 1001)), 'message length capped', '22023');
select public.submit_unit_link_request(lower(:'p1code'), ' a02 ', 'Hi, I live here') as app1 \gset
select t.throws(format('select public.submit_unit_link_request(%L, %L)', :'p1code', 'A02'), 'duplicate pending request blocked', '23505');
select t.as_owner();
select t.eq((select status::text from public.rental_applications where id = :'app1'), 'pending', 'request is a pending application');
select t.eq((select count(*) from public.notifications where user_id = t.u('b01') and type = 'unit_link_requested')::text, '1', 'landlord notified');
select t.eq((select status::text from public.units where id = t.u('2002')), 'vacant', 'unit not reserved until approval');
select t.as_user(t.u('b02'));
select t.throws(format('select public.approve_rental_application(%L)', :'app1'), 'other landlord cannot approve', '42501');
select t.as_user(t.u('b01'));
select t.lives(format('select public.approve_rental_application(%L)', :'app1'), 'owning landlord approves');
select t.as_owner();
select t.eq((select status::text from public.tenancies where unit_id = t.u('2002')), 'pending', 'approval creates a pending tenancy (move-in confirmed separately)');

select t.as_owner();
select t.finish();
rollback;
