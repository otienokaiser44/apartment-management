-- 033: delegated property access for property managers and caretakers.
--
-- Model: the OWNER is whoever properties.landlord_id points at. A MANAGER account (profiles.role = 'manager') gets access to
-- specific properties through `property_staff` rows, created only by accepting an owner's invitation.
--
--   Property Manager  everything the owner can do for operations on that property: units, tenants, requests, invoices,
--                     meter readings, payments, announcements. NOT: editing the property profile, billing settings,
--                     verification (and its documents), deleting the property, or managing staff.
--   Caretaker         read-only: the property and its units.
--
-- Implementation: owns_property / owns_unit / owns_tenancy (used by ~45 policies and RPCs) now mean "owner OR property
-- manager". The strict check is is_property_owner(), used wherever a manager must be excluded.

-- ===========================================================================================
-- Signup: allow the manager account type (inert until an invitation is accepted)
-- ===========================================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
begin
  v_role := case new.raw_user_meta_data ->> 'role'
    when 'landlord' then 'landlord'::public.user_role
    when 'manager' then 'manager'::public.user_role
    else 'tenant'::public.user_role
  end;

  insert into public.profiles (id, full_name, email, phone, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    coalesce(nullif(new.phone, ''), nullif(new.raw_user_meta_data ->> 'phone', '')),
    v_role
  );

  if v_role = 'landlord' then
    insert into public.landlord_profiles (user_id) values (new.id);
  elsif v_role = 'tenant' then
    insert into public.tenant_profiles (user_id) values (new.id);
  end if;

  return new;
end;
$$;

-- ===========================================================================================
-- Tables
-- ===========================================================================================
create table public.property_staff (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null check (role in ('property_manager', 'caretaker')),
  status      text not null default 'active' check (status in ('active', 'removed')),
  invited_by  uuid references public.profiles (id) on delete set null,
  removed_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint property_staff_removed_check check ((status = 'removed') = (removed_at is not null))
);
create unique index property_staff_one_active_idx on public.property_staff (property_id, user_id) where status = 'active';
create index property_staff_user_idx on public.property_staff (user_id) where status = 'active';
create trigger property_staff_set_updated_at before update on public.property_staff
  for each row execute function public.set_updated_at();

-- Only a hash of the token is stored. One invitation can cover several of the owner's properties.
create table public.staff_invitations (
  id             uuid primary key default gen_random_uuid(),
  landlord_id    uuid not null references public.landlord_profiles (id) on delete cascade,
  invitee_email  text not null check (invitee_email = lower(btrim(invitee_email)) and length(invitee_email) between 3 and 254),
  role           text not null check (role in ('property_manager', 'caretaker')),
  property_ids   uuid[] not null check (cardinality(property_ids) between 1 and 50),
  token_hash     text not null unique,
  status         text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at     timestamptz not null,
  accepted_by    uuid references public.profiles (id) on delete set null,
  accepted_at    timestamptz,
  created_at     timestamptz not null default now(),
  constraint staff_invitations_accept_check check ((status = 'accepted') = (accepted_at is not null))
);
create index staff_invitations_landlord_idx on public.staff_invitations (landlord_id);
create index staff_invitations_email_idx on public.staff_invitations (invitee_email);

-- Every property in the invitation must belong to the inviting landlord.
create or replace function public.check_staff_invitation_properties()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.properties p
       where p.id = any (new.property_ids) and p.landlord_id = new.landlord_id)
     <> (select count(distinct x) from unnest(new.property_ids) as x) then
    raise exception 'invitation includes a property the landlord does not own' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.check_staff_invitation_properties() from public, anon, authenticated;
create trigger staff_invitations_properties_check
  before insert or update of property_ids, landlord_id on public.staff_invitations
  for each row execute function public.check_staff_invitation_properties();

-- ===========================================================================================
-- Access helpers
-- ===========================================================================================
create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'manager' and p.status = 'active')
$$;

