-- 022: RLS for applications, invitations, tenancies and leases.
-- Tenancies and invitations are created/changed ONLY by the protected RPCs in 027.
-- Applications: a tenant may create their own pending application and withdraw it; landlords
-- decide through approve_rental_application / reject_rental_application.

alter table public.rental_applications enable row level security;
alter table public.tenant_invitations enable row level security;
alter table public.tenancies enable row level security;
alter table public.leases enable row level security;

-- rental_applications ----------------------------------------------------------------
create policy applications_select_tenant on public.rental_applications
  for select to authenticated using (tenant_id = public.my_tenant_profile_id());
create policy applications_select_landlord on public.rental_applications
  for select to authenticated using (public.owns_unit(unit_id));
create policy applications_select_admin on public.rental_applications
  for select to authenticated using (public.is_admin());
create policy applications_insert_tenant on public.rental_applications
  for insert to authenticated with check (
    tenant_id = public.my_tenant_profile_id()
    and status = 'pending'
    and reviewed_by is null and reviewed_at is null and rejection_reason is null
    and public.is_applicable_unit(unit_id)
  );
create policy applications_update_tenant on public.rental_applications
  for update to authenticated
  using (tenant_id = public.my_tenant_profile_id() and status = 'pending')
  with check (tenant_id = public.my_tenant_profile_id());
create policy applications_admin_write on public.rental_applications
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.guard_applications_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    if new.tenant_id is distinct from old.tenant_id
       or new.unit_id is distinct from old.unit_id
       or new.reviewed_by is distinct from old.reviewed_by
       or new.reviewed_at is distinct from old.reviewed_at
       or new.rejection_reason is distinct from old.rejection_reason then
      raise exception 'application ownership and review fields are immutable for tenants'
        using errcode = '42501';
    end if;
    if new.status is distinct from old.status and new.status not in ('withdrawn', 'cancelled') then
      raise exception 'tenants may only withdraw or cancel an application' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger applications_guard_update before update on public.rental_applications
  for each row execute function public.guard_applications_update();

-- tenant_invitations -----------------------------------------------------------------
create policy invitations_select_landlord on public.tenant_invitations
  for select to authenticated using (landlord_id = public.my_landlord_profile_id());
create policy invitations_select_invitee on public.tenant_invitations
  for select to authenticated using (
    invitee_email is not null
    and lower(invitee_email) = (select lower(p.email) from public.profiles p where p.id = auth.uid())
  );
create policy invitations_admin_all on public.tenant_invitations
  for select to authenticated using (public.is_admin());
-- No INSERT/UPDATE/DELETE policies for clients: create/revoke/accept are RPCs.

-- tenancies --------------------------------------------------------------------------
create policy tenancies_select_tenant on public.tenancies
  for select to authenticated using (tenant_id = public.my_tenant_profile_id());
create policy tenancies_select_landlord on public.tenancies
  for select to authenticated using (landlord_id = public.my_landlord_profile_id());
create policy tenancies_select_admin on public.tenancies
  for select to authenticated using (public.is_admin());
-- No client write policies at all: tenants cannot touch tenant_id/unit_id/landlord_id/status/
-- dates, and landlords change state through confirm_move_in / end_tenancy / cancel_pending_tenancy.

-- leases -----------------------------------------------------------------------------
create policy leases_select_tenant on public.leases
  for select to authenticated using (public.is_tenant_of_tenancy(tenancy_id));
create policy leases_select_landlord on public.leases
  for select to authenticated using (public.owns_tenancy(tenancy_id));
create policy leases_select_admin on public.leases
  for select to authenticated using (public.is_admin());
create policy leases_write_landlord on public.leases
  for all to authenticated
  using (public.owns_tenancy(tenancy_id)) with check (public.owns_tenancy(tenancy_id));

-- Privileges: clients can never write these directly (defence in depth on top of RLS).
revoke all on public.rental_applications, public.tenant_invitations, public.tenancies,
  public.leases from anon;
revoke insert, update, delete, truncate on public.tenant_invitations, public.tenancies
  from authenticated;
revoke delete, truncate on public.rental_applications from authenticated;
