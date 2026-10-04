-- 027: protected business operations. Every critical state transition is one atomic function.
-- All are SECURITY DEFINER with an empty search_path; each re-checks the caller itself, locks
-- the rows it changes, and writes a notification + audit entry in the same transaction.
-- Clients must call these instead of issuing multi-step UPDATEs.

-- ===========================================================================================
-- Rental applications
-- ===========================================================================================

-- Approve -> PENDING tenancy + RESERVED unit. Occupancy starts at confirm_move_in().
create or replace function public.approve_rental_application(p_application_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_app public.rental_applications;
  v_unit public.units;
  v_landlord uuid;
  v_tenant_user uuid;
  v_tenancy uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_app from public.rental_applications where id = p_application_id for update;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;

  -- Locking the unit serialises concurrent approvals/invitations for the same unit.
  select * into v_unit from public.units where id = v_app.unit_id for update;

  if not (public.is_admin() or public.owns_property(v_unit.property_id)) then
    raise exception 'not allowed to approve applications for this unit' using errcode = '42501';
  end if;
  if v_app.status <> 'pending' then
    raise exception 'application is not pending (status: %)', v_app.status using errcode = '22023';
  end if;
  if v_unit.status <> 'vacant' then
    raise exception 'unit is not available (status: %)', v_unit.status using errcode = '22023';
  end if;
  if exists (
    select 1 from public.tenancies t where t.unit_id = v_unit.id and t.status in ('pending', 'active')
  ) then
    raise exception 'unit already has an open tenancy' using errcode = '23505';
  end if;

  select pr.landlord_id into v_landlord from public.properties pr where pr.id = v_unit.property_id;

  insert into public.tenancies
    (tenant_id, unit_id, landlord_id, start_date, monthly_rent, security_deposit, currency, status)
  values
    (v_app.tenant_id, v_unit.id, v_landlord,
     coalesce(v_app.desired_move_in_date, v_unit.available_from, current_date),
     v_unit.monthly_rent, v_unit.security_deposit, v_unit.currency, 'pending')
  returning id into v_tenancy;

  update public.rental_applications
     set status = 'approved', reviewed_by = v_uid, reviewed_at = now(), rejection_reason = null
   where id = v_app.id;

  update public.units set status = 'reserved' where id = v_unit.id;

  select tp.user_id into v_tenant_user from public.tenant_profiles tp where tp.id = v_app.tenant_id;
  perform public.notify_user(v_tenant_user, 'application_approved', 'Application approved',
    'Your rental application for unit ' || v_unit.unit_number || ' was approved.',
    jsonb_build_object('application_id', v_app.id, 'tenancy_id', v_tenancy, 'unit_id', v_unit.id));
  perform public.write_audit_log('application_approved', 'rental_application', v_app.id,
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'approved'),
    jsonb_build_object('tenancy_id', v_tenancy, 'unit_id', v_unit.id));
  perform public.write_audit_log('tenancy_created', 'tenancy', v_tenancy, null,
    jsonb_build_object('status', 'pending', 'unit_id', v_unit.id, 'tenant_id', v_app.tenant_id),
    jsonb_build_object('source', 'application'));

  return v_tenancy;
end;
$$;

create or replace function public.reject_rental_application(p_application_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_app public.rental_applications;
  v_property uuid;
  v_tenant_user uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'a rejection reason is required' using errcode = '22023';
  end if;

  select * into v_app from public.rental_applications where id = p_application_id for update;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  select u.property_id into v_property from public.units u where u.id = v_app.unit_id;

  if not (public.is_admin() or public.owns_property(v_property)) then
    raise exception 'not allowed to reject applications for this unit' using errcode = '42501';
  end if;
  if v_app.status <> 'pending' then
    raise exception 'application is not pending (status: %)', v_app.status using errcode = '22023';
  end if;

  update public.rental_applications
     set status = 'rejected', reviewed_by = v_uid, reviewed_at = now(), rejection_reason = btrim(p_reason)
   where id = v_app.id;

  select tp.user_id into v_tenant_user from public.tenant_profiles tp where tp.id = v_app.tenant_id;
  perform public.notify_user(v_tenant_user, 'application_rejected', 'Application not successful',
    btrim(p_reason), jsonb_build_object('application_id', v_app.id));
  perform public.write_audit_log('application_rejected', 'rental_application', v_app.id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'rejected', 'reason', btrim(p_reason)));