-- Strict owner check (the previous owns_property). Use where a manager must be excluded.
create or replace function public.is_property_owner(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.properties pr
    join public.landlord_profiles lp on lp.id = pr.landlord_id
    join public.profiles p on p.id = lp.user_id
    where pr.id = p_property_id and lp.user_id = auth.uid() and p.status = 'active'
  )
$$;

create or replace function public.is_property_staff(p_property_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.property_staff s
    join public.profiles p on p.id = s.user_id
    where s.property_id = p_property_id and s.user_id = auth.uid()
      and s.status = 'active' and s.role = any (p_roles)
      and p.status = 'active' and p.role = 'manager'
  )
$$;

-- "May operate this property": the owner or a property manager assigned to it.
create or replace function public.owns_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_property_owner(p_property_id) or public.is_property_staff(p_property_id, array['property_manager'])
$$;

-- "May view this property": owner or any assigned staff (including caretakers).
create or replace function public.can_view_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_property_owner(p_property_id)
      or public.is_property_staff(p_property_id, array['property_manager', 'caretaker'])
$$;

create or replace function public.owns_unit(p_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select public.owns_property(u.property_id) from public.units u where u.id = p_unit_id), false)
$$;

create or replace function public.owns_tenancy(p_tenancy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select public.owns_property(u.property_id)
    from public.tenancies t join public.units u on u.id = t.unit_id
    where t.id = p_tenancy_id
  ), false)
$$;

revoke all on function public.is_manager(), public.is_property_owner(uuid), public.is_property_staff(uuid, text[]),
  public.can_view_property(uuid) from public, anon;
grant execute on function public.is_manager(), public.is_property_owner(uuid), public.is_property_staff(uuid, text[]),
  public.can_view_property(uuid) to authenticated, service_role;

-- ===========================================================================================
-- RLS
-- ===========================================================================================
alter table public.property_staff enable row level security;
alter table public.staff_invitations enable row level security;

create policy property_staff_select_owner on public.property_staff
  for select to authenticated using (public.is_property_owner(property_id));
create policy property_staff_select_self on public.property_staff
  for select to authenticated using (user_id = auth.uid());
create policy property_staff_select_admin on public.property_staff
  for select to authenticated using (public.is_admin());

create policy staff_invitations_select_landlord on public.staff_invitations
  for select to authenticated using (landlord_id = public.my_landlord_profile_id());
create policy staff_invitations_select_admin on public.staff_invitations
  for select to authenticated using (public.is_admin());

revoke all on public.property_staff, public.staff_invitations from public, anon;
grant select on public.property_staff, public.staff_invitations to authenticated;
grant all on public.property_staff, public.staff_invitations to service_role;

-- Assigned staff can see the property and its units (managers also via owns_property on the existing policies).
create policy properties_select_staff on public.properties
  for select to authenticated using (public.can_view_property(id));
create policy units_select_staff on public.units
  for select to authenticated using (public.can_view_property(property_id));

-- Records the owner sees through landlord_id must also be visible to managers.
create policy invitations_select_staff on public.tenant_invitations
  for select to authenticated using (public.owns_property(property_id));
create policy link_requests_select_staff on public.tenant_link_requests
  for select to authenticated using (public.owns_unit(unit_id));

-- Billing configuration is the owner's alone (managers can read it).
drop policy property_settings_update_owner on public.property_settings;
create policy property_settings_update_owner on public.property_settings
  for update to authenticated
  using (public.is_property_owner(property_id)) with check (public.is_property_owner(property_id));

-- Ownership documents stay with the owner.
drop policy "verification docs: owner or admin read" on storage.objects;
drop policy "verification docs: owner upload" on storage.objects;
drop policy "verification docs: owner delete" on storage.objects;
create policy "verification docs: owner or admin read" on storage.objects
  for select to authenticated using (
    bucket_id = 'verification-documents' and (
      public.is_property_owner(public.safe_uuid((storage.foldername(name))[1])) or public.is_admin()
    )
  );
