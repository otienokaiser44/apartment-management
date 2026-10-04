-- 016: property verification workflow (separate from authentication). Only admins decide.

create table public.verification_document_types (
  code        text primary key check (code ~ '^[a-z0-9_]+$'),
  label       text not null,
  description text,
  is_required boolean not null default false,
  created_at  timestamptz not null default now()
);

create table public.property_verification_requests (
  id                       uuid primary key default gen_random_uuid(),
  property_id              uuid not null references public.properties (id) on delete cascade,
  submitted_by_landlord_id uuid not null references public.landlord_profiles (id) on delete cascade,
  status                   public.verification_request_status not null default 'draft',
  reviewed_by_admin_id     uuid references public.profiles (id) on delete set null,
  reviewed_at              timestamptz,
  rejection_reason         text,
  admin_notes              text,
  submitted_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint pvr_rejection_reason_check
    check (status <> 'rejected' or rejection_reason is not null)
);
create index pvr_property_idx on public.property_verification_requests (property_id);
create index pvr_landlord_idx on public.property_verification_requests (submitted_by_landlord_id);
create index pvr_reviewer_idx on public.property_verification_requests (reviewed_by_admin_id);
create index pvr_queue_idx on public.property_verification_requests (submitted_at)
  where status in ('submitted', 'under_review');
-- One live request per property.
create unique index pvr_one_open_per_property_idx on public.property_verification_requests (property_id)
  where status in ('draft', 'submitted', 'under_review');

create trigger pvr_set_updated_at before update on public.property_verification_requests
  for each row execute function public.set_updated_at();

create table public.property_verification_documents (
  id                      uuid primary key default gen_random_uuid(),
  verification_request_id uuid not null references public.property_verification_requests (id) on delete cascade,
  document_type           text not null references public.verification_document_types (code),
  storage_path            text not null,
  status                  public.document_status not null default 'pending',
  reviewed_by_admin_id    uuid references public.profiles (id) on delete set null,
  reviewed_at             timestamptz,
  rejection_reason        text,
  created_at              timestamptz not null default now()
);
create index pvd_request_idx on public.property_verification_documents (verification_request_id);
create index pvd_type_idx on public.property_verification_documents (document_type);
create index pvd_reviewer_idx on public.property_verification_documents (reviewed_by_admin_id);
