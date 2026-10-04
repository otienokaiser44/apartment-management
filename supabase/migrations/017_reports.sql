-- 017: users report suspicious listings; admins moderate.

create table public.property_reports (
  id               uuid primary key default gen_random_uuid(),
  property_id      uuid not null references public.properties (id) on delete cascade,
  reported_by      uuid not null references public.profiles (id) on delete cascade,
  reason           text not null check (length(btrim(reason)) > 0),
  description      text,
  status           public.report_status not null default 'open',
  reviewed_by      uuid references public.profiles (id) on delete set null,
  reviewed_at      timestamptz,
  resolution_notes text,
  created_at       timestamptz not null default now()
);
create index property_reports_property_idx on public.property_reports (property_id);
create index property_reports_reporter_idx on public.property_reports (reported_by);
create index property_reports_reviewer_idx on public.property_reports (reviewed_by);
create index property_reports_open_idx on public.property_reports (created_at)
  where status in ('open', 'under_review');
