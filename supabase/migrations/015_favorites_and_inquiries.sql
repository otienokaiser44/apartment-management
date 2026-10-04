-- 015: saved listings and pre-signup inquiries.

create table public.favorites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  property_id uuid references public.properties (id) on delete cascade,
  unit_id     uuid references public.units (id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint favorites_exactly_one_target
    check ((property_id is not null)::int + (unit_id is not null)::int = 1)
);
create unique index favorites_user_property_key on public.favorites (user_id, property_id)
  where property_id is not null;
create unique index favorites_user_unit_key on public.favorites (user_id, unit_id)
  where unit_id is not null;
create index favorites_property_idx on public.favorites (property_id);
create index favorites_unit_idx on public.favorites (unit_id);

create table public.property_inquiries (
  id             uuid primary key default gen_random_uuid(),
  property_id    uuid not null references public.properties (id) on delete cascade,
  unit_id        uuid references public.units (id) on delete set null,
  sender_user_id uuid references public.profiles (id) on delete set null,
  sender_name    text not null check (length(btrim(sender_name)) > 0),
  sender_email   text not null,
  sender_phone   text,
  message        text not null check (length(btrim(message)) > 0),
  status         public.inquiry_status not null default 'new',
  created_at     timestamptz not null default now()
);
create index property_inquiries_property_idx on public.property_inquiries (property_id);
create index property_inquiries_unit_idx on public.property_inquiries (unit_id);
create index property_inquiries_sender_idx on public.property_inquiries (sender_user_id);
