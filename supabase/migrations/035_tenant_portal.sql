-- 035: tenant portal.
--
--   * maintenance tickets: extends maintenance_requests (category + a timeline of updates, comments and status changes)
--   * vacate notices: a tenant's formal intent to move out, tracked through acknowledgement, inspection and deposit refund
--   * announcement categories (general / maintenance / urgent) on notices
--   * what a tenant may see about their own home: pending link requests, property contacts, payment instructions
--
-- "Lease" in the product language is a tenancy here (tenant -> tenancy -> unit -> property -> landlord); vacate notices
-- therefore hang off tenancies. Caretakers (read-only elsewhere) can handle maintenance tickets: that is their job.

-- ===========================================================================================
-- Helpers
-- ===========================================================================================

-- The caller has a pending or active tenancy in this property.
create or replace function public.is_tenant_at_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tenancies t
    join public.tenant_profiles tp on tp.id = t.tenant_id
    join public.units u on u.id = t.unit_id
    where u.property_id = p_property_id and tp.user_id = auth.uid() and t.status in ('pending', 'active')
  )
$$;

-- Owner, assigned property manager OR assigned caretaker may work a unit's maintenance tickets.
create or replace function public.can_handle_maintenance(p_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select public.owns_property(u.property_id) or public.is_property_staff(u.property_id, array['caretaker'])
    from public.units u where u.id = p_unit_id
  ), false)
$$;