end;
$$;

-- ===========================================================================================
-- Tenancy lifecycle
-- ===========================================================================================

-- Pending tenancy -> ACTIVE, unit reserved -> OCCUPIED.
create or replace function public.confirm_move_in(p_tenancy_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_t public.tenancies;
  v_unit public.units;
  v_tenant_user uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_t from public.tenancies where id = p_tenancy_id for update;
  if not found then
    raise exception 'tenancy not found' using errcode = 'P0002';
  end if;
  select * into v_unit from public.units where id = v_t.unit_id for update;

  if not (public.is_admin() or public.owns_tenancy(v_t.id)) then
    raise exception 'not allowed to confirm this move-in' using errcode = '42501';
  end if;
  if v_t.status <> 'pending' then
    raise exception 'tenancy is not pending (status: %)', v_t.status using errcode = '22023';
  end if;
  if v_unit.status <> 'reserved' then
    raise exception 'unit is not reserved (status: %)', v_unit.status using errcode = '22023';
  end if;

  update public.tenancies
     set status = 'active', start_date = least(start_date, current_date)
   where id = v_t.id;
  update public.units set status = 'occupied' where id = v_unit.id;

  select tp.user_id into v_tenant_user from public.tenant_profiles tp where tp.id = v_t.tenant_id;
  perform public.notify_user(v_tenant_user, 'tenancy_started', 'Your tenancy has started',
    'Welcome to unit ' || v_unit.unit_number || '.',
    jsonb_build_object('tenancy_id', v_t.id, 'unit_id', v_unit.id));
  perform public.write_audit_log('tenancy_started', 'tenancy', v_t.id,
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'active'));
end;
$$;

-- Pending tenancy -> CANCELLED, unit released back to vacant.
create or replace function public.cancel_pending_tenancy(p_tenancy_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_t public.tenancies;
  v_tenant_user uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_t from public.tenancies where id = p_tenancy_id for update;
  if not found then
    raise exception 'tenancy not found' using errcode = 'P0002';
  end if;
  perform 1 from public.units where id = v_t.unit_id for update;

  if not (public.is_admin() or public.owns_tenancy(v_t.id)) then
    raise exception 'not allowed to cancel this tenancy' using errcode = '42501';
  end if;
  if v_t.status <> 'pending' then
    raise exception 'only a pending tenancy can be cancelled (status: %)', v_t.status
      using errcode = '22023';
  end if;

  update public.tenancies
     set status = 'cancelled', end_date = start_date, move_out_notes = p_reason
   where id = v_t.id;
  update public.units set status = 'vacant' where id = v_t.unit_id and status = 'reserved';

  select tp.user_id into v_tenant_user from public.tenant_profiles tp where tp.id = v_t.tenant_id;
  perform public.notify_user(v_tenant_user, 'tenancy_cancelled', 'Reservation cancelled',
    p_reason, jsonb_build_object('tenancy_id', v_t.id));
  perform public.write_audit_log('tenancy_cancelled', 'tenancy', v_t.id,
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'cancelled'));
end;
$$;

