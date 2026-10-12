-- Billing engine (settings, meter readings, invoices) and targeted announcements.
begin;
\ir support/helpers.sql
\ir support/fixtures.sql

-- Runs a SQL expression that must return true, as the CURRENT role (so RPCs see the signed-in user).
create function t.is_true(p_sql text, p_name text) returns void language plpgsql as $$
declare v boolean;
begin
  execute p_sql into v;
  perform t.ok(coalesce(v, false), p_name);
exception when others then
  perform t.ok(false, p_name, sqlerrm);
end $$;

-- Active tenancies: tenant1 in A01 (floor 1), tenant2 in A02 (floor 2). Created as owner (lifecycle RPCs are covered elsewhere).
update public.units set floor_number = 1 where id = t.u('2001');
update public.units set floor_number = 2 where id = t.u('2002');
insert into public.tenancies (id, tenant_id, unit_id, landlord_id, start_date, monthly_rent, security_deposit, status)
values
  (t.u('3001'), t.tenant_pid(t.u('c01')), t.u('2001'), t.landlord_pid(t.u('b01')), date_trunc('month', current_date - interval '3 months')::date, 1000, 1000, 'active'),
  (t.u('3002'), t.tenant_pid(t.u('c02')), t.u('2002'), t.landlord_pid(t.u('b01')), date_trunc('month', current_date - interval '3 months')::date, 1500, 1500, 'active');
update public.units set status = 'occupied' where id in (t.u('2001'), t.u('2002'));

select date_trunc('month', current_date - interval '2 months')::date as m1,
       date_trunc('month', current_date - interval '1 month')::date as m2,
       date_trunc('month', current_date)::date as m3 \gset

-- ===== settings ===============================================================================================
select t.as_owner();
select t.eq((select count(*) from public.property_settings where property_id = t.u('1001'))::text, '1', 'every property has a settings row');
select t.as_user(t.u('b02'));
select t.eq((select count(*) from public.property_settings where property_id = t.u('1001'))::text, '0', 'other landlord cannot read settings');
select t.as_user(t.u('b01'));
select t.lives($q$update public.property_settings set default_garbage_fee = 200, water_rate_per_unit = 50,
                   late_penalty_percentage = 10, rent_due_day = 5 where property_id = t.u('1001')$q$, 'owner configures billing');
select t.throws($q$update public.property_settings set late_penalty_percentage = 150 where property_id = t.u('1001')$q$, 'penalty above 100% rejected', '23514');
select t.throws($q$update public.property_settings set property_id = t.u('1002') where property_id = t.u('1001')$q$, 'settings key cannot be repointed', '42501');
select t.as_user(t.u('c01'));
select t.eq((select count(*) from public.property_settings)::text, '0', 'tenants cannot read settings');

-- ===== meter readings =================================================================================================
select t.as_user(t.u('c01'));
select t.throws(format($q$select public.record_utility_readings(t.u('1001'), %L, '[{"unit_id":"%s","current_reading":10}]')$q$, :'m1', t.u('2001')), 'tenant cannot record readings', 'P0002');
select t.as_user(t.u('b02'));
select t.throws(format($q$select public.record_utility_readings(t.u('1001'), %L, '[{"unit_id":"%s","current_reading":10}]')$q$, :'m1', t.u('2001')), 'other landlord cannot record readings', 'P0002');
select t.as_user(t.u('b01'));
select t.throws(format($q$select public.record_utility_readings(t.u('1001'), %L, '[]')$q$, :'m1'), 'empty submission rejected', '22023');
select t.throws(format($q$select public.record_utility_readings(t.u('1001'), (current_date + interval '2 months')::date, '[{"unit_id":"%s","current_reading":10}]')$q$, t.u('2001')), 'future months rejected', '22023');

-- first reading is a baseline
select t.is_true(format($q$select public.record_utility_readings(t.u('1001'), %L,
   '[{"unit_id":"%s","current_reading":100},{"unit_id":"%s","current_reading":50}]') = 2$q$, :'m1', t.u('2001'), t.u('2002')), 'two baseline readings saved');
