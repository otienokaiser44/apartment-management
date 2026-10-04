-- 020: RLS for identity tables.
-- Guard triggers only restrict the API roles (anon/authenticated). Protected SECURITY DEFINER
-- functions run as the table owner, so they are not blocked by the guards.

alter table public.profiles enable row level security;
alter table public.tenant_profiles enable row level security;
alter table public.landlord_profiles enable row level security;
alter table public.admin_profiles enable row level security;

-- profiles ---------------------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_select_admin on public.profiles
  for select to authenticated using (public.is_admin());
-- A landlord sees basic contact info of tenants tied to their own tenancies/applications.
create policy profiles_select_landlord_tenants on public.profiles
  for select to authenticated using (public.landlord_has_tenant_user(id));
-- A tenant sees basic contact info of landlords they have dealings with.
create policy profiles_select_tenant_landlords on public.profiles
  for select to authenticated using (public.tenant_has_landlord_user(id));
create policy profiles_select_conversation_peers on public.profiles
  for select to authenticated using (public.shares_conversation_with(id));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.guard_profiles_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    if new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.status is distinct from old.status then
      raise exception 'role, status and id can only be changed by an administrator'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger profiles_guard_update before update on public.profiles
  for each row execute function public.guard_profiles_update();

-- tenant_profiles --------------------------------------------------------------------
-- Landlords deliberately get NO access: national id / emergency contacts stay private.
create policy tenant_profiles_select_own on public.tenant_profiles
  for select to authenticated using (user_id = auth.uid());
create policy tenant_profiles_update_own on public.tenant_profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy tenant_profiles_admin_all on public.tenant_profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.guard_extension_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id then
      raise exception 'identity columns are immutable' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger tenant_profiles_guard before update on public.tenant_profiles
  for each row execute function public.guard_extension_profile_update();

-- landlord_profiles ------------------------------------------------------------------
create policy landlord_profiles_select_own on public.landlord_profiles
  for select to authenticated using (user_id = auth.uid());
create policy landlord_profiles_update_own on public.landlord_profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy landlord_profiles_admin_all on public.landlord_profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.guard_landlord_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    if new.id is distinct from old.id
       or new.user_id is distinct from old.user_id
       or new.verification_status is distinct from old.verification_status then
      raise exception 'landlords cannot change their own verification status'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger landlord_profiles_guard before update on public.landlord_profiles
  for each row execute function public.guard_landlord_profile_update();

-- admin_profiles: readable by admins only; written only with the service role.
create policy admin_profiles_select_admin on public.admin_profiles
  for select to authenticated using (public.is_admin());

-- Privileges: nothing for anon on identity tables; no client inserts/deletes anywhere here.
revoke all on public.profiles, public.tenant_profiles, public.landlord_profiles, public.admin_profiles
  from anon;
revoke insert, delete, truncate on public.profiles, public.tenant_profiles,
  public.landlord_profiles, public.admin_profiles from authenticated;
revoke update, truncate on public.admin_profiles from authenticated;
