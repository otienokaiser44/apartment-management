-- 030: tenant onboarding and linking, built on the existing relationship
--   tenant_profile -> tenancy -> unit -> property -> landlord
-- No new occupancy table: `tenancies` stays the only link (and keeps its one-open-tenancy-per-unit guarantees).
--
--   A  bulk roster pre-provisioning   -> create_tenant_invitations_bulk()   (rows in tenant_invitations)
--   B  claim by invite token          -> accept_tenant_invitation()         (already in 027)
--   C  landlord links existing user   -> request_tenant_link / respond_tenant_link (tenant_link_requests)
--   D  tenant requests an apartment   -> submit_unit_link_request()         (rental_applications, approved via 027)

-- ===========================================================================================
-- Schema additions
-- ===========================================================================================

-- Name captured from a landlord roster before the tenant has an account.
alter table public.tenant_invitations add column invitee_name text;

-- Short human-shareable code a tenant types to find a property (scenario D).
alter table public.properties add column property_code text;

create or replace function public.generate_property_code()
returns text
language plpgsql
volatile
security definer -- must see ALL codes, not just the caller's own properties (RLS)
set search_path = ''
as $$
declare
  -- No 0/O/1/I/L: codes are read aloud and typed by hand.
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_code text;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.properties where property_code = v_code);
  end loop;
  return v_code;
end;
$$;

update public.properties set property_code = public.generate_property_code() where property_code is null;
alter table public.properties alter column property_code set not null;
alter table public.properties alter column property_code set default public.generate_property_code();
create unique index properties_property_code_key on public.properties (property_code);

-- The code is assigned once; only an admin may change it.
create or replace function public.lock_property_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.property_code is distinct from old.property_code
     and current_user in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'property code cannot be changed' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger properties_lock_code before update of property_code on public.properties
  for each row execute function public.lock_property_code();

-- Landlord -> existing tenant account: needs the tenant's consent before a tenancy exists.
create table public.tenant_link_requests (
  id           uuid primary key default gen_random_uuid(),
  landlord_id  uuid not null references public.landlord_profiles (id) on delete cascade,
  unit_id      uuid not null references public.units (id) on delete cascade,
  tenant_id    uuid not null references public.tenant_profiles (id) on delete cascade,
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'rejected', 'cancelled', 'expired')),
  expires_at   timestamptz not null,
  responded_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint tenant_link_requests_responded_check
    check ((status in ('accepted', 'rejected')) = (responded_at is not null))
);
create index tenant_link_requests_landlord_idx on public.tenant_link_requests (landlord_id);
create index tenant_link_requests_tenant_idx on public.tenant_link_requests (tenant_id);
create index tenant_link_requests_unit_idx on public.tenant_link_requests (unit_id);
-- A unit has at most one outstanding request.
create unique index tenant_link_requests_one_pending_per_unit_idx
  on public.tenant_link_requests (unit_id) where status = 'pending';

create trigger tenant_link_requests_set_updated_at before update on public.tenant_link_requests
  for each row execute function public.set_updated_at();

-- landlord_id must be the real owner of the unit.
create or replace function public.check_link_request_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_landlord uuid;
begin
  select p.landlord_id into v_landlord
  from public.units u join public.properties p on p.id = u.property_id
  where u.id = new.unit_id;
  if v_landlord is distinct from new.landlord_id then
    raise exception 'link request landlord does not own the unit' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.check_link_request_consistency() from public, anon, authenticated;
create trigger tenant_link_requests_consistency
  before insert or update of unit_id, landlord_id on public.tenant_link_requests
  for each row execute function public.check_link_request_consistency();

-- RLS: read-only for clients. Every change goes through the RPCs below.
alter table public.tenant_link_requests enable row level security;
create policy link_requests_select_landlord on public.tenant_link_requests
  for select to authenticated using (landlord_id = public.my_landlord_profile_id());
create policy link_requests_select_tenant on public.tenant_link_requests
  for select to authenticated using (tenant_id = public.my_tenant_profile_id());
create policy link_requests_select_admin on public.tenant_link_requests
  for select to authenticated using (public.is_admin());