-- ACTIVE tenancy -> ENDED. History (tenancy, payments, maintenance) is preserved; the unit
-- becomes vacant again; the tenant account is untouched.
create or replace function public.end_tenancy(p_tenancy_id uuid, p_end_date date, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_t public.tenancies;
  v_tenant_user uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_t from public.tenancies where id = p_tenancy_id for update;
  if not found then
    raise exception 'tenancy not found' using errcode = 'P0002';
  end if;
  perform 1 from public.units where id = v_t.unit_id for update;

  if not (public.is_admin() or public.owns_tenancy(v_t.id)) then
    raise exception 'not allowed to end this tenancy' using errcode = '42501';
  end if;
  if v_t.status <> 'active' then
    raise exception 'only an active tenancy can be ended (status: %)', v_t.status
      using errcode = '22023';
  end if;
  if p_end_date is null or p_end_date < v_t.start_date or p_end_date > current_date then
    raise exception 'end date must be between the tenancy start date and today' using errcode = '22023';
  end if;

  update public.tenancies
     set status = 'ended', end_date = p_end_date, move_out_notes = p_notes
   where id = v_t.id;
  update public.units set status = 'vacant', available_from = p_end_date
   where id = v_t.unit_id and status = 'occupied';
  update public.leases set status = 'terminated'
   where tenancy_id = v_t.id and status in ('draft', 'pending_signature', 'active');

  select tp.user_id into v_tenant_user from public.tenant_profiles tp where tp.id = v_t.tenant_id;
  perform public.notify_user(v_tenant_user, 'tenancy_ended', 'Your tenancy has ended',
    p_notes, jsonb_build_object('tenancy_id', v_t.id, 'end_date', p_end_date));
  perform public.write_audit_log('tenancy_ended', 'tenancy', v_t.id,
    jsonb_build_object('status', 'active'),
    jsonb_build_object('status', 'ended', 'end_date', p_end_date));
end;
$$;

-- ===========================================================================================
-- Invitations
-- ===========================================================================================

-- Returns the RAW token exactly once; only its SHA-256 hash is stored.
create or replace function public.create_tenant_invitation(
  p_unit_id uuid,
  p_email text default null,
  p_phone text default null,
  p_ttl interval default interval '7 days'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_landlord uuid := public.my_landlord_profile_id();
  v_unit public.units;
  v_token text;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if v_landlord is null then
    raise exception 'only landlords can invite tenants' using errcode = '42501';
  end if;
  if (p_email is null or btrim(p_email) = '') and (p_phone is null or btrim(p_phone) = '') then
    raise exception 'an email or phone number is required' using errcode = '22023';
  end if;
  if p_ttl is null or p_ttl <= interval '0' or p_ttl > interval '30 days' then
    raise exception 'invitation lifetime must be between 0 and 30 days' using errcode = '22023';
  end if;

  select * into v_unit from public.units where id = p_unit_id;
  -- Same error for "missing" and "not yours": do not reveal other landlords' units.
  if not found or not public.owns_property(v_unit.property_id) then
    raise exception 'unit not found' using errcode = 'P0002';
  end if;
  if v_unit.status <> 'vacant' then
    raise exception 'unit is not vacant (status: %)', v_unit.status using errcode = '22023';
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

  insert into public.tenant_invitations
    (landlord_id, property_id, unit_id, invitee_email, invitee_phone, token_hash, expires_at)
  values
    (v_landlord, v_unit.property_id, v_unit.id,
     nullif(lower(btrim(p_email)), ''), nullif(btrim(p_phone), ''),
     encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), now() + p_ttl)
  returning id into v_id;

  perform public.write_audit_log('invitation_created', 'tenant_invitation', v_id, null,
    jsonb_build_object('unit_id', v_unit.id), jsonb_build_object('expires_in', p_ttl::text));

  return v_token;
end;
$$;

create or replace function public.revoke_tenant_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.tenant_invitations;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select * into v_inv from public.tenant_invitations where id = p_invitation_id for update;
  if not found or not (public.is_admin() or public.owns_property(v_inv.property_id)) then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'invitation is not pending (status: %)', v_inv.status using errcode = '22023';
  end if;
  update public.tenant_invitations set status = 'revoked' where id = v_inv.id;
  perform public.write_audit_log('invitation_revoked', 'tenant_invitation', v_inv.id);
end;
$$;

-- Redeems a token for the CALLING tenant. The token is the only input; unit/landlord/property
-- are read from the stored invitation, so nothing can be forged by the caller.
create or replace function public.accept_tenant_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid := public.my_tenant_profile_id();
  v_profile public.profiles;
  v_inv public.tenant_invitations;
  v_unit public.units;
  v_owner uuid;
  v_tenancy uuid;
  v_landlord_user uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if v_tenant is null then
    raise exception 'only tenant accounts can accept invitations' using errcode = '42501';
  end if;
  if p_token is null or length(p_token) < 20 then
    raise exception 'invalid or expired invitation' using errcode = 'P0002';
  end if;

  select * into v_inv from public.tenant_invitations
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
   for update;
  -- One generic message for unknown / used / revoked / expired tokens.
  if not found or v_inv.status <> 'pending' or v_inv.expires_at <= now() then
    raise exception 'invalid or expired invitation' using errcode = 'P0002';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if v_inv.invitee_email is not null then
    if v_profile.email is null or lower(v_profile.email) <> lower(v_inv.invitee_email) then
      raise exception 'this invitation was issued to a different account' using errcode = '42501';
    end if;
  elsif regexp_replace(coalesce(v_profile.phone, ''), '\D', '', 'g')
        <> regexp_replace(coalesce(v_inv.invitee_phone, ''), '\D', '', 'g')
     or regexp_replace(coalesce(v_inv.invitee_phone, ''), '\D', '', 'g') = '' then
    raise exception 'this invitation was issued to a different account' using errcode = '42501';
  end if;

  select * into v_unit from public.units where id = v_inv.unit_id for update;
  select pr.landlord_id into v_owner from public.properties pr where pr.id = v_unit.property_id;
  if v_unit.property_id <> v_inv.property_id or v_owner <> v_inv.landlord_id then
    raise exception 'invitation no longer matches the unit owner' using errcode = '23514';
  end if;
  if v_unit.status <> 'vacant' then
    raise exception 'unit is no longer available' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.tenancies t where t.unit_id = v_unit.id and t.status in ('pending', 'active')
  ) then
    raise exception 'unit already has an open tenancy' using errcode = '23505';
  end if;

  insert into public.tenancies
    (tenant_id, unit_id, landlord_id, start_date, monthly_rent, security_deposit, currency, status)
  values
    (v_tenant, v_unit.id, v_inv.landlord_id, current_date,
     v_unit.monthly_rent, v_unit.security_deposit, v_unit.currency, 'active')
  returning id into v_tenancy;

  update public.units set status = 'occupied' where id = v_unit.id;
  update public.tenant_invitations
     set status = 'accepted', accepted_at = now(), accepted_by_tenant_id = v_tenant
   where id = v_inv.id;
  -- Any other outstanding invitation for the same unit is now moot.
  update public.tenant_invitations set status = 'revoked'
   where unit_id = v_unit.id and status = 'pending' and id <> v_inv.id;

  select lp.user_id into v_landlord_user from public.landlord_profiles lp where lp.id = v_inv.landlord_id;
  perform public.notify_user(v_uid, 'tenancy_started', 'Your tenancy has started',
    'You are now the tenant of unit ' || v_unit.unit_number || '.',
    jsonb_build_object('tenancy_id', v_tenancy, 'unit_id', v_unit.id));
  perform public.notify_user(v_landlord_user, 'invitation_accepted', 'Invitation accepted',
    v_profile.full_name || ' accepted your invitation for unit ' || v_unit.unit_number || '.',
    jsonb_build_object('tenancy_id', v_tenancy, 'invitation_id', v_inv.id));
  perform public.write_audit_log('invitation_accepted', 'tenant_invitation', v_inv.id,
    jsonb_build_object('status', 'pending'), jsonb_build_object('status', 'accepted'),
    jsonb_build_object('tenancy_id', v_tenancy));
  perform public.write_audit_log('tenancy_created', 'tenancy', v_tenancy, null,
    jsonb_build_object('status', 'active', 'unit_id', v_unit.id, 'tenant_id', v_tenant),
    jsonb_build_object('source', 'invitation'));

  return v_tenancy;