create policy "verification docs: owner upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'verification-documents'
    and public.is_property_owner(public.safe_uuid((storage.foldername(name))[1]))
  );
create policy "verification docs: owner delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'verification-documents'
    and public.is_property_owner(public.safe_uuid((storage.foldername(name))[1]))
  );

-- ===========================================================================================
-- Staff management RPCs
-- ===========================================================================================

-- Owner invites someone by email to manage one or more of their properties. Returns the RAW token once.
create or replace function public.invite_staff(
  p_email text,
  p_role text,
  p_property_ids uuid[],
  p_ttl interval default interval '7 days'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_landlord uuid := public.my_landlord_profile_id();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_ids uuid[];
  v_token text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if v_landlord is null then
    raise exception 'only property owners can invite staff' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 254 then
    raise exception 'enter a valid email address' using errcode = '22023';
  end if;
  if p_role not in ('property_manager', 'caretaker') then
    raise exception 'role must be property_manager or caretaker' using errcode = '22023';
  end if;
  if p_ttl is null or p_ttl <= interval '0' or p_ttl > interval '30 days' then
    raise exception 'invitation lifetime must be between 0 and 30 days' using errcode = '22023';
  end if;
  select array_agg(distinct x) into v_ids from unnest(coalesce(p_property_ids, '{}')) as x;
  if v_ids is null or cardinality(v_ids) = 0 then
    raise exception 'choose at least one property' using errcode = '22023';
  end if;
  if (select count(*) from public.properties pr where pr.id = any (v_ids) and pr.landlord_id = v_landlord)
     <> cardinality(v_ids) then
    raise exception 'property not found' using errcode = 'P0002';
  end if;
  if v_email = lower((select email from public.profiles where id = v_uid)) then
    raise exception 'you cannot invite yourself' using errcode = '22023';
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.staff_invitations (landlord_id, invitee_email, role, property_ids, token_hash, expires_at)
  values (v_landlord, v_email, p_role, v_ids, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), now() + p_ttl)
  returning id into v_id;

  perform public.write_audit_log('staff_invited', 'staff_invitation', v_id, null,
    jsonb_build_object('role', p_role, 'properties', cardinality(v_ids)), '{}'::jsonb);
  return v_token;
end;
$$;

create or replace function public.revoke_staff_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.staff_invitations;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select * into v_inv from public.staff_invitations
   where id = p_invitation_id and landlord_id = public.my_landlord_profile_id() for update;
  if not found then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'invitation is not pending (status: %)', v_inv.status using errcode = '22023';
  end if;
  update public.staff_invitations set status = 'revoked' where id = v_inv.id;
  perform public.write_audit_log('staff_invitation_revoked', 'staff_invitation', v_inv.id);
end;
$$;