revoke all on public.tenant_link_requests from public, anon;
grant select on public.tenant_link_requests to authenticated;
grant all on public.tenant_link_requests to service_role;

-- ===========================================================================================
-- A. Bulk roster -> invitations (all-or-nothing)
-- ===========================================================================================

-- p_roster: [{"unit_number": "A1", "tenant_name": "Jane Doe", "tenant_email": "...", "tenant_phone": "..."}, ...]
-- Every row is checked first. If ANY row is bad nothing is created and one error lists every problem:
--   errcode 22023, DETAIL = JSON array of {"row": n, "unit_number": "...", "error": "..."}.
-- Returns the RAW tokens once (only hashes are stored) so the server can deliver the claim links.
create or replace function public.create_tenant_invitations_bulk(
  p_property_id uuid,
  p_roster jsonb,
  p_ttl interval default interval '14 days'
)
returns table (unit_id uuid, unit_number text, invitee_name text, invitee_email text, invitee_phone text, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_landlord uuid := public.my_landlord_profile_id();
  v_errors jsonb := '[]'::jsonb;
  v_seen text[] := '{}';
  v_item jsonb;
  v_idx int := 0;
  v_num text;
  v_name text;
  v_email text;
  v_phone text;
  v_unit public.units;
  v_planned jsonb := '[]'::jsonb;
  v_p jsonb;
  v_token text;
  v_inv uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if v_landlord is null then
    raise exception 'only landlords can invite tenants' using errcode = '42501';
  end if;
  if not public.owns_property(p_property_id) then
    raise exception 'property not found' using errcode = 'P0002';
  end if;
  if p_ttl is null or p_ttl <= interval '0' or p_ttl > interval '30 days' then
    raise exception 'invitation lifetime must be between 0 and 30 days' using errcode = '22023';
  end if;
  if p_roster is null or jsonb_typeof(p_roster) <> 'array' or jsonb_array_length(p_roster) = 0 then
    raise exception 'roster must be a non-empty array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_roster) > 500 then
    raise exception 'roster is limited to 500 rows' using errcode = '22023';
  end if;

  -- Lock the property's units so concurrent invitations/approvals cannot interleave with this check.
  perform 1 from public.units where property_id = p_property_id for update;

  for v_item in select * from jsonb_array_elements(p_roster) loop
    v_idx := v_idx + 1;
    v_num := btrim(coalesce(v_item ->> 'unit_number', ''));
    v_name := nullif(btrim(coalesce(v_item ->> 'tenant_name', '')), '');
    v_email := nullif(lower(btrim(coalesce(v_item ->> 'tenant_email', ''))), '');
    v_phone := nullif(btrim(coalesce(v_item ->> 'tenant_phone', '')), '');

    if v_num = '' then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'unit_number', v_num, 'error', 'unit_number is required');
      continue;
    end if;
    if lower(v_num) = any (v_seen) then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'unit_number', v_num, 'error', 'duplicate unit_number in roster');
      continue;
    end if;
    v_seen := v_seen || lower(v_num);

    if v_email is null and v_phone is null then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'unit_number', v_num, 'error', 'tenant_email or tenant_phone is required');
      continue;
    end if;
    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'unit_number', v_num, 'error', 'tenant_email is not a valid email');
      continue;
    end if;

    select * into v_unit from public.units u
     where u.property_id = p_property_id and lower(u.unit_number) = lower(v_num);
    if not found then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'unit_number', v_num, 'error', 'unit not found in this property');
      continue;
    end if;
    if v_unit.status <> 'vacant' then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'unit_number', v_num, 'error', 'unit is not vacant (status: ' || v_unit.status || ')');
      continue;
    end if;
    if exists (select 1 from public.tenancies t where t.unit_id = v_unit.id and t.status in ('pending', 'active')) then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'unit_number', v_num, 'error', 'unit already has an open tenancy');
      continue;
    end if;
    if exists (select 1 from public.tenant_invitations i
                where i.unit_id = v_unit.id and i.status = 'pending' and i.expires_at > now()) then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'unit_number', v_num, 'error', 'unit already has a pending invitation (revoke it first)');
      continue;
    end if;
    if exists (select 1 from public.tenant_link_requests r where r.unit_id = v_unit.id and r.status = 'pending' and r.expires_at > now()) then
      v_errors := v_errors || jsonb_build_object('row', v_idx, 'unit_number', v_num, 'error', 'unit has a pending link request');
      continue;
    end if;

    v_planned := v_planned || jsonb_build_object(
      'unit_id', v_unit.id, 'unit_number', v_unit.unit_number, 'name', v_name, 'email', v_email, 'phone', v_phone);
  end loop;

  if jsonb_array_length(v_errors) > 0 then
    raise exception 'roster has % invalid row(s); nothing was created', jsonb_array_length(v_errors)
      using errcode = '22023', detail = v_errors::text;
  end if;

  for v_p in select * from jsonb_array_elements(v_planned) loop
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into public.tenant_invitations
      (landlord_id, property_id, unit_id, invitee_name, invitee_email, invitee_phone, token_hash, expires_at)
    values
      (v_landlord, p_property_id, (v_p ->> 'unit_id')::uuid, v_p ->> 'name', v_p ->> 'email', v_p ->> 'phone',
       encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), now() + p_ttl)
    returning id into v_inv;

    perform public.write_audit_log('invitation_created', 'tenant_invitation', v_inv, null,
      jsonb_build_object('unit_id', v_p ->> 'unit_id'), jsonb_build_object('source', 'bulk_roster'));

    unit_id := (v_p ->> 'unit_id')::uuid;
    unit_number := v_p ->> 'unit_number';
    invitee_name := v_p ->> 'name';
    invitee_email := v_p ->> 'email';
    invitee_phone := v_p ->> 'phone';
    token := v_token;
    return next;
  end loop;
