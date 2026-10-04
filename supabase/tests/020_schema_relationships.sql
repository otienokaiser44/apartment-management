-- Relational integrity: ownership chain, uniqueness, check constraints, consistency triggers.
-- Runs as the table owner (RLS bypassed) so only the schema itself is being tested.
begin;
\ir support/helpers.sql
\ir support/fixtures.sql

-- Ownership chain: tenant_profile -> tenancy -> unit -> property -> landlord -------------------
select t.eq((select landlord_id::text from public.properties where id = t.u('1001')),
            t.landlord_pid(t.u('b01'))::text, 'property belongs to its landlord');
select t.eq((select property_id::text from public.units where id = t.u('2001')),
            t.u('1001')::text, 'unit belongs to its property');

insert into public.tenancies (id, tenant_id, unit_id, landlord_id, start_date, monthly_rent, status)
values (t.u('3001'), t.tenant_pid(t.u('c01')), t.u('2001'), t.landlord_pid(t.u('b01')), current_date, 1000, 'active');

select t.eq((select tenant_id::text from public.tenancies where id = t.u('3001')),
            t.tenant_pid(t.u('c01'))::text, 'tenancy links the tenant profile');
select t.eq((select u.property_id::text from public.tenancies te join public.units u on u.id = te.unit_id where te.id = t.u('3001')),
            t.u('1001')::text, 'tenancy -> unit -> property chain resolves');

-- Constraints ----------------------------------------------------------------------------------
select t.throws($q$insert into public.units (property_id, unit_number, monthly_rent)
                   values (t.u('1001'), 'A01', 500)$q$,
  'unit_number is unique within a property', '23505');
select t.lives($q$insert into public.units (property_id, unit_number, monthly_rent)
                   values (t.u('1002'), 'A01', 500)$q$,
  'same unit_number is fine in a different property');
select t.throws($q$insert into public.units (property_id, unit_number, monthly_rent)
                   values (t.u('1001'), 'NEG', -1)$q$,
  'negative rent rejected', '23514');
select t.throws($q$insert into public.units (property_id, unit_number, monthly_rent, bedrooms)
                   values (t.u('1001'), 'BED', 100, -2)$q$,
  'negative bedrooms rejected', '23514');
select t.eq(t.scalar($q$select data_type || '(' || numeric_precision || ',' || numeric_scale || ')'
                        from information_schema.columns
                       where table_name = 'units' and column_name = 'monthly_rent'$q$),
            'numeric(12,2)', 'money is numeric(12,2), never float');

-- One active tenancy per unit ----------------------------------------------------------------------
select t.throws($q$insert into public.tenancies (tenant_id, unit_id, landlord_id, start_date, monthly_rent, status)
   values (t.tenant_pid(t.u('c02')), t.u('2001'), t.landlord_pid(t.u('b01')), current_date, 1000, 'active')$q$,
  'second ACTIVE tenancy on a unit is impossible', '23505');
select t.throws($q$insert into public.tenancies (tenant_id, unit_id, landlord_id, start_date, monthly_rent, status)
   values (t.tenant_pid(t.u('c02')), t.u('2001'), t.landlord_pid(t.u('b01')), current_date, 1000, 'pending')$q$,
  'a PENDING tenancy cannot coexist with an active one', '23505');
select t.lives($q$update public.tenancies set status = 'ended', end_date = current_date where id = t.u('3001')$q$,
  'active tenancy can be ended');
select t.lives($q$insert into public.tenancies (tenant_id, unit_id, landlord_id, start_date, monthly_rent, status)
   values (t.tenant_pid(t.u('c02')), t.u('2001'), t.landlord_pid(t.u('b01')), current_date, 1000, 'active')$q$,
  'after ending, the unit can have a new active tenancy (history kept)');
select t.eq((select count(*) from public.tenancies where unit_id = t.u('2001'))::text, '2',
  'old tenancy row still exists alongside the new one');
