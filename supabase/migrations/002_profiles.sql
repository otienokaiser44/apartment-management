-- 002: one profile row per authenticated user. The row itself is created by the
-- signup trigger in 003 (it also needs the role extension tables).
-- Visitors are unauthenticated and have no row.

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  email       text,
  phone       text,
  avatar_path text,
  role        public.user_role not null default 'tenant',
  status      public.user_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);
create index profiles_status_idx on public.profiles (status);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