-- A manager account redeems the token. The account's email must match the invitation. Returns how many properties
-- were assigned (properties sold or transferred since the invitation are skipped).
create or replace function public.accept_staff_invitation(p_token text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_inv public.staff_invitations;
  v_pid uuid;
  v_count integer := 0;
  v_owner_user uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found or v_profile.role <> 'manager' or v_profile.status <> 'active' then
    raise exception 'only manager accounts can accept staff invitations' using errcode = '42501';
  end if;
  if p_token is null or length(p_token) < 20 then
    raise exception 'invalid or expired invitation' using errcode = 'P0002';
  end if;

  select * into v_inv from public.staff_invitations
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') for update;
  if not found or v_inv.status <> 'pending' or v_inv.expires_at <= now() then
    raise exception 'invalid or expired invitation' using errcode = 'P0002';
  end if;
  if v_profile.email is null or lower(v_profile.email) <> v_inv.invitee_email then
    raise exception 'this invitation was issued to a different account' using errcode = '42501';
  end if;

  foreach v_pid in array v_inv.property_ids loop
    if exists (select 1 from public.properties pr where pr.id = v_pid and pr.landlord_id = v_inv.landlord_id) then
      -- A re-invite changes the role of an existing active assignment instead of duplicating it.
      update public.property_staff set role = v_inv.role
       where property_id = v_pid and user_id = v_uid and status = 'active';
      if not found then
        insert into public.property_staff (property_id, user_id, role, invited_by)
        select v_pid, v_uid, v_inv.role, lp.user_id from public.landlord_profiles lp where lp.id = v_inv.landlord_id;
      end if;
      v_count := v_count + 1;
    end if;
  end loop;
  if v_count = 0 then
    raise exception 'none of the invited properties are available any more' using errcode = '22023';
  end if;

  update public.staff_invitations set status = 'accepted', accepted_at = now(), accepted_by = v_uid where id = v_inv.id;

  select lp.user_id into v_owner_user from public.landlord_profiles lp where lp.id = v_inv.landlord_id;
  perform public.notify_user(v_owner_user, 'staff_joined', 'Staff invitation accepted',
    coalesce(v_profile.full_name, v_profile.email) || ' accepted and now has access to ' || v_count
      || ' propert' || case when v_count = 1 then 'y' else 'ies' end || '.',
    jsonb_build_object('invitation_id', v_inv.id, 'staff_user_id', v_uid));
  perform public.write_audit_log('staff_invitation_accepted', 'staff_invitation', v_inv.id, null, null,
    jsonb_build_object('properties', v_count));
  return v_count;
end;
$$;

-- Owner removes a manager/caretaker from ONE property. History is kept (status = removed).
create or replace function public.remove_staff(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.property_staff;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select * into v_row from public.property_staff where id = p_staff_id for update;
  if not found or not public.is_property_owner(v_row.property_id) then
    raise exception 'staff member not found' using errcode = 'P0002';
  end if;
  if v_row.status <> 'active' then
    raise exception 'staff member was already removed' using errcode = '22023';
  end if;
  update public.property_staff set status = 'removed', removed_at = now() where id = v_row.id;
  perform public.notify_user(v_row.user_id, 'staff_removed', 'Property access removed',
    'Your access to a property was removed by its owner.', jsonb_build_object('property_id', v_row.property_id));
  perform public.write_audit_log('staff_removed', 'property_staff', v_row.id, null, null,
    jsonb_build_object('property_id', v_row.property_id, 'user_id', v_row.user_id));
end;
$$;

-- Owner's staff roster (names/emails live in profiles, which owners cannot read directly).
create view public.property_staff_overview with (security_barrier = true) as
select
  s.id as staff_id, s.property_id, pr.name as property_name, s.user_id, s.role, s.status, s.created_at,
  p.full_name, p.email, p.phone
from public.property_staff s
join public.properties pr on pr.id = s.property_id
join public.profiles p on p.id = s.user_id
where s.status = 'active' and public.is_property_owner(s.property_id);
revoke all on public.property_staff_overview from public, anon;
grant select on public.property_staff_overview to authenticated, service_role;

-- A manager sees only the properties they are assigned to (RLS on properties already enforces it).
do $$
declare
  f text;
begin
  foreach f in array array[
    'invite_staff(text, text, uuid[], interval)',
    'revoke_staff_invitation(uuid)',
    'accept_staff_invitation(text)',
    'remove_staff(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- ===========================================================================================
-- Delegation-aware replacements (generated from 027/028/030 by scripts/gen-033-tail.mjs)
-- ===========================================================================================

create or replace function public.create_tenant_invitation(
  p_unit_id uuid,
  p_email text default null,
  p_phone text default null,
  p_ttl interval default interval '7 days'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_landlord uuid := public.my_landlord_profile_id();
  v_unit public.units;
  v_token text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if v_landlord is null and not public.is_manager() then
    raise exception 'only landlords can invite tenants' using errcode = '42501';
  end if;
  if (p_email is null or btrim(p_email) = '') and (p_phone is null or btrim(p_phone) = '') then
    raise exception 'an email or phone number is required' using errcode = '22023';
  end if;
  if p_ttl is null or p_ttl <= interval '0' or p_ttl > interval '30 days' then
    raise exception 'invitation lifetime must be between 0 and 30 days' using errcode = '22023';
  end if;

  select * into v_unit from public.units where id = p_unit_id;
  -- Same error for "missing" and "not yours": do not reveal other landlords' units.
  if not found or not public.owns_property(v_unit.property_id) then
    raise exception 'unit not found' using errcode = 'P0002';
  end if;
  -- Records always carry the OWNER's landlord id, whoever (owner or manager) acts.
  select pr.landlord_id into v_landlord from public.properties pr where pr.id = v_unit.property_id;
  if v_unit.status <> 'vacant' then
    raise exception 'unit is not vacant (status: %)', v_unit.status using errcode = '22023';
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.tenant_invitations
    (landlord_id, property_id, unit_id, invitee_email, invitee_phone, token_hash, expires_at)
  values
    (v_landlord, v_unit.property_id, v_unit.id,
     nullif(lower(btrim(p_email)), ''), nullif(btrim(p_phone), ''),
     encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), now() + p_ttl)
  returning id into v_id;

  perform public.write_audit_log('invitation_created', 'tenant_invitation', v_id, null,
    jsonb_build_object('unit_id', v_unit.id), jsonb_build_object('expires_in', p_ttl::text));

  return v_token;
end;
$$;

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
  if v_landlord is null and not public.is_manager() then
    raise exception 'only landlords can invite tenants' using errcode = '42501';
  end if;
  if not public.owns_property(p_property_id) then
    raise exception 'property not found' using errcode = 'P0002';
  end if;
  -- Records always carry the OWNER's landlord id, whoever (owner or manager) acts.
  select pr.landlord_id into v_landlord from public.properties pr where pr.id = p_property_id;
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
  if v_landlord is null and not public.is_manager() then
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
  -- Records always carry the OWNER's landlord id, whoever (owner or manager) acts.
  select pr.landlord_id into v_landlord from public.properties pr where pr.id = v_unit.property_id;
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
   where id = p_request_id and public.owns_unit(unit_id) for update;
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

create or replace view public.landlord_tenancy_overview with (security_barrier = true) as
select
  te.id            as tenancy_id,
  te.status        as tenancy_status,
  te.start_date,
  te.end_date,
  te.monthly_rent,
  te.security_deposit,
  te.currency,
  tp.id            as tenant_id,
  tprof.id         as tenant_user_id,
  tprof.full_name  as tenant_name,
  tprof.email      as tenant_email,
  tprof.phone      as tenant_phone,
  u.id             as unit_id,
  u.unit_number,
  pr.id            as property_id,
  pr.name          as property_name
from public.tenancies te
join public.tenant_profiles tp on tp.id = te.tenant_id
join public.profiles tprof on tprof.id = tp.user_id
join public.units u on u.id = te.unit_id
join public.properties pr on pr.id = u.property_id
where public.owns_tenancy(te.id);


create or replace view public.landlord_application_overview with (security_barrier = true) as
select
  a.id             as application_id,
  a.status         as application_status,
  a.message,
  a.desired_move_in_date,
  a.rejection_reason,
  a.reviewed_at,
  a.created_at,
  tp.id            as tenant_id,
  tprof.full_name  as tenant_name,
  tprof.email      as tenant_email,
  tprof.phone      as tenant_phone,
  u.id             as unit_id,
  u.unit_number,
  u.status         as unit_status,
  pr.id            as property_id,
  pr.name          as property_name
from public.rental_applications a
join public.tenant_profiles tp on tp.id = a.tenant_id
join public.profiles tprof on tprof.id = tp.user_id
join public.units u on u.id = a.unit_id
join public.properties pr on pr.id = u.property_id
where public.owns_property(pr.id);

