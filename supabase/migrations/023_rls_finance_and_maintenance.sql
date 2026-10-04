-- 023: RLS for rent charges, payments and maintenance.
-- A tenant can read their own money records and START a payment (pending), but only the
-- provider/webhook (service role) or record_manual_payment() can make one successful.

alter table public.rent_charges enable row level security;
alter table public.payments enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.maintenance_attachments enable row level security;

-- rent_charges -----------------------------------------------------------------------
create policy rent_charges_select_tenant on public.rent_charges
  for select to authenticated using (public.is_tenant_of_tenancy(tenancy_id));
create policy rent_charges_select_landlord on public.rent_charges
  for select to authenticated using (public.owns_tenancy(tenancy_id));
create policy rent_charges_select_admin on public.rent_charges
  for select to authenticated using (public.is_admin());
create policy rent_charges_write_landlord on public.rent_charges
  for all to authenticated
  using (public.owns_tenancy(tenancy_id)) with check (public.owns_tenancy(tenancy_id));
create policy rent_charges_admin_write on public.rent_charges
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- paid / partially_paid are derived from payments (028 trigger), never set by clients.
create or replace function public.guard_rent_charges_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    if new.status in ('paid', 'partially_paid') and (tg_op = 'INSERT' or new.status is distinct from old.status) then
      raise exception 'charge payment status is derived from payments' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and (new.tenancy_id is distinct from old.tenancy_id
                             or new.amount is distinct from old.amount and old.status <> 'pending') then
      raise exception 'charge tenancy/amount are fixed once billed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger rent_charges_guard before insert or update on public.rent_charges
  for each row execute function public.guard_rent_charges_write();

-- payments ---------------------------------------------------------------------------
create policy payments_select_tenant on public.payments
  for select to authenticated using (tenant_id = public.my_tenant_profile_id());
create policy payments_select_landlord on public.payments
  for select to authenticated using (public.owns_tenancy(tenancy_id));
create policy payments_select_admin on public.payments
  for select to authenticated using (public.is_admin());
create policy payments_insert_tenant on public.payments
  for insert to authenticated with check (
    tenant_id = public.my_tenant_profile_id()
    and status = 'pending'
    and paid_at is null
    and provider_reference is null
    and public.is_active_tenant_of_tenancy(tenancy_id)
  );
create policy payments_admin_write on public.payments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- No tenant/landlord UPDATE or DELETE policy: status changes come from the provider (service
-- role) or record_manual_payment().

-- maintenance_requests ---------------------------------------------------------------
create policy maintenance_select_tenant on public.maintenance_requests
  for select to authenticated using (tenant_id = public.my_tenant_profile_id());
create policy maintenance_select_landlord on public.maintenance_requests
  for select to authenticated using (public.owns_unit(unit_id));
create policy maintenance_select_admin on public.maintenance_requests
  for select to authenticated using (public.is_admin());
create policy maintenance_insert_tenant on public.maintenance_requests
  for insert to authenticated with check (
    tenant_id = public.my_tenant_profile_id()
    and status = 'open'
    and assigned_to is null and resolved_at is null
    and public.is_active_tenant_of_tenancy(tenancy_id)
  );
create policy maintenance_update_tenant on public.maintenance_requests
  for update to authenticated
  using (tenant_id = public.my_tenant_profile_id() and status = 'open')
  with check (tenant_id = public.my_tenant_profile_id());
create policy maintenance_update_landlord on public.maintenance_requests
  for update to authenticated
  using (public.owns_unit(unit_id)) with check (public.owns_unit(unit_id));
create policy maintenance_admin_write on public.maintenance_requests
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.guard_maintenance_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    if new.tenant_id is distinct from old.tenant_id
       or new.unit_id is distinct from old.unit_id
       or new.tenancy_id is distinct from old.tenancy_id then
      raise exception 'maintenance request ownership is immutable' using errcode = '42501';
    end if;
    -- A tenant (not the unit's landlord) is limited to editing details or cancelling while open.
    if not public.owns_unit(old.unit_id) then
      if new.assigned_to is distinct from old.assigned_to
         or new.resolved_at is distinct from old.resolved_at
         or new.status not in ('open', 'cancelled') then
        raise exception 'tenants cannot assign, resolve or progress requests' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger maintenance_guard_update before update on public.maintenance_requests
  for each row execute function public.guard_maintenance_update();

-- maintenance_attachments: visibility follows the (RLS-filtered) parent request ------
create policy maintenance_attachments_select on public.maintenance_attachments
  for select to authenticated using (
    exists (select 1 from public.maintenance_requests r where r.id = maintenance_request_id)
  );
create policy maintenance_attachments_insert on public.maintenance_attachments
  for insert to authenticated with check (
    exists (select 1 from public.maintenance_requests r where r.id = maintenance_request_id)
  );
create policy maintenance_attachments_delete on public.maintenance_attachments
  for delete to authenticated using (
    exists (
      select 1 from public.maintenance_requests r
      where r.id = maintenance_request_id
        and (r.tenant_id = public.my_tenant_profile_id() or public.owns_unit(r.unit_id) or public.is_admin())
    )
  );

revoke all on public.rent_charges, public.payments, public.maintenance_requests,
  public.maintenance_attachments from anon;
revoke update, delete, truncate on public.payments from authenticated;
revoke delete, truncate on public.rent_charges, public.maintenance_requests from authenticated;