select t.as_owner();
select t.eq((select units_consumed::text from public.utility_readings where unit_id = t.u('2001') and period_start = :'m1'), '0.000', 'first reading is a zero-consumption baseline');
select t.as_user(t.u('b01'));

-- bad rows: nothing saved
select t.throws(format($q$select public.record_utility_readings(t.u('1001'), %L,
   '[{"unit_id":"%s","current_reading":90},{"unit_id":"%s"},{"unit_id":"%s","current_reading":1,"units_consumed":1}]')$q$,
   :'m2', t.u('2001'), t.u('2002'), t.u('2003')), 'bad readings reject the whole submission', '22023', 'nothing was saved');
select t.as_owner();
select t.eq((select count(*) from public.utility_readings where period_start = :'m2')::text, '0', 'nothing saved after a failed submission');
select t.as_user(t.u('b01'));

-- month 2: 100 -> 112 (12 units) and consumed-only for the other (8 units)
select t.is_true(format($q$select public.record_utility_readings(t.u('1001'), %L,
   '[{"unit_id":"%s","current_reading":112},{"unit_id":"%s","units_consumed":8}]') = 2$q$, :'m2', t.u('2001'), t.u('2002')), 'month 2 readings saved');
select t.as_owner();
select t.eq((select water_amount::text from public.utility_readings where unit_id = t.u('2001') and period_start = :'m2'), '600.00', 'water bill = 12 units x rate 50, computed by the database');
select t.eq((select current_reading::text from public.utility_readings where unit_id = t.u('2002') and period_start = :'m2'), '58.000', 'consumed-only input derives the current reading');
select t.as_user(t.u('c01'));
select t.eq((select count(*) from public.utility_readings)::text, '2', 'tenant sees readings for their own unit only');
select t.throws($q$insert into public.utility_readings (unit_id, period_start, previous_reading, current_reading, units_consumed, rate_per_unit, water_amount)
                    values (t.u('2001'), date '2020-01-01', 0, 0, 0, 0, 0)$q$, 'clients cannot write readings directly', '42501');
select t.as_user(t.u('b01'));
select t.throws(format($q$select public.record_utility_readings(t.u('1001'), %L, '[{"unit_id":"%s","current_reading":90}]')$q$, :'m1', t.u('2001')), 'earlier month is locked once a later month exists', '22023', 'nothing was saved');

-- ===== invoice generation =============================================================================================
-- month 2 invoices
create table t.gen_out (tenancy_id uuid, unit_number text, invoice_id uuid, total_amount numeric, skipped_reason text);
grant all on t.gen_out to public;
insert into t.gen_out select * from public.generate_monthly_invoices(t.u('1001'), :'m2');
select t.eq((select count(*) filter (where invoice_id is not null) from t.gen_out)::text, '2', 'invoices generated for both active tenancies');
select t.as_owner();
-- A01: rent 1000 + water 600 + garbage 200 = 1800, no history
select t.eq((select total_amount::text from public.invoices where tenancy_id = t.u('3001') and billing_period_start = :'m2'), '1800.00', 'invoice total = rent + water + garbage (+ penalty + previous)');
select t.eq((select base_rent || '/' || water_bill || '/' || garbage_fee || '/' || late_penalty || '/' || previous_balance
               from public.invoices where tenancy_id = t.u('3001') and billing_period_start = :'m2'), '1000.00/600.00/200.00/0.00/0.00', 'breakdown columns are stored');
select t.eq((select amount::text from public.rent_charges where tenancy_id = t.u('3001') and billing_period_start = :'m2'), '1800.00', 'the charge carries this period''s amount (no carried balance)');
select t.eq((select status from public.invoice_overview where tenancy_id = t.u('3001') and billing_period_start = :'m2'), 'unpaid', 'new invoice is unpaid');
select t.eq((select count(*) from public.notifications where type = 'invoice_issued')::text, '2', 'tenants are notified');

