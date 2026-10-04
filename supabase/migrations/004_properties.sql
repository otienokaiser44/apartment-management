-- 004: properties (building / house / villa ...). A property is NOT a rentable unit.

create table public.properties (
  id                  uuid primary key default gen_random_uuid(),
  landlord_id         uuid not null references public.landlord_profiles (id) on delete restrict,
  name                text not null check (length(btrim(name)) > 0),
  property_type       public.property_type not null default 'apartment',
  description         text,
  address_line_1      text not null,
  address_line_2      text,
  city                text not null,
  county_or_region    text,
  postal_code         text,
  country             text not null default 'KE',
  latitude            numeric(9, 6) check (latitude between -90 and 90),
  longitude           numeric(9, 6) check (longitude between -180 and 180),
  status              public.property_status not null default 'draft',
  verification_status public.verification_status not null default 'unverified',
  published_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index properties_landlord_idx on public.properties (landlord_id);
create index properties_city_idx on public.properties (lower(city));
create index properties_public_idx on public.properties (id)
  where status = 'published' and verification_status = 'verified';

create trigger properties_set_updated_at before update on public.properties
  for each row execute function public.set_updated_at();
