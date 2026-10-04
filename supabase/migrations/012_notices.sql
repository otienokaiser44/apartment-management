-- 012: notices from landlords/admins. The audience is materialised in notice_recipients by
-- send_notice() (027): whole property, one unit, or one tenant.

create table public.notices (
  id           uuid primary key default gen_random_uuid(),
  created_by   uuid not null references public.profiles (id) on delete cascade,
  property_id  uuid references public.properties (id) on delete cascade,
  unit_id      uuid references public.units (id) on delete cascade,
  title        text not null check (length(btrim(title)) > 0),
  body         text not null,
  published_at timestamptz not null default now(),
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index notices_created_by_idx on public.notices (created_by);
create index notices_property_idx on public.notices (property_id);
create index notices_unit_idx on public.notices (unit_id);

create trigger notices_set_updated_at before update on public.notices
  for each row execute function public.set_updated_at();

create table public.notice_recipients (
  notice_id uuid not null references public.notices (id) on delete cascade,
  tenant_id uuid not null references public.tenant_profiles (id) on delete cascade,
  read_at   timestamptz,
  primary key (notice_id, tenant_id)
);
create index notice_recipients_tenant_idx on public.notice_recipients (tenant_id);
