-- 034: account settings for every signed-in user (profile, email, notifications, deactivation).
--
--   1. profiles.email is no longer user-editable. It mirrors auth.users.email through a trigger, so an email change only
--      takes effect after it is confirmed by Supabase Auth. (Invitation checks compare against profiles.email; letting a
--      user rewrite it would defeat them.)
--   2. avatar_path must live in the user's own storage folder.
--   3. notification_preferences: per-category opt-out of IN-APP notifications.
--   4. deactivate_my_account(): self-service account closure with safety blockers.

-- ===========================================================================================
-- 1 + 2. Profile guards
-- ===========================================================================================
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
    if new.email is distinct from old.email then
      raise exception 'email is managed by sign-in and cannot be edited directly'
        using errcode = '42501';
    end if;
    if new.avatar_path is distinct from old.avatar_path
       and new.avatar_path is not null
       and split_part(new.avatar_path, '/', 1) <> new.id::text then
      raise exception 'avatar must be stored in your own folder' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- Mirror a confirmed sign-in email change into profiles (SECURITY DEFINER: bypasses the guard above).
create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id and email is distinct from new.email;
  return new;
end;
$$;
revoke all on function public.sync_profile_email() from public, anon, authenticated;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_profile_email();

-- ===========================================================================================
-- 3. Notification preferences
-- ===========================================================================================
create table public.notification_preferences (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  -- Categories the user has switched OFF. Anything not listed (and every uncategorised type) is delivered.
  muted_categories text[] not null default '{}'
    check (muted_categories <@ array['announcements', 'billing', 'tenancy', 'staff']::text[]),
  updated_at       timestamptz not null default now()
);
create trigger notification_preferences_set_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;
create policy notification_preferences_select_own on public.notification_preferences
  for select to authenticated using (user_id = auth.uid());
create policy notification_preferences_insert_own on public.notification_preferences
  for insert to authenticated with check (user_id = auth.uid());
create policy notification_preferences_update_own on public.notification_preferences
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.notification_preferences from public, anon;
grant select, insert, update on public.notification_preferences to authenticated;
grant all on public.notification_preferences to service_role;

-- Maps a notification type to a user-facing category. Unknown types are 'other' and can never be muted.
create or replace function public.notification_category(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type = 'notice' then 'announcements'
    when p_type in ('invoice_issued', 'payment_successful') then 'billing'
    when p_type in ('application_approved', 'application_rejected', 'invitation_accepted',
                    'link_request_accepted', 'link_request_received', 'link_request_rejected',
                    'tenancy_cancelled', 'tenancy_ended', 'tenancy_started', 'unit_link_requested') then 'tenancy'
    when p_type in ('staff_joined', 'staff_removed') then 'staff'
    else 'other'
  end
$$;

-- One central switch for every code path that writes notifications (notify_user, send_notice, send_announcement ...):
-- a muted category simply never gets a row. Announcements still reach the tenant's dashboard (notice_recipients).
create or replace function public.skip_muted_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.notification_preferences np
    where np.user_id = new.user_id and public.notification_category(new.type) = any (np.muted_categories)
  ) then
    return null;
  end if;
  return new;
end;
$$;
revoke all on function public.skip_muted_notification() from public, anon, authenticated;

create trigger notifications_respect_preferences before insert on public.notifications
  for each row execute function public.skip_muted_notification();

-- ===========================================================================================
-- 4. Self-service deactivation
-- ===========================================================================================
-- Sets the account to 'disabled' (sign-in is refused; an administrator can reactivate it). Tenancy history, payments and
-- invoices are untouched. Blocked while the person still has an active or pending tenancy, as tenant or as owner.
create or replace function public.deactivate_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_tenant uuid;
  v_landlord uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select p.role into v_role from public.profiles p where p.id = v_uid and p.status = 'active' for update;
  if not found then
    raise exception 'this account is not active' using errcode = '22023';
  end if;
  if v_role = 'admin' then
    raise exception 'administrator accounts cannot be deactivated from settings' using errcode = '42501';
  end if;

  select tp.id into v_tenant from public.tenant_profiles tp where tp.user_id = v_uid;
  select lp.id into v_landlord from public.landlord_profiles lp where lp.user_id = v_uid;

  if v_tenant is not null and exists (
    select 1 from public.tenancies t where t.tenant_id = v_tenant and t.status in ('pending', 'active')
  ) then
    raise exception 'you have an active or pending tenancy; it must be ended before you can deactivate your account'
      using errcode = '22023';
  end if;
  if v_landlord is not null and exists (
    select 1 from public.tenancies t where t.landlord_id = v_landlord and t.status in ('pending', 'active')
  ) then
    raise exception 'you have tenants with active or pending tenancies; end those tenancies before you deactivate your account'
      using errcode = '22023';
  end if;

  -- Close anything half-open so nothing can be claimed or approved against a disabled account.
  if v_landlord is not null then
    update public.tenant_invitations set status = 'revoked' where landlord_id = v_landlord and status = 'pending';
    update public.staff_invitations set status = 'revoked' where landlord_id = v_landlord and status = 'pending';
    update public.tenant_link_requests set status = 'cancelled' where landlord_id = v_landlord and status = 'pending';
  end if;
  if v_tenant is not null then
    update public.rental_applications set status = 'withdrawn' where tenant_id = v_tenant and status = 'pending';
    update public.tenant_link_requests set status = 'cancelled' where tenant_id = v_tenant and status = 'pending';
  end if;
  update public.property_staff set status = 'removed', removed_at = now() where user_id = v_uid and status = 'active';

  update public.profiles set status = 'disabled' where id = v_uid;
  perform public.write_audit_log('account_deactivated', 'profile', v_uid);
end;
$$;

revoke all on function public.deactivate_my_account() from public, anon;
grant execute on function public.deactivate_my_account() to authenticated, service_role;
