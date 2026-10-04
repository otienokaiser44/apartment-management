-- 001: shared enum types and the updated_at trigger function.
-- Statuses are Postgres enums so invalid states are impossible at the storage layer.

create type public.user_role as enum ('admin', 'landlord', 'tenant');
create type public.user_status as enum ('active', 'suspended', 'pending', 'disabled');

-- Shared by landlord accounts and properties.
create type public.verification_status as enum (
  'unverified', 'pending', 'under_review', 'verified', 'rejected', 'suspended'
);

create type public.property_type as enum (
  'apartment', 'house', 'villa', 'townhouse', 'hostel', 'commercial', 'other'
);
create type public.property_status as enum (
  'draft', 'published', 'unpublished', 'suspended', 'archived'
);
create type public.unit_status as enum (
  'vacant', 'reserved', 'occupied', 'maintenance', 'unavailable'
);

create type public.application_status as enum (
  'pending', 'approved', 'rejected', 'withdrawn', 'cancelled', 'expired'
);
create type public.invitation_status as enum ('pending', 'accepted', 'expired', 'revoked');

create type public.tenancy_status as enum (
  'pending', 'active', 'ended', 'terminated', 'cancelled'
);
create type public.lease_status as enum (
  'draft', 'pending_signature', 'active', 'expired', 'terminated'
);

create type public.charge_status as enum (
  'pending', 'partially_paid', 'paid', 'overdue', 'cancelled'
);
create type public.payment_status as enum (
  'pending', 'processing', 'successful', 'failed', 'refunded', 'cancelled'
);

create type public.maintenance_priority as enum ('low', 'medium', 'high', 'urgent');
create type public.maintenance_status as enum (
  'open', 'in_progress', 'resolved', 'closed', 'cancelled'
);

create type public.verification_request_status as enum (
  'draft', 'submitted', 'under_review', 'approved', 'rejected', 'withdrawn'
);
create type public.document_status as enum ('pending', 'approved', 'rejected');
create type public.report_status as enum ('open', 'under_review', 'resolved', 'dismissed');
create type public.inquiry_status as enum ('new', 'read', 'replied', 'closed');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
