-- 006: individual rentable units and their images.

create table public.units (
  id               uuid primary key default gen_random_uuid(),
  property_id      uuid not null references public.properties (id) on delete cascade,
  unit_number      text not null check (length(btrim(unit_number)) > 0),
  unit_type        text,
  floor_number     integer,
  bedrooms         integer not null default 0 check (bedrooms between 0 and 50),
  bathrooms        numeric(3, 1) not null default 1 check (bathrooms between 0 and 50),
  monthly_rent     numeric(12, 2) not null check (monthly_rent >= 0),
  security_deposit numeric(12, 2) not null default 0 check (security_deposit >= 0),
  currency         char(3) not null default 'KES',
  description      text,
  status           public.unit_status not null default 'vacant',
  available_from   date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint units_property_unit_number_key unique (property_id, unit_number)
);

create index units_property_idx on public.units (property_id);
create index units_status_idx on public.units (status);
create index units_rent_idx on public.units (monthly_rent) where status in ('vacant', 'reserved');

create trigger units_set_updated_at before update on public.units
  for each row execute function public.set_updated_at();

create table public.unit_images (
  id           uuid primary key default gen_random_uuid(),
  unit_id      uuid not null references public.units (id) on delete cascade,
  storage_path text not null,
  caption      text,
  sort_order   integer not null default 0,
  is_cover     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index unit_images_unit_idx on public.unit_images (unit_id);
create unique index unit_images_one_cover_idx on public.unit_images (unit_id) where is_cover;
