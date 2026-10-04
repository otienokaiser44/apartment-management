-- 009: THE central relationship.  tenant_profile -> tenancy -> unit -> property -> landlord.
-- Tenants carry no property/unit column; history is kept forever (status moves to ended).

create table public.tenancies (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenant_profiles (id) on delete restrict,
  unit_id          uuid not null references public.units (id) on delete restrict,
  landlord_id      uuid not null references public.landlord_profiles (id) on delete restrict,
  start_date       date not null,
  end_date         date,
  monthly_rent     numeric(12, 2) not null check (monthly_rent >= 0),
  security_deposit numeric(12, 2) not null default 0 check (security_deposit >= 0),
  currency         char(3) not null default 'KES',
  status           public.tenancy_status not null default 'pending',
  move_in_notes    text,
  move_out_notes   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint tenancies_dates_check check (end_date is null or end_date >= start_date),
  constraint tenancies_ended_has_end_date
    check (status not in ('ended', 'terminated') or end_date is not null)
);

create index tenancies_tenant_idx on public.tenancies (tenant_id);
create index tenancies_unit_idx on public.tenancies (unit_id);
create index tenancies_landlord_idx on public.tenancies (landlord_id);

-- No two ACTIVE tenancies for one unit...
create unique index tenancies_one_active_per_unit_idx
  on public.tenancies (unit_id) where status = 'active';
-- ...and no two OPEN (pending or active) tenancies either: a reserved unit has exactly one claimant.
create unique index uq_tenancies_open_per_unit
  on public.tenancies (unit_id) where status in ('pending', 'active');

create trigger tenancies_set_updated_at before update on public.tenancies
  for each row execute function public.set_updated_at();

-- Redundant landlord_id must equal the real owner (unit -> property -> landlord).
create or replace function public.check_tenancy_landlord()
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
    raise exception 'tenancy landlord_id does not match the unit''s property owner'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.check_tenancy_landlord() from public, anon, authenticated;

create trigger tenancies_landlord_consistency
  before insert or update of unit_id, landlord_id on public.tenancies
  for each row execute function public.check_tenancy_landlord();

-- A lease is the contract document; a tenancy is the occupancy relationship.
create table public.leases (
  id                    uuid primary key default gen_random_uuid(),
  tenancy_id            uuid not null references public.tenancies (id) on delete restrict,
  lease_reference       text not null unique,
  start_date            date not null,
  end_date              date,
  monthly_rent          numeric(12, 2) not null check (monthly_rent >= 0),
  security_deposit      numeric(12, 2) not null default 0 check (security_deposit >= 0),
  document_storage_path text,
  status                public.lease_status not null default 'draft',
  signed_at             timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint leases_dates_check check (end_date is null or end_date >= start_date)
);
create index leases_tenancy_idx on public.leases (tenancy_id);

create trigger leases_set_updated_at before update on public.leases
  for each row execute function public.set_updated_at();