-- idempotent
select t.as_user(t.u('b01'));
create table t.gen_out2 (tenancy_id uuid, unit_number text, invoice_id uuid, total_amount numeric, skipped_reason text);
grant all on t.gen_out2 to public;
insert into t.gen_out2 select * from public.generate_monthly_invoices(t.u('1001'), :'m2');
select t.eq((select count(*) filter (where skipped_reason = 'already invoiced') from t.gen_out2)::text, '2', 're-running skips existing invoices');
select t.as_owner();
select t.eq((select count(*) from public.invoices where billing_period_start = :'m2')::text, '2', 'no duplicate invoices');

-- reading is now locked
select t.as_user(t.u('b01'));
select t.throws(format($q$select public.record_utility_readings(t.u('1001'), %L, '[{"unit_id":"%s","current_reading":200}]')$q$, :'m2', t.u('2001')), 'invoiced month cannot be re-read', '22023', 'nothing was saved');

-- payment: tenant2 pays part of month 2 (charge 1500+400+200 = 2100): partial status flows through
select t.as_owner();
select t.eq((select total_amount::text from public.invoices where tenancy_id = t.u('3002') and billing_period_start = :'m2'), '2100.00', 'A02 invoice: 1500 + 8x50 + 200');
select t.as_user(t.u('b01'));
select t.lives(format($q$select public.record_manual_payment(%L, 500, 'cash')$q$, (select rent_charge_id from public.invoices where tenancy_id = t.u('3002') and billing_period_start = :'m2')), 'landlord records a partial payment');
select t.as_owner();
select t.eq((select status from public.invoice_overview where tenancy_id = t.u('3002') and billing_period_start = :'m2'), 'partial', 'invoice status follows payments (partial)');
-- make A01's month-2 charge overdue (due date passed already for a past month)

-- month 3: previous balance + late penalty (10% of overdue remainder)
select t.as_user(t.u('b01'));
select t.is_true(format($q$select public.record_utility_readings(t.u('1001'), %L,
   '[{"unit_id":"%s","current_reading":120},{"unit_id":"%s","current_reading":62}]') = 2$q$, :'m3', t.u('2001'), t.u('2002')), 'month 3 readings saved');
create table t.gen_out3 (tenancy_id uuid, unit_number text, invoice_id uuid, total_amount numeric, skipped_reason text);
grant all on t.gen_out3 to public;
insert into t.gen_out3 select * from public.generate_monthly_invoices(t.u('1001'), :'m3');
select t.as_owner();
-- A01 unpaid 1800 (overdue) -> penalty 180, previous 1800; this month 1000 + (120-112)*50=400 + 200 + 180 = 1780; total 3580
select t.eq((select late_penalty::text || '/' || previous_balance::text || '/' || total_amount::text
               from public.invoices where tenancy_id = t.u('3001') and billing_period_start = :'m3'), '180.00/1800.00/3580.00', 'penalty on overdue balance, previous balance carried into the total');
select t.eq((select amount::text from public.rent_charges where tenancy_id = t.u('3001') and billing_period_start = :'m3'), '1780.00', 'charge excludes the carried balance (no double counting)');
-- A02 remainder 1600 -> penalty 160
select t.eq((select late_penalty::text || '/' || previous_balance::text from public.invoices where tenancy_id = t.u('3002') and billing_period_start = :'m3'), '160.00/1600.00', 'partial payments reduce the previous balance');

-- missing reading is skipped, not billed as free water
select t.as_user(t.u('b01'));
create table t.gen_out4 (tenancy_id uuid, unit_number text, invoice_id uuid, total_amount numeric, skipped_reason text);
grant all on t.gen_out4 to public;
insert into t.gen_out4 select * from public.generate_monthly_invoices(t.u('1001'), (current_date + interval '1 month')::date);
select t.eq((select count(*) filter (where skipped_reason = 'missing meter reading') from t.gen_out4)::text, '2', 'units without a reading are skipped and reported');