end;
$$;

-- ===========================================================================================
-- C. Landlord links an existing tenant account (tenant must accept)
-- ===========================================================================================

create or replace function public.request_tenant_link(
  p_unit_id uuid,
  p_email text default null,
  p_phone text default null,
  p_ttl interval default interval '7 days'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_landlord uuid := public.my_landlord_profile_id();
  v_unit public.units;
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_tenant uuid;
  v_tenant_user uuid;
  v_landlord_name text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if v_landlord is null then
    raise exception 'only landlords can link tenants' using errcode = '42501';
  end if;
  if v_email is null and v_digits = '' then
    raise exception 'an email or phone number is required' using errcode = '22023';
  end if;
  if p_ttl is null or p_ttl <= interval '0' or p_ttl > interval '30 days' then
    raise exception 'request lifetime must be between 0 and 30 days' using errcode = '22023';
  end if;

  select * into v_unit from public.units where id = p_unit_id for update;
  if not found or not public.owns_property(v_unit.property_id) then
    raise exception 'unit not found' using errcode = 'P0002';
  end if;
  if v_unit.status <> 'vacant' then
    raise exception 'unit is not vacant (status: %)', v_unit.status using errcode = '22023';
  end if;
  if exists (select 1 from public.tenancies t where t.unit_id = v_unit.id and t.status in ('pending', 'active')) then
    raise exception 'unit already has an open tenancy' using errcode = '23505';
  end if;
  if exists (select 1 from public.tenant_link_requests r
              where r.unit_id = v_unit.id and r.status = 'pending' and r.expires_at > now()) then
    raise exception 'unit already has a pending link request' using errcode = '23505';
  end if;
  -- An expired pending request no longer blocks the unit.
  update public.tenant_link_requests set status = 'expired'
   where unit_id = v_unit.id and status = 'pending' and expires_at <= now();

  select tp.id, tp.user_id into v_tenant, v_tenant_user
  from public.profiles p
  join public.tenant_profiles tp on tp.user_id = p.id
  where p.role = 'tenant' and p.status = 'active'
    and ((v_email is not null and lower(p.email) = v_email)
      or (v_digits <> '' and regexp_replace(coalesce(p.phone, ''), '\D', '', 'g') = v_digits))
  limit 1;
  if v_tenant is null then
    raise exception 'no tenant account matches those details; send an invitation instead' using errcode = 'P0002';
  end if;

  insert into public.tenant_link_requests (landlord_id, unit_id, tenant_id, expires_at)
  values (v_landlord, v_unit.id, v_tenant, now() + p_ttl)
  returning id into v_id;

  select coalesce(p.full_name, 'Your landlord') into v_landlord_name from public.profiles p where p.id = v_uid;
  perform public.notify_user(v_tenant_user, 'link_request_received', 'Unit link request',
    v_landlord_name || ' wants to link you to unit ' || v_unit.unit_number || '. Accept or reject it from your dashboard.',
    jsonb_build_object('link_request_id', v_id, 'unit_id', v_unit.id));
  perform public.write_audit_log('link_request_created', 'tenant_link_request', v_id, null,
    jsonb_build_object('unit_id', v_unit.id, 'tenant_id', v_tenant), '{}'::jsonb);
  return v_id;
end;
$$;

-- Tenant answers. Accept -> ACTIVE tenancy + OCCUPIED unit (returns the tenancy id). Reject -> returns null.
create or replace function public.respond_tenant_link(p_request_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid := public.my_tenant_profile_id();
  v_req public.tenant_link_requests;
  v_unit public.units;
  v_tenancy uuid;
  v_landlord_user uuid;
  v_name text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if v_tenant is null then
    raise exception 'only tenant accounts can respond to link requests' using errcode = '42501';
  end if;
  if p_accept is null then
    raise exception 'accept or reject is required' using errcode = '22023';
  end if;

  select * into v_req from public.tenant_link_requests where id = p_request_id and tenant_id = v_tenant for update;
  -- Same message for "missing" and "someone else's".
  if not found then
    raise exception 'link request not found' using errcode = 'P0002';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'this request was already %', v_req.status using errcode = '22023';
  end if;
  if v_req.expires_at <= now() then
    update public.tenant_link_requests set status = 'expired' where id = v_req.id;
    raise exception 'this request has expired' using errcode = '22023';
  end if;

  select lp.user_id into v_landlord_user from public.landlord_profiles lp where lp.id = v_req.landlord_id;
  select coalesce(p.full_name, 'The tenant') into v_name from public.profiles p where p.id = v_uid;

  if not p_accept then
    update public.tenant_link_requests set status = 'rejected', responded_at = now() where id = v_req.id;
    perform public.notify_user(v_landlord_user, 'link_request_rejected', 'Link request declined',
      v_name || ' declined the link request.', jsonb_build_object('link_request_id', v_req.id, 'unit_id', v_req.unit_id));
    perform public.write_audit_log('link_request_rejected', 'tenant_link_request', v_req.id,
      jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'rejected'), '{}'::jsonb);
    return null;
  end if;

  select * into v_unit from public.units where id = v_req.unit_id for update;
  if v_unit.status <> 'vacant' then
    raise exception 'unit is no longer available' using errcode = '22023';
  end if;
  if exists (select 1 from public.tenancies t where t.unit_id = v_unit.id and t.status in ('pending', 'active')) then
    raise exception 'unit already has an open tenancy' using errcode = '23505';
  end if;

  insert into public.tenancies
    (tenant_id, unit_id, landlord_id, start_date, monthly_rent, security_deposit, currency, status)
  values
    (v_tenant, v_unit.id, v_req.landlord_id, current_date,
     v_unit.monthly_rent, v_unit.security_deposit, v_unit.currency, 'active')
  returning id into v_tenancy;

  update public.units set status = 'occupied' where id = v_unit.id;
  update public.tenant_link_requests set status = 'accepted', responded_at = now() where id = v_req.id;
  -- Anything else outstanding for this unit is now moot.
  update public.tenant_invitations set status = 'revoked' where unit_id = v_unit.id and status = 'pending';

  perform public.notify_user(v_uid, 'tenancy_started', 'Your tenancy has started',
    'You are now the tenant of unit ' || v_unit.unit_number || '.',
    jsonb_build_object('tenancy_id', v_tenancy, 'unit_id', v_unit.id));
  perform public.notify_user(v_landlord_user, 'link_request_accepted', 'Link request accepted',
    v_name || ' accepted and is now the tenant of unit ' || v_unit.unit_number || '.',
    jsonb_build_object('tenancy_id', v_tenancy, 'link_request_id', v_req.id));
  perform public.write_audit_log('link_request_accepted', 'tenant_link_request', v_req.id,
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'accepted'),
    jsonb_build_object('tenancy_id', v_tenancy));
  perform public.write_audit_log('tenancy_created', 'tenancy', v_tenancy, null,
    jsonb_build_object('status', 'active', 'unit_id', v_unit.id, 'tenant_id', v_tenant),
    jsonb_build_object('source', 'link_request'));
  return v_tenancy;
