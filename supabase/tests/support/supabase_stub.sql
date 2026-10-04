-- Minimal stand-in for the parts of a Supabase stack the migrations depend on, so the SQL test
-- suite can run against a plain PostgreSQL server (CI, or a machine without Docker).
-- NEVER applied to a real Supabase project: the real stack already provides all of this.
-- Used by `npm run db:test:standalone` (scripts/db-test.mjs).

-- Roles are cluster-wide, so create them only if missing.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;
grant anon, authenticated, service_role to current_user;

create schema auth;
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  instance_id        uuid,
  aud                text,
  role               text,
  email              text,
  phone              text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data  jsonb not null default '{}'::jsonb,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  confirmation_token text,
  recovery_token     text,
  email_change       text,
  email_change_token_new text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create table auth.identities (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  provider_id   text not null,
  identity_data jsonb not null,
  provider      text not null,
  last_sign_in_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Supabase installs pgcrypto in the "extensions" schema (the seed uses extensions.crypt).
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;

create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create schema storage;
create table storage.buckets (
  id                 text primary key,
  name               text not null unique,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name      text,
  owner     uuid,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)]
$$;

grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant select on auth.users to service_role;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;

-- Same default privileges Supabase gives the migration role in `public`.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
