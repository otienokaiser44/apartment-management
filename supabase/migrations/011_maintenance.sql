-- 011: maintenance requests raised by a tenant against their tenancy's unit.

create table public.maintenance_requests (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant_profiles (id) on delete restrict,
  unit_id     uuid not null references public.units (id) on delete restrict,
  tenancy_id  uuid not null references public.tenancies (id) on delete restrict,
  title       text not null check (length(btrim(title)) > 0),
  description text,
  priority    public.maintenance_priority not null default 'medium',
  status      public.maintenance_status not null default 'open',
  assigned_to uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index maintenance_requests_tenant_idx on public.maintenance_requests (tenant_id);
create index maintenance_requests_unit_idx on public.maintenance_requests (unit_id);
create index maintenance_requests_tenancy_idx on public.maintenance_requests (tenancy_id);
create index maintenance_requests_assigned_idx on public.maintenance_requests (assigned_to);
create index maintenance_requests_open_idx on public.maintenance_requests (unit_id)
  where status in ('open', 'in_progress');

create trigger maintenance_requests_set_updated_at before update on public.maintenance_requests
  for each row execute function public.set_updated_at();

create or replace function public.check_maintenance_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.tenancies t
    where t.id = new.tenancy_id and t.tenant_id = new.tenant_id and t.unit_id = new.unit_id
  ) then
    raise exception 'maintenance request tenant/unit does not match tenancy' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.check_maintenance_consistency() from public, anon, authenticated;

create trigger maintenance_requests_consistency
  before insert or update of tenant_id, unit_id, tenancy_id on public.maintenance_requests
  for each row execute function public.check_maintenance_consistency();

create table public.maintenance_attachments (
  id                     uuid primary key default gen_random_uuid(),
  maintenance_request_id uuid not null references public.maintenance_requests (id) on delete cascade,
  storage_path           text not null,
  created_at             timestamptz not null default now()
);
create index maintenance_attachments_request_idx
  on public.maintenance_attachments (maintenance_request_id);