-- authorization / visibility
select t.as_user(t.u('b02'));
select t.throws(format($q$select * from public.generate_monthly_invoices(t.u('1001'), %L)$q$, :'m2'), 'other landlord cannot generate invoices', 'P0002');
select t.eq((select count(*) from public.invoices)::text, '0', 'other landlord cannot see invoices');
select t.as_user(t.u('c01'));
select t.throws(format($q$select * from public.generate_monthly_invoices(t.u('1001'), %L)$q$, :'m2'), 'tenant cannot generate invoices', 'P0002');
select t.eq((select count(distinct tenancy_id) from public.invoices)::text, '1', 'tenant sees only own invoices');
select t.eq((select count(*) from public.invoice_overview)::text, '2', 'tenant invoice overview lists own two invoices');
select t.throws($q$insert into public.invoices (tenancy_id, rent_charge_id, billing_period_start, base_rent, total_amount)
                   values (t.u('3001'), gen_random_uuid(), date '2020-01-01', 1, 1)$q$, 'clients cannot write invoices', '42501');

-- ===== announcements ==================================================================================================
select t.as_user(t.u('c01'));
select t.throws($q$select public.send_announcement(t.u('1001'), 'Hi', 'All')$q$, 'tenant cannot send announcements', 'P0002');
select t.as_user(t.u('b02'));
select t.throws($q$select public.send_announcement(t.u('1001'), 'Hi', 'All')$q$, 'other landlord cannot announce to this property', 'P0002');
select t.as_user(t.u('b01'));
select t.throws($q$select public.send_announcement(t.u('1001'), '', 'x')$q$, 'title required', '22023');
select t.throws($q$select public.send_announcement(t.u('1001'), 'T', 'x', 'everyone')$q$, 'unknown audience rejected', '22023');
select t.throws($q$select public.send_announcement(t.u('1001'), 'T', 'x', 'floor', 'two')$q$, 'floor must be numeric', '22023');
select t.throws($q$select public.send_announcement(t.u('1001'), 'T', 'x', 'floor', '9')$q$, 'empty audience rejected', '22023', 'nothing was sent');
select t.throws(format($q$select public.send_announcement(t.u('1001'), 'T', 'x', 'unit', %L)$q$, t.u('2003')), 'unit from another property rejected', 'P0002');

select public.send_announcement(t.u('1001'), 'Water cut', 'No water tomorrow', 'all') as n_all \gset
select public.send_announcement(t.u('1001'), 'Floor 2 notice', 'Lift service', 'floor', '2') as n_floor \gset
select public.send_announcement(t.u('1001'), 'Unit note', 'Your door', 'unit', t.u('2001')::text) as n_unit \gset
select public.send_announcement(t.u('1001'), 'Rent reminder', 'Please pay', 'unpaid_only') as n_unpaid \gset
select t.as_owner();
select t.eq((select count(*) from public.notice_recipients where notice_id = :'n_all')::text, '2', 'all: every active tenant');
select t.eq((select tenant_id::text from public.notice_recipients where notice_id = :'n_floor'), t.tenant_pid(t.u('c02'))::text, 'floor: only that floor');
select t.eq((select tenant_id::text from public.notice_recipients where notice_id = :'n_unit'), t.tenant_pid(t.u('c01'))::text, 'unit: only that unit');
select t.eq((select count(*) from public.notice_recipients where notice_id = :'n_unpaid')::text, '2', 'unpaid_only: tenants with open charges');
select t.as_user(t.u('c01'));
select t.eq((select count(*) from public.notices)::text, '3', 'tenant 1 sees: all, unit, unpaid (not floor 2)');
select t.eq((select count(*) from public.notifications where type = 'notice')::text, '3', 'and gets in-app notifications');
select t.as_user(t.u('c03'));
select t.eq((select count(*) from public.notices)::text, '0', 'a tenant with no tenancy sees none');

select t.as_owner();
select t.finish();
rollback;
