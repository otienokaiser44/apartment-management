-- 019: helper functions used by RLS policies and RPCs.
-- All are SECURITY DEFINER with an empty search_path (every reference is schema-qualified) so
-- policy evaluation never recurses into RLS. They answer questions ABOUT THE CALLER ONLY
-- (auth.uid()), so granting EXECUTE to anon/authenticated leaks nothing.
-- Role checks require status = 'active': a suspended admin/landlord loses its powers.

create or replace function public.current_user_id()
returns uuid
language sql
stable
set search_path = ''
as $$ select auth.uid() $$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.status = 'active'
  )
$$;

create or replace function public.is_landlord()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'landlord' and p.status = 'active'
  )
$$;

create or replace function public.is_tenant()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'tenant' and p.status = 'active'
  )
$$;

create or replace function public.my_tenant_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tp.id from public.tenant_profiles tp
  join public.profiles p on p.id = tp.user_id
  where tp.user_id = auth.uid() and p.status = 'active'
$$;

create or replace function public.my_landlord_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select lp.id from public.landlord_profiles lp
  join public.profiles p on p.id = lp.user_id
  where lp.user_id = auth.uid() and p.status = 'active'
$$;

create or replace function public.owns_property(p_property_id uuid)
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

create or replace function public.owns_unit(p_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.units u
    join public.properties pr on pr.id = u.property_id
    join public.landlord_profiles lp on lp.id = pr.landlord_id
    join public.profiles p on p.id = lp.user_id
    where u.id = p_unit_id and lp.user_id = auth.uid() and p.status = 'active'
  )
$$;

create or replace function public.owns_tenancy(p_tenancy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenancies t
    join public.landlord_profiles lp on lp.id = t.landlord_id
    join public.profiles p on p.id = lp.user_id
    where t.id = p_tenancy_id and lp.user_id = auth.uid() and p.status = 'active'
  )
$$;

-- Caller currently lives in this unit (ACTIVE tenancy).
create or replace function public.is_tenant_of_unit(p_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenancies t
    join public.tenant_profiles tp on tp.id = t.tenant_id
    where t.unit_id = p_unit_id and t.status = 'active' and tp.user_id = auth.uid()
  )
$$;

-- Caller is the tenant on this tenancy (any status, so history stays readable).
create or replace function public.is_tenant_of_tenancy(p_tenancy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenancies t
    join public.tenant_profiles tp on tp.id = t.tenant_id
    where t.id = p_tenancy_id and tp.user_id = auth.uid()
  )
$$;

-- Caller may read this unit as a tenant: any tenancy on it (current or past), an application
-- of theirs, or a live invitation addressed to their email.
create or replace function public.tenant_can_view_unit(p_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenancies t
    join public.tenant_profiles tp on tp.id = t.tenant_id
    where t.unit_id = p_unit_id and tp.user_id = auth.uid()
  ) or exists (
    select 1 from public.rental_applications a
    join public.tenant_profiles tp on tp.id = a.tenant_id
    where a.unit_id = p_unit_id and tp.user_id = auth.uid()
  ) or exists (
    select 1 from public.tenant_invitations i
    join public.profiles p on p.id = auth.uid()
    where i.unit_id = p_unit_id and i.status = 'pending' and i.expires_at > now()
      and i.invitee_email is not null and lower(i.invitee_email) = lower(p.email)
  )
$$;

create or replace function public.tenant_can_view_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.units u
    where u.property_id = p_property_id and public.tenant_can_view_unit(u.id)
  )
$$;

-- Landlord who owns the property of a unit/tenancy the given tenant has/had (privacy: landlords
-- see only tenants tied to their own tenancies or applications).
create or replace function public.landlord_has_tenant(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenancies t
    where t.tenant_id = p_tenant_id and public.owns_tenancy(t.id)
  ) or exists (
    select 1 from public.rental_applications a
    where a.tenant_id = p_tenant_id and public.owns_unit(a.unit_id)
  )
$$;

create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id and cp.user_id = auth.uid()
  )
$$;

-- Public-listing predicate used by policies and the public view.
create or replace function public.is_publicly_listed_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.properties pr
    where pr.id = p_property_id and pr.status = 'published' and pr.verification_status = 'verified'
  )
$$;

-- A unit shown on the public marketplace: vacant/reserved unit of a published+verified property.
create or replace function public.is_public_unit(p_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.units u
    join public.properties pr on pr.id = u.property_id
    where u.id = p_unit_id
      and u.status in ('vacant', 'reserved')
      and pr.status = 'published' and pr.verification_status = 'verified'
  )
