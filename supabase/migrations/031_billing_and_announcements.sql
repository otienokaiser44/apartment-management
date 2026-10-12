-- 031: monthly billing engine (settings, meter readings, invoices) and targeted announcements.
-- Built on the existing money model: an invoice is the BREAKDOWN of one rent_charge, so payments, the
-- paid/partially_paid derivation (028) and tenant/landlord RLS (023) keep working unchanged.
--
--   rent_charges.amount  = this period's charges  = base_rent + water_bill + garbage_fee + late_penalty
--   invoices.total_amount = amount due now        = rent_charges.amount + previous_balance (carried over, informational)
-- Previous balances stay open on their own (older) charges, so a payment is never counted twice.

-- ===========================================================================================
-- Property billing settings
-- ===========================================================================================
create table public.property_settings (
  property_id             uuid primary key references public.properties (id) on delete cascade,
  default_garbage_fee     numeric(12, 2) not null default 0 check (default_garbage_fee >= 0),
  water_rate_per_unit     numeric(12, 4) not null default 0 check (water_rate_per_unit >= 0),
  late_penalty_percentage numeric(5, 2)  not null default 0 check (late_penalty_percentage between 0 and 100),
  -- Day of the month rent is due; the late penalty applies to balances still unpaid after their due date.
  rent_due_day            integer        not null default 5 check (rent_due_day between 1 and 28),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create trigger property_settings_set_updated_at before update on public.property_settings
  for each row execute function public.set_updated_at();

insert into public.property_settings (property_id) select id from public.properties on conflict do nothing;

create or replace function public.create_property_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.property_settings (property_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.create_property_settings() from public, anon, authenticated;
create trigger properties_create_settings after insert on public.properties
  for each row execute function public.create_property_settings();

alter table public.property_settings enable row level security;
create policy property_settings_select_owner on public.property_settings
  for select to authenticated using (public.owns_property(property_id) or public.is_admin());
create policy property_settings_update_owner on public.property_settings
  for update to authenticated
  using (public.owns_property(property_id)) with check (public.owns_property(property_id));
revoke all on public.property_settings from public, anon;
grant select, update on public.property_settings to authenticated;
grant all on public.property_settings to service_role;
-- Only the billing columns are editable; the key cannot be repointed.
revoke update on public.property_settings from authenticated;
grant update (default_garbage_fee, water_rate_per_unit, late_penalty_percentage, rent_due_day)
  on public.property_settings to authenticated;

-- ===========================================================================================
-- Utility (water) meter readings
-- ===========================================================================================
create table public.utility_readings (
  id               uuid primary key default gen_random_uuid(),
  unit_id          uuid not null references public.units (id) on delete cascade,
  period_start     date not null check (period_start = date_trunc('month', period_start)::date),
  previous_reading numeric(12, 3) not null check (previous_reading >= 0),
  current_reading  numeric(12, 3) not null,
  units_consumed   numeric(12, 3) not null check (units_consumed >= 0),
  rate_per_unit    numeric(12, 4) not null check (rate_per_unit >= 0),   -- snapshot at recording time
  water_amount     numeric(12, 2) not null check (water_amount >= 0),    -- units_consumed * rate_per_unit
  recorded_by      uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint utility_readings_math_check check (current_reading = previous_reading + units_consumed),
  constraint utility_readings_unit_period_key unique (unit_id, period_start)
);
create index utility_readings_unit_idx on public.utility_readings (unit_id, period_start desc);
create trigger utility_readings_set_updated_at before update on public.utility_readings
  for each row execute function public.set_updated_at();

alter table public.utility_readings enable row level security;
create policy utility_readings_select_owner on public.utility_readings
  for select to authenticated using (public.owns_unit(unit_id) or public.is_admin());
create policy utility_readings_select_tenant on public.utility_readings
  for select to authenticated using (public.is_tenant_of_unit(unit_id));
revoke all on public.utility_readings from public, anon;
grant select on public.utility_readings to authenticated;
grant all on public.utility_readings to service_role;

-- ===========================================================================================
-- Invoices (breakdown of a rent_charge)
-- ===========================================================================================
create table public.invoices (
  id                   uuid primary key default gen_random_uuid(),
  tenancy_id           uuid not null references public.tenancies (id) on delete restrict,
  rent_charge_id       uuid not null unique references public.rent_charges (id) on delete restrict,
  utility_reading_id   uuid references public.utility_readings (id) on delete set null,
  billing_period_start date not null,
  base_rent            numeric(12, 2) not null check (base_rent >= 0),
  water_bill           numeric(12, 2) not null default 0 check (water_bill >= 0),
  garbage_fee          numeric(12, 2) not null default 0 check (garbage_fee >= 0),
  late_penalty         numeric(12, 2) not null default 0 check (late_penalty >= 0),
  previous_balance     numeric(12, 2) not null default 0 check (previous_balance >= 0),
  total_amount         numeric(12, 2) not null,
  generated_by         uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  constraint invoices_total_check
    check (total_amount = base_rent + water_bill + garbage_fee + late_penalty + previous_balance),
  constraint invoices_one_per_period_key unique (tenancy_id, billing_period_start)
);
create index invoices_tenancy_idx on public.invoices (tenancy_id, billing_period_start desc);

alter table public.invoices enable row level security;
create policy invoices_select_tenant on public.invoices
  for select to authenticated using (public.is_tenant_of_tenancy(tenancy_id));
create policy invoices_select_landlord on public.invoices
  for select to authenticated using (public.owns_tenancy(tenancy_id));
create policy invoices_select_admin on public.invoices
  for select to authenticated using (public.is_admin());
revoke all on public.invoices from public, anon;
grant select on public.invoices to authenticated;
grant all on public.invoices to service_role;

-- Payment status of an invoice comes from its charge (which payments keep in sync):
-- unpaid | partial | paid. security_invoker keeps the caller's RLS on both tables.
create view public.invoice_overview with (security_invoker = true) as
select
  i.id as invoice_id, i.tenancy_id, i.rent_charge_id, i.billing_period_start,
  i.base_rent, i.water_bill, i.garbage_fee, i.late_penalty, i.previous_balance, i.total_amount,
  c.due_date, c.currency,
  case c.status
    when 'paid' then 'paid'
    when 'partially_paid' then 'partial'
    when 'cancelled' then 'cancelled'
    else 'unpaid'
  end as status,
  te.unit_id, u.unit_number, u.property_id,
  i.created_at
from public.invoices i
join public.rent_charges c on c.id = i.rent_charge_id
join public.tenancies te on te.id = i.tenancy_id
join public.units u on u.id = te.unit_id;
revoke all on public.invoice_overview from public, anon;
grant select on public.invoice_overview to authenticated, service_role;

-- ===========================================================================================
-- Meter readings: record a month for many units, all-or-nothing
-- ===========================================================================================
-- p_readings: [{"unit_id": "...", "current_reading": 123.4} | {"unit_id": "...", "units_consumed": 7}, ...]
-- The water bill is computed here (units_consumed * the property's rate at this moment), never by the client.
-- A unit's first reading is its BASELINE (consumption 0) unless units_consumed is given.
-- Bad rows -> nothing saved; errcode 22023 with DETAIL = JSON array of {row, unit_id, error}.
create or replace function public.record_utility_readings(p_property_id uuid, p_period date, p_readings jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period date := date_trunc('month', p_period)::date;
  v_rate numeric(12, 4);
  v_errors jsonb := '[]'::jsonb;
  v_idx int := 0;
  v_item jsonb;
  v_unit_id uuid;
  v_cur numeric;
  v_cons numeric;
  v_prev numeric;
  v_new_cur numeric;
  v_new_cons numeric;
  v_planned jsonb := '[]'::jsonb;
  v_p jsonb;
  v_seen uuid[] := '{}';
  v_count int := 0;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_period is null or v_period > date_trunc('month', current_date)::date then
    raise exception 'readings can only be recorded for the current or a past month' using errcode = '22023';
  end if;
  if not (public.is_admin() or public.owns_property(p_property_id)) then
    raise exception 'property not found' using errcode = 'P0002';
  end if;
  if p_readings is null or jsonb_typeof(p_readings) <> 'array' or jsonb_array_length(p_readings) = 0 then
    raise exception 'readings must be a non-empty array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_readings) > 500 then
    raise exception 'at most 500 readings per submission' using errcode = '22023';
  end if;

  select water_rate_per_unit into v_rate from public.property_settings where property_id = p_property_id;
  v_rate := coalesce(v_rate, 0);

  for v_item in select * from jsonb_array_elements(p_readings) loop
    v_idx := v_idx + 1;
    begin
      v_unit_id := (v_item ->> 'unit_id')::uuid;
      v_cur := nullif(v_item ->> 'current_reading', '')::numeric;
      v_cons := nullif(v_item ->> 'units_consumed', '')::numeric;
    exception when others then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'unit_id', v_item ->> 'unit_id', 'error', 'unit_id or a reading is not valid');
      continue;
    end;

    if not exists (select 1 from public.units u where u.id = v_unit_id and u.property_id = p_property_id) then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'unit_id', v_unit_id, 'error', 'unit not found in this property');
      continue;
    end if;
    if v_unit_id = any (v_seen) then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'unit_id', v_unit_id, 'error', 'duplicate unit in submission');
      continue;
    end if;
    v_seen := v_seen || v_unit_id;
    if (v_cur is null) = (v_cons is null) then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'unit_id', v_unit_id, 'error', 'give either current_reading or units_consumed');
      continue;
    end if;
    if coalesce(v_cur, v_cons) < 0 then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'unit_id', v_unit_id, 'error', 'readings cannot be negative');
      continue;
    end if;
    if exists (
      select 1 from public.invoices i join public.tenancies te on te.id = i.tenancy_id
       where te.unit_id = v_unit_id and i.billing_period_start = v_period
    ) then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'unit_id', v_unit_id, 'error', 'this month is already invoiced for the unit');
      continue;
    end if;
    if exists (select 1 from public.utility_readings r where r.unit_id = v_unit_id and r.period_start > v_period) then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'unit_id', v_unit_id, 'error', 'a later month already has a reading; earlier months are locked');
      continue;
    end if;

    -- Baseline = the latest earlier reading's current value.
    select r.current_reading into v_prev from public.utility_readings r
     where r.unit_id = v_unit_id and r.period_start < v_period
     order by r.period_start desc limit 1;

    if v_cur is not null then
      if v_prev is null then
        v_prev := v_cur;           -- first ever reading: baseline, nothing to bill yet
        v_new_cons := 0;
      elsif v_cur < v_prev then
        v_errors := v_errors || jsonb_build_object('row', v_idx, 'unit_id', v_unit_id,
          'error', format('current reading %s is below the previous reading %s', v_cur, v_prev));
        continue;
      else
        v_new_cons := v_cur - v_prev;
      end if;
      v_new_cur := v_cur;
    else
      v_prev := coalesce(v_prev, 0);
      v_new_cons := v_cons;
      v_new_cur := v_prev + v_cons;
    end if;

    v_planned := v_planned || jsonb_build_object('unit_id', v_unit_id, 'prev', v_prev, 'cur', v_new_cur, 'cons', v_new_cons);
  end loop;

  if jsonb_array_length(v_errors) > 0 then
    raise exception 'readings have % invalid row(s); nothing was saved', jsonb_array_length(v_errors)
      using errcode = '22023', detail = v_errors::text;
  end if;

  for v_p in select * from jsonb_array_elements(v_planned) loop
    insert into public.utility_readings
      (unit_id, period_start, previous_reading, current_reading, units_consumed, rate_per_unit, water_amount, recorded_by)
    values
      ((v_p ->> 'unit_id')::uuid, v_period, (v_p ->> 'prev')::numeric, (v_p ->> 'cur')::numeric,
       (v_p ->> 'cons')::numeric, v_rate, round((v_p ->> 'cons')::numeric * v_rate, 2), auth.uid())
    on conflict (unit_id, period_start) do update
      set previous_reading = excluded.previous_reading, current_reading = excluded.current_reading,
          units_consumed = excluded.units_consumed, rate_per_unit = excluded.rate_per_unit,
          water_amount = excluded.water_amount, recorded_by = excluded.recorded_by;
    v_count := v_count + 1;
  end loop;

  perform public.write_audit_log('utility_readings_recorded', 'property', p_property_id, null, null,
    jsonb_build_object('period', v_period, 'readings', v_count));
  return v_count;
