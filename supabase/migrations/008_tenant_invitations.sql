-- 008: landlord -> tenant invitations. Only a SHA-256 hash of the token is stored.
-- Rows are created by create_tenant_invitation() and redeemed by accept_tenant_invitation().

create table public.tenant_invitations (
  id                      uuid primary key default gen_random_uuid(),
  landlord_id             uuid not null references public.landlord_profiles (id) on delete cascade,
  property_id             uuid not null references public.properties (id) on delete cascade,
  unit_id                 uuid not null references public.units (id) on delete cascade,
  invitee_email           text,
  invitee_phone           text,
  token_hash              text not null,
  status                  public.invitation_status not null default 'pending',
  expires_at              timestamptz not null,
  accepted_at             timestamptz,
  accepted_by_tenant_id   uuid references public.tenant_profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  constraint tenant_invitations_token_hash_key unique (token_hash),
  constraint tenant_invitations_contact_check
    check (invitee_email is not null or invitee_phone is not null),
  constraint tenant_invitations_accept_check
    check ((status = 'accepted') = (accepted_at is not null))
);

create index tenant_invitations_landlord_idx on public.tenant_invitations (landlord_id);
create index tenant_invitations_property_idx on public.tenant_invitations (property_id);
create index tenant_invitations_unit_idx on public.tenant_invitations (unit_id);
create index tenant_invitations_tenant_idx on public.tenant_invitations (accepted_by_tenant_id);
create index tenant_invitations_email_idx on public.tenant_invitations (lower(invitee_email));

-- property_id and landlord_id must agree with the unit's real owner; a client can never
-- forge an invitation for somebody else's unit by passing arbitrary ids.
create or replace function public.check_invitation_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_property uuid;
  v_landlord uuid;
begin
  select u.property_id, p.landlord_id into v_property, v_landlord
  from public.units u join public.properties p on p.id = u.property_id
  where u.id = new.unit_id;

  if v_property is distinct from new.property_id or v_landlord is distinct from new.landlord_id then
    raise exception 'invitation unit/property/landlord mismatch' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.check_invitation_consistency() from public, anon, authenticated;

create trigger tenant_invitations_consistency
  before insert or update of unit_id, property_id, landlord_id on public.tenant_invitations
  for each row execute function public.check_invitation_consistency();