$$;

-- A unit a tenant may apply for: public AND still vacant.
create or replace function public.is_applicable_unit(p_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.units u
    where u.id = p_unit_id and u.status = 'vacant' and public.is_public_unit(u.id)
  )
$$;

-- Caller is the tenant on this tenancy and it is ACTIVE.
create or replace function public.is_active_tenant_of_tenancy(p_tenancy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenancies t
    join public.tenant_profiles tp on tp.id = t.tenant_id
    where t.id = p_tenancy_id and t.status = 'active' and tp.user_id = auth.uid()
  )
$$;

-- Caller (a tenant) has/had a tenancy, or an application, with this landlord.
create or replace function public.tenant_has_landlord(p_landlord_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tenancies t
    join public.tenant_profiles tp on tp.id = t.tenant_id
    where t.landlord_id = p_landlord_id and tp.user_id = auth.uid()
  ) or exists (
    select 1 from public.rental_applications a
    join public.tenant_profiles tp on tp.id = a.tenant_id
    join public.units u on u.id = a.unit_id
    join public.properties pr on pr.id = u.property_id
    where pr.landlord_id = p_landlord_id and tp.user_id = auth.uid()
  )
$$;

-- User-id flavoured variants for profile visibility (the lookups must bypass RLS, so they
-- live inside definer functions instead of policy subqueries).
create or replace function public.landlord_has_tenant_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_landlord() and exists (
    select 1 from public.tenant_profiles tp
    where tp.user_id = p_user_id and public.landlord_has_tenant(tp.id)
  )
$$;

create or replace function public.tenant_has_landlord_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.landlord_profiles lp
    where lp.user_id = p_user_id and public.tenant_has_landlord(lp.id)
  )
$$;

-- Caller shares a conversation with the given user (so participants can see each other's name).
create or replace function public.shares_conversation_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_participants me
    join public.conversation_participants them on them.conversation_id = me.conversation_id
    where me.user_id = auth.uid() and them.user_id = p_user_id
  )
$$;

-- Notice visibility helpers (definer, so notices <-> notice_recipients policies cannot recurse).
create or replace function public.is_notice_recipient(p_notice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.notice_recipients r
    where r.notice_id = p_notice_id and r.tenant_id = public.my_tenant_profile_id()
  )
$$;

create or replace function public.is_notice_creator(p_notice_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.notices n where n.id = p_notice_id and n.created_by = auth.uid()
  )
$$;

-- Storage helper: a path segment that is not a uuid yields NULL instead of an error.
create or replace function public.safe_uuid(p_text text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_text::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- ---------------------------------------------------------------------------------------
-- Internal writers. NOT callable by API roles: only other SECURITY DEFINER functions use them.
-- ---------------------------------------------------------------------------------------
create or replace function public.write_audit_log(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_old jsonb default null,
  p_new jsonb default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, old_values, new_values, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_old, p_new, coalesce(p_metadata, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.notify_user(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_data jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, type, title, body, data)
  values (p_user_id, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb))
$$;

-- Privileges --------------------------------------------------------------------------
do $$
declare
  f text;
begin
  -- predicate helpers: callable by anon + authenticated (policies evaluate as the caller)
  foreach f in array array[
    'current_user_id()', 'is_admin()', 'is_landlord()', 'is_tenant()',
    'my_tenant_profile_id()', 'my_landlord_profile_id()',
    'owns_property(uuid)', 'owns_unit(uuid)', 'owns_tenancy(uuid)',
    'is_tenant_of_unit(uuid)', 'is_tenant_of_tenancy(uuid)',
    'tenant_can_view_unit(uuid)', 'tenant_can_view_property(uuid)',
    'landlord_has_tenant(uuid)', 'is_conversation_participant(uuid)',
    'is_publicly_listed_property(uuid)', 'is_public_unit(uuid)', 'is_applicable_unit(uuid)',
    'is_active_tenant_of_tenancy(uuid)', 'tenant_has_landlord(uuid)',
    'shares_conversation_with(uuid)', 'safe_uuid(text)',
    'landlord_has_tenant_user(uuid)', 'tenant_has_landlord_user(uuid)',
    'is_notice_recipient(uuid)', 'is_notice_creator(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated, service_role', f);
  end loop;
end $$;

revoke all on function public.write_audit_log(text, text, uuid, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.notify_user(uuid, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.write_audit_log(text, text, uuid, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.notify_user(uuid, text, text, text, jsonb) to service_role;
