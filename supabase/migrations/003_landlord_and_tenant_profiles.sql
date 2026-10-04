-- 003: role extension tables + the signup trigger.

create table public.tenant_profiles (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null unique references public.profiles (id) on delete cascade,
  national_id             text,
  date_of_birth           date,
  emergency_contact_name  text,
  emergency_contact_phone text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table public.landlord_profiles (
  id                              uuid primary key default gen_random_uuid(),
  user_id                         uuid not null unique references public.profiles (id) on delete cascade,
  business_name                   text,
  national_id_or_registration_ref text,
  verification_status             public.verification_status not null default 'unverified',
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now()
);

create table public.admin_profiles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger tenant_profiles_set_updated_at before update on public.tenant_profiles
  for each row execute function public.set_updated_at();
create trigger landlord_profiles_set_updated_at before update on public.landlord_profiles
  for each row execute function public.set_updated_at();
create trigger admin_profiles_set_updated_at before update on public.admin_profiles
  for each row execute function public.set_updated_at();

-- Signup: create the profile and the matching extension row.
-- Client-supplied metadata may only select 'tenant' or 'landlord'; anything else
-- (including 'admin') silently becomes 'tenant'. Admins are provisioned out-of-band.
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
  else
    insert into public.tenant_profiles (user_id) values (new.id);
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