-- How the caller relates to a unit's property, for labelling timeline entries.
create or replace function public.maintenance_actor_role(p_unit_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_admin() then 'admin'
    when (select public.is_property_owner(u.property_id) from public.units u where u.id = p_unit_id) then 'landlord'
    when (select public.is_property_staff(u.property_id, array['property_manager']) from public.units u where u.id = p_unit_id) then 'manager'
    when (select public.is_property_staff(u.property_id, array['caretaker']) from public.units u where u.id = p_unit_id) then 'caretaker'
    else null
  end
$$;

-- Owner + active staff of a property (who should hear about new tickets and notices). Internal.
create or replace function public.property_team_user_ids(p_property_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select lp.user_id
  from public.properties pr join public.landlord_profiles lp on lp.id = pr.landlord_id
  where pr.id = p_property_id
  union
  select s.user_id
  from public.property_staff s join public.profiles p on p.id = s.user_id
  where s.property_id = p_property_id and s.status = 'active' and p.status = 'active'
$$;
revoke all on function public.property_team_user_ids(uuid) from public, anon, authenticated;

revoke all on function public.is_tenant_at_property(uuid), public.can_handle_maintenance(uuid), public.maintenance_actor_role(uuid)
  from public, anon;
grant execute on function public.is_tenant_at_property(uuid), public.can_handle_maintenance(uuid), public.maintenance_actor_role(uuid)
  to authenticated, service_role;

-- ===========================================================================================
-- Notification categories: add maintenance
-- ===========================================================================================
alter table public.notification_preferences drop constraint if exists notification_preferences_muted_categories_check;
alter table public.notification_preferences add constraint notification_preferences_muted_categories_check
  check (muted_categories <@ array['announcements', 'billing', 'tenancy', 'maintenance', 'staff']::text[]);

create or replace function public.notification_category(p_type text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_type = 'notice' then 'announcements'
    when p_type in ('invoice_issued', 'payment_successful') then 'billing'
    when p_type in ('application_approved', 'application_rejected', 'invitation_accepted',
                    'link_request_accepted', 'link_request_received', 'link_request_rejected',
                    'tenancy_cancelled', 'tenancy_ended', 'tenancy_started', 'unit_link_requested',
                    'vacate_submitted', 'vacate_update') then 'tenancy'
    when p_type in ('maintenance_submitted', 'maintenance_update') then 'maintenance'
    when p_type in ('staff_joined', 'staff_removed') then 'staff'
    else 'other'
  end
$$;

-- ===========================================================================================
-- Maintenance tickets
-- ===========================================================================================
alter table public.maintenance_requests add column category text not null default 'general'
  check (category in ('plumbing', 'electrical', 'carpentry', 'general'));
create index maintenance_requests_status_idx on public.maintenance_requests (status, created_at desc);

create table public.maintenance_updates (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.maintenance_requests (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  author_role text not null check (author_role in ('tenant', 'landlord', 'manager', 'caretaker', 'admin')),
  kind        text not null check (kind in ('created', 'comment', 'status_change')),
  from_status public.maintenance_status,
  to_status   public.maintenance_status,
  message     text check (message is null or length(message) <= 4000),
  -- clock_timestamp(): entries written in one transaction still keep their order
  created_at  timestamptz not null default clock_timestamp(),
  constraint maintenance_updates_shape_check check (
    (kind = 'status_change' and to_status is not null)
    or (kind = 'comment' and message is not null)
    or kind = 'created'
  )
);
create index maintenance_updates_request_idx on public.maintenance_updates (request_id, created_at);

alter table public.maintenance_updates enable row level security;
-- Visible exactly when the parent ticket is visible to the caller (the subquery runs under the caller's RLS).
create policy maintenance_updates_select on public.maintenance_updates
  for select to authenticated using (exists (select 1 from public.maintenance_requests r where r.id = request_id));
revoke all on public.maintenance_updates from public, anon;
grant select on public.maintenance_updates to authenticated;
grant all on public.maintenance_updates to service_role;

-- Caretakers see (and, through the RPCs below, handle) tickets of the properties they are assigned to.
create policy maintenance_select_team on public.maintenance_requests
  for select to authenticated using (public.can_handle_maintenance(unit_id));

-- Tenant raises a ticket for their ACTIVE tenancy.
create or replace function public.submit_maintenance_ticket(
  p_tenancy_id uuid,
  p_title text,
  p_category text,
  p_priority text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid := public.my_tenant_profile_id();
  v_t public.tenancies;
  v_unit public.units;
  v_title text := btrim(coalesce(p_title, ''));
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
  v_id uuid;
  v_member uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if v_tenant is null then
    raise exception 'only tenants can submit maintenance tickets' using errcode = '42501';
  end if;
  select * into v_t from public.tenancies where id = p_tenancy_id and tenant_id = v_tenant and status = 'active';
  if not found then
    raise exception 'you can only submit tickets for your active tenancy' using errcode = 'P0002';
  end if;
  if length(v_title) < 3 or length(v_title) > 120 then
    raise exception 'the title must be 3 to 120 characters' using errcode = '22023';
  end if;
  if p_category is null or p_category not in ('plumbing', 'electrical', 'carpentry', 'general') then
    raise exception 'choose a category' using errcode = '22023';
  end if;
  if p_priority is null or p_priority not in ('low', 'medium', 'high') then
    raise exception 'choose a priority' using errcode = '22023';
  end if;
  if v_desc is not null and length(v_desc) > 4000 then
    raise exception 'the description is too long' using errcode = '22023';
  end if;
  if (select count(*) from public.maintenance_requests r
       where r.tenant_id = v_tenant and r.status in ('open', 'in_progress')) >= 20 then
    raise exception 'you have too many open tickets; wait for some to be resolved' using errcode = '22023';
  end if;

  select * into v_unit from public.units where id = v_t.unit_id;
  insert into public.maintenance_requests (tenant_id, unit_id, tenancy_id, title, description, priority, category)
  values (v_tenant, v_t.unit_id, v_t.id, v_title, v_desc, p_priority::public.maintenance_priority, p_category)
  returning id into v_id;

  insert into public.maintenance_updates (request_id, author_id, author_role, kind, to_status, message)
  values (v_id, v_uid, 'tenant', 'created', 'open', v_desc);

  for v_member in select * from public.property_team_user_ids(v_unit.property_id) loop
    perform public.notify_user(v_member, 'maintenance_submitted', 'New maintenance ticket',
      'Unit ' || v_unit.unit_number || ': ' || v_title,
      jsonb_build_object('request_id', v_id, 'unit_id', v_unit.id));
  end loop;
  perform public.write_audit_log('maintenance_submitted', 'maintenance_request', v_id, null,
    jsonb_build_object('category', p_category, 'priority', p_priority), '{}'::jsonb);
  return v_id;
end;
$$;

-- Staff (owner, property manager, caretaker) or admin: change status and/or post a message.
create or replace function public.update_maintenance_ticket(
  p_request_id uuid,
  p_status text default null,
  p_message text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_r public.maintenance_requests;
  v_role text;
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
  v_allowed text[];
  v_tenant_user uuid;
  v_title text;
  v_changed boolean := false;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select * into v_r from public.maintenance_requests where id = p_request_id for update;
  if not found or not (public.is_admin() or public.can_handle_maintenance(v_r.unit_id)) then
    raise exception 'ticket not found' using errcode = 'P0002';
  end if;
  if p_status is null and v_msg is null then
    raise exception 'choose a new status or write a message' using errcode = '22023';
  end if;
  if v_msg is not null and length(v_msg) > 4000 then
    raise exception 'the message is too long' using errcode = '22023';
  end if;
  v_role := public.maintenance_actor_role(v_r.unit_id);

  if p_status is not null and p_status <> v_r.status::text then
    if p_status not in ('open', 'in_progress', 'resolved', 'closed') then
      raise exception 'unknown status' using errcode = '22023';
    end if;
    v_allowed := case v_r.status::text
      when 'open' then array['in_progress', 'resolved', 'closed']
      when 'in_progress' then array['open', 'resolved', 'closed']
      when 'resolved' then array['in_progress', 'closed']
      else array[]::text[]
    end;
    if not (p_status = any (v_allowed)) then
      raise exception 'a % ticket cannot move to %', v_r.status, p_status using errcode = '22023';
    end if;
    update public.maintenance_requests
       set status = p_status::public.maintenance_status,
           resolved_at = case p_status
             when 'resolved' then now()
             when 'closed' then coalesce(v_r.resolved_at, now())
             else null end
     where id = v_r.id;
    insert into public.maintenance_updates (request_id, author_id, author_role, kind, from_status, to_status, message)
    values (v_r.id, v_uid, v_role, 'status_change', v_r.status, p_status::public.maintenance_status, v_msg);
    v_changed := true;
  elsif v_msg is not null then
    insert into public.maintenance_updates (request_id, author_id, author_role, kind, message)
    values (v_r.id, v_uid, v_role, 'comment', v_msg);
    v_changed := true;
  end if;
  if not v_changed then
    raise exception 'nothing to update' using errcode = '22023';
  end if;

  select tp.user_id into v_tenant_user from public.tenant_profiles tp where tp.id = v_r.tenant_id;
  v_title := v_r.title;
  perform public.notify_user(v_tenant_user, 'maintenance_update', 'Update on your ticket',
    '"' || v_title || '"' || case
      when p_status is not null and p_status <> v_r.status::text then ' is now ' || replace(p_status, '_', ' ') || '.'
      else ': ' || left(coalesce(v_msg, ''), 120) end,
    jsonb_build_object('request_id', v_r.id));
  perform public.write_audit_log('maintenance_updated', 'maintenance_request', v_r.id, null,
    jsonb_build_object('status', p_status), '{}'::jsonb);
end;
$$;

-- Tenant or staff adds a comment to a ticket.
create or replace function public.comment_on_maintenance_ticket(p_request_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_r public.maintenance_requests;
  v_msg text := btrim(coalesce(p_message, ''));
  v_unit public.units;
  v_member uuid;
  v_tenant_user uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if length(v_msg) < 1 or length(v_msg) > 4000 then
    raise exception 'write a message of up to 4000 characters' using errcode = '22023';
  end if;
  select * into v_r from public.maintenance_requests where id = p_request_id for update;
  if not found then
    raise exception 'ticket not found' using errcode = 'P0002';
  end if;
  select * into v_unit from public.units where id = v_r.unit_id;

  if v_r.tenant_id = public.my_tenant_profile_id() then
    if v_r.status::text in ('closed', 'cancelled') then
      raise exception 'this ticket is closed' using errcode = '22023';
    end if;
    insert into public.maintenance_updates (request_id, author_id, author_role, kind, message)
    values (v_r.id, v_uid, 'tenant', 'comment', v_msg);
    for v_member in select * from public.property_team_user_ids(v_unit.property_id) loop
      perform public.notify_user(v_member, 'maintenance_update', 'Tenant replied on a ticket',
        'Unit ' || v_unit.unit_number || ': ' || left(v_msg, 120), jsonb_build_object('request_id', v_r.id));
    end loop;
  elsif public.is_admin() or public.can_handle_maintenance(v_r.unit_id) then
    insert into public.maintenance_updates (request_id, author_id, author_role, kind, message)
    values (v_r.id, v_uid, public.maintenance_actor_role(v_r.unit_id), 'comment', v_msg);
    select tp.user_id into v_tenant_user from public.tenant_profiles tp where tp.id = v_r.tenant_id;
    perform public.notify_user(v_tenant_user, 'maintenance_update', 'New message on your ticket',
      '"' || v_r.title || '": ' || left(v_msg, 120), jsonb_build_object('request_id', v_r.id));
  else
    raise exception 'ticket not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Tenant withdraws their own ticket while it is still open.
create or replace function public.cancel_maintenance_ticket(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_r public.maintenance_requests;
  v_unit public.units;
  v_member uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select * into v_r from public.maintenance_requests
   where id = p_request_id and tenant_id = public.my_tenant_profile_id() for update;
  if not found then
    raise exception 'ticket not found' using errcode = 'P0002';
  end if;
  if v_r.status::text <> 'open' then
    raise exception 'only open tickets can be cancelled' using errcode = '22023';
  end if;
  update public.maintenance_requests set status = 'cancelled' where id = v_r.id;
  insert into public.maintenance_updates (request_id, author_id, author_role, kind, from_status, to_status, message)
  values (v_r.id, v_uid, 'tenant', 'status_change', 'open', 'cancelled', 'Cancelled by the tenant');
  select * into v_unit from public.units where id = v_r.unit_id;
  for v_member in select * from public.property_team_user_ids(v_unit.property_id) loop
    perform public.notify_user(v_member, 'maintenance_update', 'Ticket cancelled',
      'Unit ' || v_unit.unit_number || ': ' || v_r.title, jsonb_build_object('request_id', v_r.id));
  end loop;
end;
$$;

-- ===========================================================================================
-- Vacate notices
-- ===========================================================================================
create table public.vacate_notices (
  id                    uuid primary key default gen_random_uuid(),
  tenancy_id            uuid not null references public.tenancies (id) on delete restrict,
  tenant_id             uuid not null references public.tenant_profiles (id) on delete restrict,
  notice_date           date not null default current_date,
  intended_move_out_date date not null,
  reason                text not null check (length(btrim(reason)) between 3 and 2000),
  refund_account_details text check (refund_account_details is null or length(refund_account_details) <= 500),
  status                text not null default 'submitted'
                        check (status in ('submitted', 'approved', 'inspection_pending', 'deposit_refunded', 'withdrawn')),
  deposit_held          numeric(12, 2) not null default 0 check (deposit_held >= 0),   -- snapshot at submission
  acknowledged_at       timestamptz,
  inspection_at         timestamptz,
  refund_amount         numeric(12, 2) check (refund_amount is null or refund_amount >= 0),
  deductions            numeric(12, 2) check (deductions is null or deductions >= 0),
  landlord_notes        text check (landlord_notes is null or length(landlord_notes) <= 2000),
  refunded_at           timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint vacate_notices_dates_check check (intended_move_out_date >= notice_date)
);
create index vacate_notices_tenant_idx on public.vacate_notices (tenant_id, created_at desc);
create index vacate_notices_tenancy_idx on public.vacate_notices (tenancy_id);
-- One live notice per tenancy.
create unique index vacate_notices_one_open_idx on public.vacate_notices (tenancy_id)
  where status in ('submitted', 'approved', 'inspection_pending');
create trigger vacate_notices_set_updated_at before update on public.vacate_notices
  for each row execute function public.set_updated_at();

alter table public.vacate_notices enable row level security;
create policy vacate_notices_select_tenant on public.vacate_notices
  for select to authenticated using (tenant_id = public.my_tenant_profile_id());
create policy vacate_notices_select_team on public.vacate_notices
  for select to authenticated using (public.owns_tenancy(tenancy_id));
create policy vacate_notices_select_admin on public.vacate_notices
  for select to authenticated using (public.is_admin());
revoke all on public.vacate_notices from public, anon;
grant select on public.vacate_notices to authenticated;
grant all on public.vacate_notices to service_role;

create or replace function public.submit_vacate_notice(
  p_tenancy_id uuid,
  p_move_out_date date,
  p_reason text,
  p_refund_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid := public.my_tenant_profile_id();
  v_t public.tenancies;
  v_unit public.units;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_refund text := nullif(btrim(coalesce(p_refund_details, '')), '');
  v_id uuid;
  v_member uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if v_tenant is null then
    raise exception 'only tenants can give a move-out notice' using errcode = '42501';
  end if;
  select * into v_t from public.tenancies where id = p_tenancy_id and tenant_id = v_tenant and status = 'active' for update;
  if not found then
    raise exception 'you can only give notice for your active tenancy' using errcode = 'P0002';
  end if;
  if p_move_out_date is null then
    raise exception 'choose your move-out date' using errcode = '22023';
  end if;
  if p_move_out_date <= current_date then
    raise exception 'the move-out date must be in the future' using errcode = '22023';
  end if;
  if p_move_out_date > current_date + 365 then
    raise exception 'the move-out date cannot be more than a year away' using errcode = '22023';
  end if;
  if length(v_reason) < 3 or length(v_reason) > 2000 then
    raise exception 'tell us why you are leaving (up to 2000 characters)' using errcode = '22023';
  end if;
  if v_refund is not null and length(v_refund) > 500 then
    raise exception 'refund details are too long' using errcode = '22023';
  end if;
  if exists (select 1 from public.vacate_notices n
              where n.tenancy_id = v_t.id and n.status in ('submitted', 'approved', 'inspection_pending')) then
    raise exception 'you already have an open move-out notice' using errcode = '23505';
  end if;

  insert into public.vacate_notices
    (tenancy_id, tenant_id, intended_move_out_date, reason, refund_account_details, deposit_held)
  values (v_t.id, v_tenant, p_move_out_date, v_reason, v_refund, v_t.security_deposit)
  returning id into v_id;

  select * into v_unit from public.units where id = v_t.unit_id;
  for v_member in select * from public.property_team_user_ids(v_unit.property_id) loop
    perform public.notify_user(v_member, 'vacate_submitted', 'Move-out notice received',
      'Unit ' || v_unit.unit_number || ': moving out on ' || to_char(p_move_out_date, 'FMDD Mon YYYY') || '.',
      jsonb_build_object('notice_id', v_id, 'tenancy_id', v_t.id));
  end loop;
  perform public.write_audit_log('vacate_submitted', 'vacate_notice', v_id, null,
    jsonb_build_object('move_out', p_move_out_date), '{}'::jsonb);
  return v_id;
end;
$$;

create or replace function public.withdraw_vacate_notice(p_notice_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n public.vacate_notices;
  v_unit public.units;
  v_member uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select * into v_n from public.vacate_notices
   where id = p_notice_id and tenant_id = public.my_tenant_profile_id() for update;
  if not found then
    raise exception 'notice not found' using errcode = 'P0002';
  end if;
  if v_n.status not in ('submitted', 'approved') then
    raise exception 'a notice can only be withdrawn before the inspection (status: %)', v_n.status using errcode = '22023';
  end if;
  update public.vacate_notices set status = 'withdrawn' where id = v_n.id;
  select u.* into v_unit from public.tenancies t join public.units u on u.id = t.unit_id where t.id = v_n.tenancy_id;
  for v_member in select * from public.property_team_user_ids(v_unit.property_id) loop
    perform public.notify_user(v_member, 'vacate_update', 'Move-out notice withdrawn',
      'Unit ' || v_unit.unit_number || ': the tenant withdrew their notice.', jsonb_build_object('notice_id', v_n.id));
  end loop;
  perform public.write_audit_log('vacate_withdrawn', 'vacate_notice', v_n.id);
end;
$$;

-- Owner / property manager / admin moves a notice forward:
--   acknowledge          submitted           -> approved
--   schedule_inspection  approved            -> inspection_pending   (needs p_inspection_at)
--   record_refund        inspection_pending  -> deposit_refunded     (needs p_refund_amount; refund + deductions <= deposit)
-- Ending the tenancy itself stays a separate, existing action (end_tenancy).
create or replace function public.advance_vacate_notice(
  p_notice_id uuid,
  p_action text,
  p_inspection_at timestamptz default null,
  p_refund_amount numeric default null,
  p_deductions numeric default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n public.vacate_notices;
  v_unit public.units;
  v_tenant_user uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_body text;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  select * into v_n from public.vacate_notices where id = p_notice_id for update;
  if not found or not (public.is_admin() or public.owns_tenancy(v_n.tenancy_id)) then
    raise exception 'notice not found' using errcode = 'P0002';
  end if;
  if v_note is not null and length(v_note) > 2000 then
    raise exception 'the note is too long' using errcode = '22023';
  end if;
  select u.* into v_unit from public.tenancies t join public.units u on u.id = t.unit_id where t.id = v_n.tenancy_id;

  if p_action = 'acknowledge' then
    if v_n.status <> 'submitted' then
      raise exception 'only a submitted notice can be acknowledged (status: %)', v_n.status using errcode = '22023';
    end if;
    update public.vacate_notices
       set status = 'approved', acknowledged_at = now(), landlord_notes = coalesce(v_note, landlord_notes)
     where id = v_n.id;
    v_body := 'Your landlord acknowledged your move-out notice for unit ' || v_unit.unit_number || '.';

  elsif p_action = 'schedule_inspection' then
    if v_n.status <> 'approved' then
      raise exception 'acknowledge the notice before scheduling the inspection (status: %)', v_n.status using errcode = '22023';
    end if;
    if p_inspection_at is null or p_inspection_at <= now() then
      raise exception 'choose a future date and time for the inspection' using errcode = '22023';
    end if;
    update public.vacate_notices
       set status = 'inspection_pending', inspection_at = p_inspection_at, landlord_notes = coalesce(v_note, landlord_notes)
     where id = v_n.id;
    v_body := 'Your move-out inspection for unit ' || v_unit.unit_number || ' is scheduled for '
              || to_char(p_inspection_at at time zone 'Africa/Nairobi', 'FMDD Mon YYYY "at" HH24:MI') || '.';

  elsif p_action = 'record_refund' then
    if v_n.status <> 'inspection_pending' then
      raise exception 'record the deposit refund after the inspection is scheduled (status: %)', v_n.status using errcode = '22023';
    end if;
    if p_refund_amount is null or p_refund_amount < 0 then
      raise exception 'enter the refund amount (0 if nothing is returned)' using errcode = '22023';
    end if;
    if coalesce(p_deductions, 0) < 0 then
      raise exception 'deductions cannot be negative' using errcode = '22023';
    end if;
    if p_refund_amount + coalesce(p_deductions, 0) > v_n.deposit_held then
      raise exception 'refund plus deductions cannot exceed the deposit of %', v_n.deposit_held using errcode = '22023';
    end if;
    if coalesce(p_deductions, 0) > 0 and v_note is null then
      raise exception 'explain the deductions in the note' using errcode = '22023';
    end if;
    update public.vacate_notices
       set status = 'deposit_refunded', refund_amount = p_refund_amount, deductions = coalesce(p_deductions, 0),
           refunded_at = now(), landlord_notes = coalesce(v_note, landlord_notes)
     where id = v_n.id;
    v_body := 'Your deposit refund of ' || p_refund_amount || ' for unit ' || v_unit.unit_number || ' was recorded.';

  else
    raise exception 'unknown action' using errcode = '22023';
  end if;

  select tp.user_id into v_tenant_user from public.tenant_profiles tp where tp.id = v_n.tenant_id;
  perform public.notify_user(v_tenant_user, 'vacate_update', 'Move-out update', v_body, jsonb_build_object('notice_id', v_n.id));
  perform public.write_audit_log('vacate_' || p_action, 'vacate_notice', v_n.id);
end;
$$;

-- ===========================================================================================
-- Announcement categories
-- ===========================================================================================
alter table public.notices add column category text not null default 'general'
  check (category in ('general', 'maintenance', 'urgent'));

-- ===========================================================================================
-- Payment instructions (shown to tenants on their statement)
-- ===========================================================================================
alter table public.property_settings add column mpesa_paybill text check (mpesa_paybill is null or mpesa_paybill ~ '^[0-9]{5,7}$');
alter table public.property_settings add column payment_instructions text
  check (payment_instructions is null or length(payment_instructions) <= 1000);
grant update (mpesa_paybill, payment_instructions) on public.property_settings to authenticated;

-- ===========================================================================================
-- What a tenant may see about their own home (security-barrier views, filtered to the caller)
-- ===========================================================================================

-- A landlord's pending link request, with the details the tenant needs to decide (they cannot read the unit directly yet).
create view public.tenant_link_request_overview with (security_barrier = true) as
select
  r.id as request_id, r.status, r.expires_at, r.created_at,
  u.id as unit_id, u.unit_number, u.floor_number, u.monthly_rent, u.security_deposit, u.currency,
  pr.id as property_id, pr.name as property_name, pr.address_line_1, pr.city,
  coalesce(lp.business_name, lprof.full_name) as landlord_name,
  lprof.phone as landlord_phone, lprof.email as landlord_email
from public.tenant_link_requests r
join public.tenant_profiles tp on tp.id = r.tenant_id
join public.units u on u.id = r.unit_id
join public.properties pr on pr.id = u.property_id
join public.landlord_profiles lp on lp.id = r.landlord_id
join public.profiles lprof on lprof.id = lp.user_id
where tp.user_id = auth.uid();

-- Who to contact about the property: the owner and any assigned managers/caretakers.
create view public.tenant_property_contacts with (security_barrier = true) as
select pr.id as property_id, 'owner'::text as contact_role,
       coalesce(lp.business_name, lprof.full_name) as display_name, lprof.phone, lprof.email
from public.properties pr
join public.landlord_profiles lp on lp.id = pr.landlord_id
join public.profiles lprof on lprof.id = lp.user_id
where public.is_tenant_at_property(pr.id)
union all
select s.property_id, s.role as contact_role, p.full_name as display_name, p.phone, p.email
from public.property_staff s
join public.profiles p on p.id = s.user_id
where s.status = 'active' and p.status = 'active' and public.is_tenant_at_property(s.property_id);

create view public.tenant_payment_info with (security_barrier = true) as
select ps.property_id, ps.mpesa_paybill, ps.payment_instructions
from public.property_settings ps
where public.is_tenant_at_property(ps.property_id);

revoke all on public.tenant_link_request_overview, public.tenant_property_contacts, public.tenant_payment_info from public, anon;
grant select on public.tenant_link_request_overview, public.tenant_property_contacts, public.tenant_payment_info
  to authenticated, service_role;

-- ===========================================================================================
-- Privileges
-- ===========================================================================================
do $$
declare
  f text;
begin
  foreach f in array array[
    'submit_maintenance_ticket(uuid, text, text, text, text)',
    'update_maintenance_ticket(uuid, text, text)',
    'comment_on_maintenance_ticket(uuid, text)',
    'cancel_maintenance_ticket(uuid)',
    'submit_vacate_notice(uuid, date, text, text)',
    'withdraw_vacate_notice(uuid)',
    'advance_vacate_notice(uuid, text, timestamptz, numeric, numeric, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- ===========================================================================================
-- send_announcement with a category (generated from 031 by scripts/gen-035-tail.mjs)
-- ===========================================================================================

-- The old six-argument version is replaced (keeping both would make named-argument calls ambiguous).
drop function if exists public.send_announcement(uuid, text, text, text, text, timestamptz);

create or replace function public.send_announcement(
  p_property_id uuid,
  p_title text,
  p_message text,
  p_audience text default 'all',
  p_value text default null,
  p_expires_at timestamptz default null,
  p_category text default 'general'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_notice uuid;
  v_floor integer;
  v_unit uuid;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not (public.is_admin() or public.owns_property(p_property_id)) then
    raise exception 'property not found' using errcode = 'P0002';
  end if;
  if p_title is null or btrim(p_title) = '' or p_message is null or btrim(p_message) = '' then
    raise exception 'title and message are required' using errcode = '22023';
  end if;
  if length(p_title) > 150 or length(p_message) > 5000 then
    raise exception 'title or message is too long' using errcode = '22023';
  end if;
  if p_audience not in ('all', 'floor', 'unit', 'unpaid_only') then
    raise exception 'unknown audience' using errcode = '22023';
  end if;
  if p_category is null or p_category not in ('general', 'maintenance', 'urgent') then
    raise exception 'unknown category' using errcode = '22023';
  end if;

  if p_audience = 'floor' then
    begin
      v_floor := p_value::integer;
    exception when others then
      raise exception 'floor must be a whole number' using errcode = '22023';
    end;
  elsif p_audience = 'unit' then
    begin
      v_unit := p_value::uuid;
    exception when others then
      raise exception 'choose a unit' using errcode = '22023';
    end;
    if not exists (select 1 from public.units u where u.id = v_unit and u.property_id = p_property_id) then
      raise exception 'unit not found in this property' using errcode = 'P0002';
    end if;
  end if;

  insert into public.notices (created_by, property_id, unit_id, title, body, expires_at, target_audience, target_value, category)
  values (v_uid, p_property_id, v_unit, btrim(p_title), p_message, p_expires_at, p_audience,
          case when p_audience in ('floor', 'unit') then p_value end, p_category)
  returning id into v_notice;

  insert into public.notice_recipients (notice_id, tenant_id)
  select distinct v_notice, te.tenant_id
  from public.tenancies te
  join public.units u on u.id = te.unit_id
  where te.status = 'active' and u.property_id = p_property_id
    and case p_audience
      when 'floor' then u.floor_number = v_floor
      when 'unit' then u.id = v_unit
      when 'unpaid_only' then exists (
        select 1 from public.rent_charges c
         where c.tenancy_id = te.id and c.status in ('pending', 'partially_paid', 'overdue'))
      else true
    end;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'no tenants match that audience; nothing was sent' using errcode = '22023';
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  select tp.user_id, 'notice', btrim(p_title), left(p_message, 200), jsonb_build_object('notice_id', v_notice)
  from public.notice_recipients r join public.tenant_profiles tp on tp.id = r.tenant_id
  where r.notice_id = v_notice;

  perform public.write_audit_log('notice_sent', 'notice', v_notice, null, null,
    jsonb_build_object('recipients', v_count, 'audience', p_audience));
  return v_notice;
end;
$$;

revoke all on function public.send_announcement(uuid, text, text, text, text, timestamptz, text) from public, anon;
grant execute on function public.send_announcement(uuid, text, text, text, text, timestamptz, text) to authenticated, service_role;