end;
$$;

create or replace function public.cancel_tenant_link_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.tenant_link_requests;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select * into v_req from public.tenant_link_requests
   where id = p_request_id and landlord_id = public.my_landlord_profile_id() for update;
  if not found then
    raise exception 'link request not found' using errcode = 'P0002';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'only pending requests can be cancelled' using errcode = '22023';
  end if;
  update public.tenant_link_requests set status = 'cancelled' where id = v_req.id;
  perform public.write_audit_log('link_request_cancelled', 'tenant_link_request', v_req.id,
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'cancelled'), '{}'::jsonb);
end;
$$;

-- ===========================================================================================
-- D. Tenant asks to be linked to a unit by property code + unit number
-- ===========================================================================================

-- Creates a normal rental application; the landlord decides with approve_rental_application /
-- reject_rental_application (027). Unknown code, unit and suspended property all give one generic error so
-- codes cannot be probed for what exists.
create or replace function public.submit_unit_link_request(
  p_property_code text,
  p_unit_number text,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid := public.my_tenant_profile_id();
  v_unit public.units;
  v_landlord_user uuid;
  v_name text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if v_tenant is null then
    raise exception 'only tenant accounts can request a unit' using errcode = '42501';
  end if;
  if p_message is not null and length(p_message) > 1000 then
    raise exception 'message is too long' using errcode = '22023';
  end if;

  select u.* into v_unit
  from public.properties pr
  join public.units u on u.property_id = pr.id
  where pr.property_code = upper(btrim(coalesce(p_property_code, '')))
    and lower(u.unit_number) = lower(btrim(coalesce(p_unit_number, '')))
    and pr.status not in ('suspended', 'archived')
  for update of u;
  if not found then
    raise exception 'property or unit not found' using errcode = 'P0002';
  end if;
  if v_unit.status <> 'vacant'
     or exists (select 1 from public.tenancies t where t.unit_id = v_unit.id and t.status in ('pending', 'active')) then
    raise exception 'that unit is not available' using errcode = '22023';
  end if;
  if exists (select 1 from public.rental_applications a
              where a.tenant_id = v_tenant and a.unit_id = v_unit.id and a.status = 'pending') then
    raise exception 'you already have a pending request for this unit' using errcode = '23505';
  end if;

  insert into public.rental_applications (tenant_id, unit_id, message)
  values (v_tenant, v_unit.id, nullif(btrim(coalesce(p_message, '')), ''))
  returning id into v_id;

  select lp.user_id into v_landlord_user
  from public.properties pr join public.landlord_profiles lp on lp.id = pr.landlord_id
  where pr.id = v_unit.property_id;
  select coalesce(p.full_name, 'A tenant') into v_name from public.profiles p where p.id = v_uid;
  perform public.notify_user(v_landlord_user, 'unit_link_requested', 'New unit request',
    v_name || ' requested to be linked to unit ' || v_unit.unit_number || '.',
    jsonb_build_object('application_id', v_id, 'unit_id', v_unit.id));
  perform public.write_audit_log('application_created', 'rental_application', v_id, null,
    jsonb_build_object('unit_id', v_unit.id, 'tenant_id', v_tenant), jsonb_build_object('source', 'property_code'));
  return v_id;
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
    'create_tenant_invitations_bulk(uuid, jsonb, interval)',
    'request_tenant_link(uuid, text, text, interval)',
    'respond_tenant_link(uuid, boolean)',
    'cancel_tenant_link_request(uuid)',
    'submit_unit_link_request(text, text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- Column default: runs with the inserting landlord's privileges, so authenticated needs EXECUTE.
revoke all on function public.generate_property_code() from public, anon;
grant execute on function public.generate_property_code() to authenticated, service_role;
revoke all on function public.lock_property_code() from public, anon, authenticated;