end;
$$;

-- ===========================================================================================
-- Property verification (landlord prepares/submits, ONLY an admin decides)
-- ===========================================================================================

create or replace function public.start_property_verification(p_property_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_landlord uuid := public.my_landlord_profile_id();
  v_prop public.properties;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select * into v_prop from public.properties where id = p_property_id;
  if not found or v_landlord is null or v_prop.landlord_id <> v_landlord then
    raise exception 'property not found' using errcode = 'P0002';
  end if;
  if v_prop.status in ('suspended', 'archived') or v_prop.verification_status in ('verified', 'suspended') then
    raise exception 'property cannot be (re)verified in its current state' using errcode = '22023';
  end if;

  select id into v_id from public.property_verification_requests
   where property_id = p_property_id and status = 'draft';
  if v_id is not null then
    return v_id;
  end if;
  if exists (
    select 1 from public.property_verification_requests
    where property_id = p_property_id and status in ('submitted', 'under_review')
  ) then
    raise exception 'a verification request is already in review' using errcode = '23505';
  end if;

  insert into public.property_verification_requests (property_id, submitted_by_landlord_id, status)
  values (p_property_id, v_landlord, 'draft')
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.submit_property_verification(p_property_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_landlord uuid := public.my_landlord_profile_id();
  v_prop public.properties;
  v_req public.property_verification_requests;
  v_missing text;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select * into v_prop from public.properties where id = p_property_id for update;
  if not found or v_landlord is null or v_prop.landlord_id <> v_landlord then
    raise exception 'property not found' using errcode = 'P0002';
  end if;

  select * into v_req from public.property_verification_requests
   where property_id = p_property_id and status = 'draft' for update;
  if not found then
    raise exception 'no draft verification request: start one and upload documents first'
      using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.property_verification_documents d where d.verification_request_id = v_req.id
  ) then
    raise exception 'upload at least one verification document before submitting' using errcode = '22023';
  end if;
  select string_agg(t.code, ', ') into v_missing
  from public.verification_document_types t
  where t.is_required and not exists (
    select 1 from public.property_verification_documents d
    where d.verification_request_id = v_req.id and d.document_type = t.code
  );
  if v_missing is not null then
    raise exception 'missing required documents: %', v_missing using errcode = '22023';
  end if;

  update public.property_verification_requests
     set status = 'submitted', submitted_at = now()
   where id = v_req.id;
  update public.properties set verification_status = 'pending' where id = p_property_id;

  insert into public.notifications (user_id, type, title, body, data)
  select p.id, 'verification_submitted', 'Property awaiting verification', v_prop.name,
         jsonb_build_object('request_id', v_req.id, 'property_id', p_property_id)
  from public.profiles p where p.role = 'admin' and p.status = 'active';

  perform public.write_audit_log('property_submitted_for_verification', 'property', p_property_id,
    jsonb_build_object('verification_status', v_prop.verification_status),
    jsonb_build_object('verification_status', 'pending'),
    jsonb_build_object('request_id', v_req.id));
  return v_req.id;
end;
$$;

create or replace function public.withdraw_property_verification(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.property_verification_requests;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select * into v_req from public.property_verification_requests where id = p_request_id for update;
  if not found or v_req.submitted_by_landlord_id is distinct from public.my_landlord_profile_id() then
    raise exception 'verification request not found' using errcode = 'P0002';
  end if;
  if v_req.status not in ('draft', 'submitted', 'under_review') then
    raise exception 'request can no longer be withdrawn (status: %)', v_req.status using errcode = '22023';
  end if;
  update public.property_verification_requests set status = 'withdrawn' where id = v_req.id;
  update public.properties set verification_status = 'unverified'
   where id = v_req.property_id and verification_status in ('pending', 'under_review');
  perform public.write_audit_log('property_verification_withdrawn', 'property', v_req.property_id);
end;
$$;

create or replace function public.review_property_verification(
  p_request_id uuid,
  p_decision text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.property_verification_requests;
  v_prop public.properties;
  v_landlord_user uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.is_admin() then
    raise exception 'only platform administrators can review verification requests' using errcode = '42501';
  end if;
  if p_decision not in ('under_review', 'approved', 'rejected') then
    raise exception 'decision must be under_review, approved or rejected' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and (p_reason is null or length(btrim(p_reason)) = 0) then
    raise exception 'a rejection reason is required' using errcode = '22023';
  end if;

  select * into v_req from public.property_verification_requests where id = p_request_id for update;
  if not found then
    raise exception 'verification request not found' using errcode = 'P0002';
  end if;
  if v_req.status not in ('submitted', 'under_review') then
    raise exception 'request is not awaiting review (status: %)', v_req.status using errcode = '22023';
  end if;
  select * into v_prop from public.properties where id = v_req.property_id for update;

  if p_decision = 'under_review' then
    update public.property_verification_requests
       set status = 'under_review', reviewed_by_admin_id = v_uid where id = v_req.id;
    update public.properties set verification_status = 'under_review' where id = v_prop.id;
    perform public.write_audit_log('property_verification_started', 'property', v_prop.id);
    return;
  end if;

  update public.property_verification_requests
     set status = p_decision::public.verification_request_status,
         reviewed_by_admin_id = v_uid, reviewed_at = now(),
         rejection_reason = case when p_decision = 'rejected' then btrim(p_reason) end,
         admin_notes = coalesce(nullif(btrim(p_reason), ''), admin_notes)
   where id = v_req.id;

  if p_decision = 'approved' then
    update public.properties set verification_status = 'verified' where id = v_prop.id;
    update public.property_verification_documents
       set status = 'approved', reviewed_by_admin_id = v_uid, reviewed_at = now()
     where verification_request_id = v_req.id and status = 'pending';
  else
    update public.properties set verification_status = 'rejected' where id = v_prop.id;
  end if;

  select lp.user_id into v_landlord_user
  from public.landlord_profiles lp where lp.id = v_req.submitted_by_landlord_id;
  perform public.notify_user(v_landlord_user,
    case when p_decision = 'approved' then 'verification_approved' else 'verification_rejected' end,
    case when p_decision = 'approved' then 'Property verified' else 'Verification rejected' end,
    case when p_decision = 'approved' then v_prop.name else btrim(p_reason) end,
    jsonb_build_object('request_id', v_req.id, 'property_id', v_prop.id));
  perform public.write_audit_log(
    case when p_decision = 'approved' then 'property_verified' else 'property_rejected' end,
    'property', v_prop.id,
    jsonb_build_object('verification_status', v_prop.verification_status),
    jsonb_build_object('verification_status',
      case when p_decision = 'approved' then 'verified' else 'rejected' end),
    jsonb_build_object('request_id', v_req.id, 'reason', p_reason));
end;
$$;

-- ===========================================================================================
-- Payments
-- ===========================================================================================

-- Landlord (or admin) records money received outside the platform. The charge status is kept
-- in sync by the payments trigger (028).
create or replace function public.record_manual_payment(
  p_charge_id uuid,
  p_amount numeric,
  p_method text default 'cash'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_charge public.rent_charges;
  v_tenancy public.tenancies;
  v_paid numeric(12, 2);
  v_payment uuid;
  v_tenant_user uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select * into v_charge from public.rent_charges where id = p_charge_id for update;
  if not found then
    raise exception 'charge not found' using errcode = 'P0002';
  end if;
  select * into v_tenancy from public.tenancies where id = v_charge.tenancy_id;
  if not (public.is_admin() or public.owns_tenancy(v_tenancy.id)) then
    raise exception 'not allowed to record payments for this tenancy' using errcode = '42501';
  end if;
  if v_charge.status in ('paid', 'cancelled') then
    raise exception 'charge is already %', v_charge.status using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments where rent_charge_id = v_charge.id and status = 'successful';
  if v_paid + p_amount > v_charge.amount then
    raise exception 'payment exceeds the outstanding balance of %', v_charge.amount - v_paid
      using errcode = '22023';
  end if;

  insert into public.payments
    (tenancy_id, rent_charge_id, tenant_id, amount, currency, payment_method, provider, status, paid_at, metadata)
  values
    (v_tenancy.id, v_charge.id, v_tenancy.tenant_id, p_amount, v_charge.currency,
     coalesce(nullif(btrim(p_method), ''), 'cash'), 'manual', 'successful', now(),
     jsonb_build_object('recorded_by', v_uid))
  returning id into v_payment;

  select tp.user_id into v_tenant_user from public.tenant_profiles tp where tp.id = v_tenancy.tenant_id;
  perform public.notify_user(v_tenant_user, 'payment_successful', 'Payment received',
    'A payment of ' || p_amount || ' ' || v_charge.currency || ' was recorded.',
    jsonb_build_object('payment_id', v_payment, 'charge_id', v_charge.id));
  perform public.write_audit_log('payment_recorded', 'payment', v_payment, null,
    jsonb_build_object('amount', p_amount, 'charge_id', v_charge.id));
  return v_payment;
end;
$$;

-- Scheduled/cron (service role): pending charges past their due date become overdue.
create or replace function public.mark_overdue_charges()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.rent_charges set status = 'overdue'
   where status in ('pending', 'partially_paid') and due_date < current_date;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ===========================================================================================
-- Notices & messaging
-- ===========================================================================================

-- Audience precedence: one tenant > one unit > whole property > (admin only) everyone.
create or replace function public.send_notice(
  p_title text,
  p_body text,
  p_property_id uuid default null,
  p_unit_id uuid default null,
  p_tenant_id uuid default null,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_notice uuid;
  v_unit public.units;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not (public.is_admin() or public.is_landlord()) then
    raise exception 'only landlords and admins can send notices' using errcode = '42501';
  end if;
  if p_title is null or btrim(p_title) = '' or p_body is null or btrim(p_body) = '' then
    raise exception 'title and body are required' using errcode = '22023';
  end if;

  if p_tenant_id is not null then
    if not (public.is_admin() or public.landlord_has_tenant(p_tenant_id)) then
      raise exception 'tenant not found' using errcode = 'P0002';
    end if;
  elsif p_unit_id is not null then
    select * into v_unit from public.units where id = p_unit_id;
    if not found or not (public.is_admin() or public.owns_property(v_unit.property_id)) then
      raise exception 'unit not found' using errcode = 'P0002';
    end if;
    p_property_id := v_unit.property_id;
  elsif p_property_id is not null then
    if not (public.is_admin() or public.owns_property(p_property_id)) then
      raise exception 'property not found' using errcode = 'P0002';
    end if;
  elsif not public.is_admin() then
    raise exception 'choose a tenant, unit or property' using errcode = '22023';
  end if;

  insert into public.notices (created_by, property_id, unit_id, title, body, expires_at)
  values (v_uid, p_property_id, p_unit_id, btrim(p_title), p_body, p_expires_at)
  returning id into v_notice;

  insert into public.notice_recipients (notice_id, tenant_id)
  select distinct v_notice, t.tenant_id
  from public.tenancies t
  join public.units u on u.id = t.unit_id
  where t.status = 'active'
    and case
      when p_tenant_id is not null then t.tenant_id = p_tenant_id
      when p_unit_id is not null then t.unit_id = p_unit_id
      when p_property_id is not null then u.property_id = p_property_id
      else true
    end
    and (public.is_admin() or t.landlord_id = public.my_landlord_profile_id());
  get diagnostics v_count = row_count;
  -- A direct notice to a past tenant is still deliverable.
  if v_count = 0 and p_tenant_id is not null then
    insert into public.notice_recipients (notice_id, tenant_id) values (v_notice, p_tenant_id);
    v_count := 1;
  end if;
  if v_count = 0 then
    raise exception 'notice has no recipients' using errcode = '22023';
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  select tp.user_id, 'notice', btrim(p_title), left(p_body, 200), jsonb_build_object('notice_id', v_notice)
  from public.notice_recipients r join public.tenant_profiles tp on tp.id = r.tenant_id
  where r.notice_id = v_notice;

  perform public.write_audit_log('notice_sent', 'notice', v_notice, null, null,
    jsonb_build_object('recipients', v_count));
  return v_notice;
end;
$$;

-- Starts (or reuses) a conversation between the caller and one other user. Allowed pairs:
-- tenant<->landlord who share a tenancy/application, or any pair involving an admin.
create or replace function public.start_conversation(
  p_recipient_user_id uuid,
  p_first_message text,
  p_property_id uuid default null,
  p_unit_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ok boolean := false;
  v_conv uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if p_recipient_user_id is null or p_recipient_user_id = v_uid then
    raise exception 'choose another user to message' using errcode = '22023';
  end if;
  if p_first_message is null or btrim(p_first_message) = '' then
    raise exception 'message body is required' using errcode = '22023';
  end if;

  if public.is_admin() then
    v_ok := exists (select 1 from public.profiles where id = p_recipient_user_id);
  elsif public.is_landlord() then
    v_ok := public.landlord_has_tenant_user(p_recipient_user_id);
  elsif public.is_tenant() then
    v_ok := public.tenant_has_landlord_user(p_recipient_user_id);
  end if;
  if not v_ok then
    raise exception 'you cannot message this user' using errcode = '42501';
  end if;

  select c.id into v_conv
  from public.conversations c
  where c.property_id is not distinct from p_property_id
    and c.unit_id is not distinct from p_unit_id
    and exists (select 1 from public.conversation_participants a where a.conversation_id = c.id and a.user_id = v_uid)
    and exists (select 1 from public.conversation_participants b where b.conversation_id = c.id and b.user_id = p_recipient_user_id)
    and (select count(*) from public.conversation_participants x where x.conversation_id = c.id) = 2
  limit 1;

  if v_conv is null then
    insert into public.conversations (property_id, unit_id) values (p_property_id, p_unit_id)
    returning id into v_conv;
    insert into public.conversation_participants (conversation_id, user_id)
    values (v_conv, v_uid), (v_conv, p_recipient_user_id);
  end if;

  insert into public.messages (conversation_id, sender_id, body) values (v_conv, v_uid, btrim(p_first_message));
  update public.conversations set updated_at = now() where id = v_conv;
  perform public.notify_user(p_recipient_user_id, 'message', 'New message', left(p_first_message, 120),
    jsonb_build_object('conversation_id', v_conv));
  return v_conv;
end;
$$;

-- ===========================================================================================
-- Admin moderation
-- ===========================================================================================

create or replace function public.admin_set_user_status(
  p_user_id uuid,
  p_status public.user_status,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_old public.user_status;
begin
  if not public.is_admin() then
    raise exception 'administrators only' using errcode = '42501';
  end if;
  if p_user_id = v_uid then
    raise exception 'administrators cannot change their own status' using errcode = '22023';
  end if;
  select status into v_old from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  update public.profiles set status = p_status where id = p_user_id;
  perform public.write_audit_log(
    case when p_status = 'suspended' then 'user_suspended' else 'user_status_changed' end,
    'profile', p_user_id,
    jsonb_build_object('status', v_old), jsonb_build_object('status', p_status),
    jsonb_build_object('reason', p_reason));
end;
$$;

create or replace function public.admin_set_landlord_verification(
  p_landlord_id uuid,
  p_status public.verification_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.verification_status;
begin
  if not public.is_admin() then
    raise exception 'administrators only' using errcode = '42501';
  end if;
  select verification_status into v_old from public.landlord_profiles where id = p_landlord_id for update;
  if not found then
    raise exception 'landlord not found' using errcode = 'P0002';
  end if;
  update public.landlord_profiles set verification_status = p_status where id = p_landlord_id;
  perform public.write_audit_log('landlord_verification_changed', 'landlord_profile', p_landlord_id,
    jsonb_build_object('verification_status', v_old), jsonb_build_object('verification_status', p_status));
end;
$$;

-- Suspend or restore a property listing (suspension also pulls it from public view).
create or replace function public.admin_set_property_status(
  p_property_id uuid,
  p_status public.property_status,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.properties;
  v_landlord_user uuid;
begin
  if not public.is_admin() then
    raise exception 'administrators only' using errcode = '42501';
  end if;
  select * into v_old from public.properties where id = p_property_id for update;
  if not found then
    raise exception 'property not found' using errcode = 'P0002';
  end if;
  update public.properties
     set status = p_status,
         verification_status = case when p_status = 'suspended' then 'suspended'
                                    when v_old.verification_status = 'suspended' then 'unverified'
                                    else verification_status end
   where id = p_property_id;

  select lp.user_id into v_landlord_user from public.landlord_profiles lp where lp.id = v_old.landlord_id;
  perform public.notify_user(v_landlord_user, 'property_status_changed',
    'Property ' || p_status::text, p_reason, jsonb_build_object('property_id', p_property_id));
  perform public.write_audit_log('property_status_changed', 'property', p_property_id,
    jsonb_build_object('status', v_old.status, 'verification_status', v_old.verification_status),
    jsonb_build_object('status', p_status), jsonb_build_object('reason', p_reason));
end;
$$;

-- ===========================================================================================
-- Privileges: callable by signed-in users (each function authorises the caller itself).
-- ===========================================================================================
do $$
declare
  f text;
begin
  foreach f in array array[
    'approve_rental_application(uuid)', 'reject_rental_application(uuid, text)',
    'confirm_move_in(uuid)', 'cancel_pending_tenancy(uuid, text)', 'end_tenancy(uuid, date, text)',
    'create_tenant_invitation(uuid, text, text, interval)', 'revoke_tenant_invitation(uuid)',
    'accept_tenant_invitation(text)',
    'start_property_verification(uuid)', 'submit_property_verification(uuid)',
    'withdraw_property_verification(uuid)', 'review_property_verification(uuid, text, text)',
    'record_manual_payment(uuid, numeric, text)',
    'send_notice(text, text, uuid, uuid, uuid, timestamptz)',
    'start_conversation(uuid, text, uuid, uuid)',
    'admin_set_user_status(uuid, public.user_status, text)',
    'admin_set_landlord_verification(uuid, public.verification_status)',
    'admin_set_property_status(uuid, public.property_status, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

revoke all on function public.mark_overdue_charges() from public, anon, authenticated;
grant execute on function public.mark_overdue_charges() to service_role;