select t.throws($q$insert into public.tenancies (tenant_id, unit_id, landlord_id, start_date, monthly_rent, status)
   values (t.tenant_pid(t.u('c03')), t.u('2002'), t.landlord_pid(t.u('b01')), current_date, 1, 'ended')$q$,
  'an ended tenancy must have an end_date', '23514');

-- landlord_id must match the property owner ------------------------------------------------------
select t.throws($q$insert into public.tenancies (tenant_id, unit_id, landlord_id, start_date, monthly_rent, status)
   values (t.tenant_pid(t.u('c03')), t.u('2003'), t.landlord_pid(t.u('b01')), current_date, 800, 'pending')$q$,
  'tenancy landlord must own the unit''s property', '23514', 'landlord_id');

-- Applications ----------------------------------------------------------------------------------------
insert into public.rental_applications (tenant_id, unit_id) values (t.tenant_pid(t.u('c03')), t.u('2002'));
select t.throws($q$insert into public.rental_applications (tenant_id, unit_id)
                    values (t.tenant_pid(t.u('c03')), t.u('2002'))$q$,
  'no duplicate pending application per tenant+unit', '23505');
select t.lives($q$insert into public.rental_applications (tenant_id, unit_id)
                    values (t.tenant_pid(t.u('c02')), t.u('2002'))$q$,
  'different tenants may apply to the same unit');
update public.rental_applications set status = 'withdrawn'
 where tenant_id = t.tenant_pid(t.u('c03')) and unit_id = t.u('2002');
select t.lives($q$insert into public.rental_applications (tenant_id, unit_id)
                    values (t.tenant_pid(t.u('c03')), t.u('2002'))$q$,
  'a tenant may re-apply after withdrawing');

-- Invitations ------------------------------------------------------------------------------------------
insert into public.tenant_invitations (landlord_id, property_id, unit_id, invitee_email, token_hash, expires_at)
values (t.landlord_pid(t.u('b01')), t.u('1001'), t.u('2002'), 'x@example.test', 'hash-1', now() + interval '1 day');
select t.throws($q$insert into public.tenant_invitations (landlord_id, property_id, unit_id, invitee_email, token_hash, expires_at)
   values (t.landlord_pid(t.u('b01')), t.u('1001'), t.u('2002'), 'y@example.test', 'hash-1', now() + interval '1 day')$q$,
  'invitation token_hash is unique', '23505');
select t.throws($q$insert into public.tenant_invitations (landlord_id, property_id, unit_id, invitee_email, token_hash, expires_at)
   values (t.landlord_pid(t.u('b02')), t.u('1001'), t.u('2002'), 'y@example.test', 'hash-2', now() + interval '1 day')$q$,
  'invitation landlord must own the unit', '23514', 'mismatch');
select t.throws($q$insert into public.tenant_invitations (landlord_id, property_id, unit_id, invitee_email, token_hash, expires_at)
   values (t.landlord_pid(t.u('b01')), t.u('1003'), t.u('2002'), 'y@example.test', 'hash-3', now() + interval '1 day')$q$,
  'invitation property must match the unit''s property', '23514', 'mismatch');
select t.throws($q$insert into public.tenant_invitations (landlord_id, property_id, unit_id, token_hash, expires_at)
   values (t.landlord_pid(t.u('b01')), t.u('1001'), t.u('2002'), 'hash-4', now() + interval '1 day')$q$,
  'invitation needs an email or phone', '23514');

-- Payments / maintenance consistency ------------------------------------------------------------------------
insert into public.rent_charges (id, tenancy_id, billing_period_start, billing_period_end, due_date, amount)
select t.u('4001'), id, date '2026-01-01', date '2026-01-31', date '2026-01-05', 1000
  from public.tenancies where tenant_id = t.tenant_pid(t.u('c02')) and unit_id = t.u('2001');
