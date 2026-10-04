-- 010: amounts due and money received. Provider-agnostic: provider/provider_reference are
-- optional free text, so M-Pesa (or anything else) can be plugged in later without schema change.

create table public.rent_charges (
  id                   uuid primary key default gen_random_uuid(),
  tenancy_id           uuid not null references public.tenancies (id) on delete restrict,
  billing_period_start date not null,
  billing_period_end   date not null,
  due_date             date not null,
  amount               numeric(12, 2) not null check (amount >= 0),
  currency             char(3) not null default 'KES',
  status               public.charge_status not null default 'pending',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint rent_charges_period_check check (billing_period_end >= billing_period_start)
);
create index rent_charges_tenancy_idx on public.rent_charges (tenancy_id);
create index rent_charges_due_idx on public.rent_charges (due_date) where status in ('pending', 'partially_paid', 'overdue');
create unique index rent_charges_one_per_period_idx
  on public.rent_charges (tenancy_id, billing_period_start) where status <> 'cancelled';

create trigger rent_charges_set_updated_at before update on public.rent_charges
  for each row execute function public.set_updated_at();

create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  tenancy_id         uuid not null references public.tenancies (id) on delete restrict,
  rent_charge_id     uuid references public.rent_charges (id) on delete set null,
  tenant_id          uuid not null references public.tenant_profiles (id) on delete restrict,
  amount             numeric(12, 2) not null check (amount > 0),
  currency           char(3) not null default 'KES',
  payment_method     text,
  provider           text,
  provider_reference text,
  status             public.payment_status not null default 'pending',
  paid_at            timestamptz,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index payments_tenancy_idx on public.payments (tenancy_id);
create index payments_charge_idx on public.payments (rent_charge_id);
create index payments_tenant_idx on public.payments (tenant_id);
create unique index payments_provider_reference_key
  on public.payments (provider, provider_reference) where provider_reference is not null;

create trigger payments_set_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- payments.tenant_id and rent_charge_id must belong to the same tenancy.
create or replace function public.check_payment_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.tenancies t where t.id = new.tenancy_id and t.tenant_id = new.tenant_id
  ) then
    raise exception 'payment tenant does not match tenancy tenant' using errcode = '23514';
  end if;
  if new.rent_charge_id is not null and not exists (
    select 1 from public.rent_charges c where c.id = new.rent_charge_id and c.tenancy_id = new.tenancy_id
  ) then
    raise exception 'payment charge does not belong to tenancy' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.check_payment_consistency() from public, anon, authenticated;

create trigger payments_consistency
  before insert or update of tenancy_id, tenant_id, rent_charge_id on public.payments
  for each row execute function public.check_payment_consistency();
