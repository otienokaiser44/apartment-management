-- 005: amenity catalogue, property<->amenity join, property images (paths into Storage).

create table public.amenities (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text,
  created_at  timestamptz not null default now()
);

create table public.property_amenities (
  property_id uuid not null references public.properties (id) on delete cascade,
  amenity_id  uuid not null references public.amenities (id) on delete cascade,
  primary key (property_id, amenity_id)
);
create index property_amenities_amenity_idx on public.property_amenities (amenity_id);

create table public.property_images (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references public.properties (id) on delete cascade,
  storage_path text not null,
  caption      text,
  sort_order   integer not null default 0,
  is_cover     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index property_images_property_idx on public.property_images (property_id);
create unique index property_images_one_cover_idx on public.property_images (property_id)
  where is_cover;