select t.throws($q$insert into public.rent_charges (tenancy_id, billing_period_start, billing_period_end, due_date, amount)
   select tenancy_id, billing_period_start, billing_period_end, due_date, amount from public.rent_charges where id = t.u('4001')$q$,
  'one live charge per tenancy billing period', '23505');

insert into public.payments (id, tenancy_id, rent_charge_id, tenant_id, amount, provider, provider_reference, status)
select t.u('5001'), tenancy_id, t.u('4001'), t.tenant_pid(t.u('c02')), 100, 'acme', 'REF-1', 'pending'
  from public.rent_charges where id = t.u('4001');
select t.throws($q$insert into public.payments (tenancy_id, rent_charge_id, tenant_id, amount, provider, provider_reference)
   select tenancy_id, id, t.tenant_pid(t.u('c02')), 5, 'acme', 'REF-1' from public.rent_charges where id = t.u('4001')$q$,
  'provider reference is unique per provider', '23505');
select t.lives($q$insert into public.payments (tenancy_id, rent_charge_id, tenant_id, amount, provider, provider_reference)
   select tenancy_id, id, t.tenant_pid(t.u('c02')), 5, 'other', 'REF-1' from public.rent_charges where id = t.u('4001')$q$,
  'same reference under another provider is fine');
select t.throws($q$insert into public.payments (tenancy_id, tenant_id, amount)
   select tenancy_id, t.tenant_pid(t.u('c03')), 5 from public.rent_charges where id = t.u('4001')$q$,
  'payment tenant must be the tenancy tenant', '23514');
select t.throws($q$insert into public.payments (tenancy_id, tenant_id, amount) select tenancy_id, t.tenant_pid(t.u('c02')), 0
                    from public.rent_charges where id = t.u('4001')$q$,
  'payment amount must be positive', '23514');

select t.throws($q$insert into public.maintenance_requests (tenant_id, unit_id, tenancy_id, title)
   select t.tenant_pid(t.u('c03')), unit_id, id, 'Leak' from public.tenancies where tenant_id = t.tenant_pid(t.u('c02')) and status = 'active'$q$,
  'maintenance request must match the tenancy tenant/unit', '23514');
select t.lives($q$insert into public.maintenance_requests (tenant_id, unit_id, tenancy_id, title)
   select tenant_id, unit_id, id, 'Leak' from public.tenancies where tenant_id = t.tenant_pid(t.u('c02')) and status = 'active'$q$,
  'valid maintenance request accepted');

-- Favorites ----------------------------------------------------------------------------------------------
select t.throws($q$insert into public.favorites (user_id) values (t.u('c01'))$q$, 'favorite needs a target', '23514');
select t.throws($q$insert into public.favorites (user_id, property_id, unit_id) values (t.u('c01'), t.u('1001'), t.u('2001'))$q$,
  'favorite cannot target both', '23514');
insert into public.favorites (user_id, unit_id) values (t.u('c01'), t.u('2001'));
select t.throws($q$insert into public.favorites (user_id, unit_id) values (t.u('c01'), t.u('2001'))$q$,
  'favorite unique per user+target', '23505');

-- Delete protection: history cannot be erased through the owner chain ------------------------------------
select t.throws($q$delete from public.units where id = t.u('2001')$q$, 'unit with tenancy history cannot be deleted', '23001');
select t.throws($q$delete from public.landlord_profiles where id = t.landlord_pid(t.u('b01'))$q$,
  'landlord with properties cannot be deleted', '23001');
select t.throws($q$delete from public.tenant_profiles where id = t.tenant_pid(t.u('c01'))$q$,
  'tenant with tenancy history cannot be deleted', '23001');

-- Audit log is immutable even for the owner -------------------------------------------------------------------
insert into public.audit_logs (action, entity_type) values ('x', 'y');
select t.throws($q$update public.audit_logs set action = 'z'$q$, 'audit rows cannot be updated', '42501');
select t.throws($q$delete from public.audit_logs$q$, 'audit rows cannot be deleted', '42501');

select t.finish();
rollback;