end;
$$;

-- ===========================================================================================
-- Monthly invoice generation
-- ===========================================================================================
-- One consolidated invoice per ACTIVE tenancy in the property for p_period:
--   rent (tenancy rent) + water (this month's reading) + garbage (property default) + late penalty
--   (late_penalty_percentage of balances left on OLDER charges that are already past due) + previous balance.
-- Idempotent: tenancies that already have an invoice or charge for the period are skipped, not duplicated.
-- With p_require_readings, a tenancy whose unit has no reading (while a water rate is set) is skipped and
-- reported instead of being billed zero water.
create or replace function public.generate_monthly_invoices(
  p_property_id uuid,
  p_period date,
  p_require_readings boolean default true
)
returns table (tenancy_id uuid, unit_number text, invoice_id uuid, total_amount numeric, skipped_reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_period date := date_trunc('month', p_period)::date;
  v_set public.property_settings;
  v_t record;
  v_reading public.utility_readings;
  v_water numeric(12, 2);
  v_prev numeric(12, 2);
  v_overdue numeric(12, 2);
  v_penalty numeric(12, 2);
  v_charge numeric(12, 2);
  v_charge_id uuid;
  v_invoice_id uuid;
  v_tenant_user uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_period is null or v_period > date_trunc('month', current_date + interval '1 month')::date then
    raise exception 'invoices can be generated up to next month at most' using errcode = '22023';
  end if;
  if not (public.is_admin() or public.owns_property(p_property_id)) then
    raise exception 'property not found' using errcode = 'P0002';
  end if;

  select * into v_set from public.property_settings where property_id = p_property_id;
  if not found then
    raise exception 'property settings are missing' using errcode = 'P0002';
  end if;

  for v_t in
    select te.id, te.monthly_rent, te.currency, te.tenant_id, te.start_date, u.id as unit_id, u.unit_number
    from public.tenancies te
    join public.units u on u.id = te.unit_id
    where u.property_id = p_property_id and te.status = 'active'
      and te.start_date < (v_period + interval '1 month')::date
    order by u.unit_number
    for update of te
  loop
    tenancy_id := v_t.id;
    unit_number := v_t.unit_number;
    invoice_id := null;
    total_amount := null;
    skipped_reason := null;

    if exists (select 1 from public.invoices i where i.tenancy_id = v_t.id and i.billing_period_start = v_period)
       or exists (select 1 from public.rent_charges c
                   where c.tenancy_id = v_t.id and c.billing_period_start = v_period and c.status <> 'cancelled') then
      skipped_reason := 'already invoiced';
      return next;
      continue;
    end if;

    select * into v_reading from public.utility_readings r where r.unit_id = v_t.unit_id and r.period_start = v_period;
    if not found and v_set.water_rate_per_unit > 0 and p_require_readings then
      skipped_reason := 'missing meter reading';
      return next;
      continue;
    end if;
    v_water := coalesce(v_reading.water_amount, 0);

    -- Unpaid remainder of older charges (amount minus successful payments).
    select coalesce(sum(greatest(c.amount - coalesce(p.paid, 0), 0)), 0),
           coalesce(sum(greatest(c.amount - coalesce(p.paid, 0), 0)) filter (where c.due_date < current_date), 0)
      into v_prev, v_overdue
    from public.rent_charges c
    left join lateral (
      select sum(pay.amount) as paid from public.payments pay
       where pay.rent_charge_id = c.id and pay.status = 'successful'
    ) p on true
    where c.tenancy_id = v_t.id and c.billing_period_start < v_period
      and c.status in ('pending', 'partially_paid', 'overdue');

    v_penalty := round(v_overdue * v_set.late_penalty_percentage / 100, 2);
    v_charge := v_t.monthly_rent + v_water + v_set.default_garbage_fee + v_penalty;

    insert into public.rent_charges
      (tenancy_id, billing_period_start, billing_period_end, due_date, amount, currency)
    values
      (v_t.id, v_period, (v_period + interval '1 month')::date - 1,
       v_period + (v_set.rent_due_day - 1), v_charge, v_t.currency)
    returning id into v_charge_id;

    insert into public.invoices
      (tenancy_id, rent_charge_id, utility_reading_id, billing_period_start,
       base_rent, water_bill, garbage_fee, late_penalty, previous_balance, total_amount, generated_by)
    values
      (v_t.id, v_charge_id, v_reading.id, v_period,
       v_t.monthly_rent, v_water, v_set.default_garbage_fee, v_penalty, v_prev, v_charge + v_prev, v_uid)
    returning id into v_invoice_id;

    select tp.user_id into v_tenant_user from public.tenant_profiles tp where tp.id = v_t.tenant_id;
    perform public.notify_user(v_tenant_user, 'invoice_issued', 'New invoice',
      'Your invoice for ' || to_char(v_period, 'FMMonth YYYY') || ' for unit ' || v_t.unit_number
        || ' is ' || v_t.currency || ' ' || (v_charge + v_prev) || '.',
      jsonb_build_object('invoice_id', v_invoice_id, 'tenancy_id', v_t.id));

    invoice_id := v_invoice_id;
    total_amount := v_charge + v_prev;
    return next;
  end loop;

  perform public.write_audit_log('invoices_generated', 'property', p_property_id, null, null,
    jsonb_build_object('period', v_period));
end;
$$;

-- ===========================================================================================
-- Targeted announcements (extends notices)
-- ===========================================================================================
alter table public.notices add column target_audience text not null default 'all'
  check (target_audience in ('all', 'floor', 'unit', 'unpaid_only'));
alter table public.notices add column target_value text;

-- Audience: all (every active tenant in the property), floor (target_value = floor number),
-- unit (target_value = unit id), unpaid_only (tenants with an open charge). Recipients are materialised at send
-- time into notice_recipients and each gets an in-app notification, so it shows on their dashboard immediately.
create or replace function public.send_announcement(
  p_property_id uuid,
  p_title text,
  p_message text,
  p_audience text default 'all',
  p_value text default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_notice uuid;
  v_floor integer;
  v_unit uuid;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not (public.is_admin() or public.owns_property(p_property_id)) then
    raise exception 'property not found' using errcode = 'P0002';
  end if;
  if p_title is null or btrim(p_title) = '' or p_message is null or btrim(p_message) = '' then
    raise exception 'title and message are required' using errcode = '22023';
  end if;
  if length(p_title) > 150 or length(p_message) > 5000 then
    raise exception 'title or message is too long' using errcode = '22023';
  end if;
  if p_audience not in ('all', 'floor', 'unit', 'unpaid_only') then
    raise exception 'unknown audience' using errcode = '22023';
  end if;

  if p_audience = 'floor' then
    begin
      v_floor := p_value::integer;
    exception when others then
      raise exception 'floor must be a whole number' using errcode = '22023';
    end;
  elsif p_audience = 'unit' then
    begin
      v_unit := p_value::uuid;
    exception when others then
      raise exception 'choose a unit' using errcode = '22023';
    end;
    if not exists (select 1 from public.units u where u.id = v_unit and u.property_id = p_property_id) then
      raise exception 'unit not found in this property' using errcode = 'P0002';
    end if;
  end if;

  insert into public.notices (created_by, property_id, unit_id, title, body, expires_at, target_audience, target_value)
  values (v_uid, p_property_id, v_unit, btrim(p_title), p_message, p_expires_at, p_audience,
          case when p_audience in ('floor', 'unit') then p_value end)
  returning id into v_notice;

  insert into public.notice_recipients (notice_id, tenant_id)
  select distinct v_notice, te.tenant_id
  from public.tenancies te
  join public.units u on u.id = te.unit_id
  where te.status = 'active' and u.property_id = p_property_id
    and case p_audience
      when 'floor' then u.floor_number = v_floor
      when 'unit' then u.id = v_unit
      when 'unpaid_only' then exists (
        select 1 from public.rent_charges c
         where c.tenancy_id = te.id and c.status in ('pending', 'partially_paid', 'overdue'))
      else true
    end;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'no tenants match that audience; nothing was sent' using errcode = '22023';
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  select tp.user_id, 'notice', btrim(p_title), left(p_message, 200), jsonb_build_object('notice_id', v_notice)
  from public.notice_recipients r join public.tenant_profiles tp on tp.id = r.tenant_id
  where r.notice_id = v_notice;

  perform public.write_audit_log('notice_sent', 'notice', v_notice, null, null,
    jsonb_build_object('recipients', v_count, 'audience', p_audience));
  return v_notice;
end;
$$;

-- ===========================================================================================
-- Privileges
-- ===========================================================================================
do $$
declare
  f text;
begin
  foreach f in array array[
    'record_utility_readings(uuid, date, jsonb)',
    'generate_monthly_invoices(uuid, date, boolean)',
    'send_announcement(uuid, text, text, text, text, timestamptz)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
