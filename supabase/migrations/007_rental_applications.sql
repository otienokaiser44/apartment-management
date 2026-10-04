-- 007: a tenant applies for a unit. Approval never edits the applicant; it creates a
-- tenancy through approve_rental_application() (027).

create table public.rental_applications (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenant_profiles (id) on delete cascade,
  unit_id              uuid not null references public.units (id) on delete cascade,
  message              text,
  desired_move_in_date date,
  status               public.application_status not null default 'pending',
  reviewed_by          uuid references public.profiles (id) on delete set null,
  reviewed_at          timestamptz,
  rejection_reason     text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index rental_applications_tenant_idx on public.rental_applications (tenant_id);
create index rental_applications_unit_idx on public.rental_applications (unit_id);
create index rental_applications_reviewed_by_idx on public.rental_applications (reviewed_by);
-- At most one live application per tenant per unit.
create unique index rental_applications_one_pending_idx
  on public.rental_applications (tenant_id, unit_id) where status = 'pending';

create trigger rental_applications_set_updated_at before update on public.rental_applications
  for each row execute function public.set_updated_at();
