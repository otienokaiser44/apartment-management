-- 028: derived-state triggers, extra indexes, and the public listings view.

-- published_at follows the property lifecycle.
create or replace function public.set_property_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published')
     and new.published_at is null then
    new.published_at := now();
  elsif new.status <> 'published' and tg_op = 'UPDATE' and old.status = 'published' then
    new.published_at := null;
  end if;
  return new;
end;
$$;
create trigger properties_published_at before insert or update of status on public.properties
  for each row execute function public.set_property_published_at();

-- resolved_at follows the maintenance status.
create or replace function public.set_maintenance_resolved_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('resolved', 'closed') and new.resolved_at is null then
    new.resolved_at := now();
  elsif new.status in ('open', 'in_progress') then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;
create trigger maintenance_resolved_at before update of status on public.maintenance_requests
  for each row execute function public.set_maintenance_resolved_at();

-- rent_charges.status is derived from successful payments (manual or provider webhook).
create or replace function public.sync_rent_charge_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_charge uuid := coalesce(new.rent_charge_id, old.rent_charge_id);
  v_amount numeric(12, 2);
  v_status public.charge_status;
  v_paid numeric(12, 2);
  v_due date;
begin
  if v_charge is null then
    return null;
  end if;
  select amount, status, due_date into v_amount, v_status, v_due
  from public.rent_charges where id = v_charge for update;
  if not found or v_status = 'cancelled' then
    return null;
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.payments where rent_charge_id = v_charge and status = 'successful';

  update public.rent_charges
     set status = case
       when v_paid >= v_amount then 'paid'
       when v_paid > 0 then 'partially_paid'
       when v_due < current_date then 'overdue'
       else 'pending' end::public.charge_status
   where id = v_charge;
  return null;
end;
$$;
revoke all on function public.sync_rent_charge_status() from public, anon, authenticated;
create trigger payments_sync_charge
  after insert or update of status, amount, rent_charge_id or delete on public.payments
  for each row execute function public.sync_rent_charge_status();

-- Tenancy history lookups ("current tenancy of tenant X") stay fast.
create index tenancies_tenant_active_idx on public.tenancies (tenant_id) where status = 'active';
create index tenancies_tenant_start_idx on public.tenancies (tenant_id, start_date desc);

-- ---------------------------------------------------------------------------------------
-- Public marketplace view: one row per vacant/reserved unit of a published+verified property.
-- Owned by the migration role (bypasses RLS) so it can join private tables, but it exposes
-- ONLY the columns below: no landlord contact/identity, no tenants, no internal notes.
-- ---------------------------------------------------------------------------------------
create view public.public_property_listings as
select
  u.id                         as unit_id,
  u.unit_number,
  u.unit_type,
  u.floor_number,
  u.bedrooms,
  u.bathrooms,
  u.monthly_rent,
  u.security_deposit,
  u.currency,
  u.description                as unit_description,
  u.status                     as unit_status,
  u.available_from,
  pr.id                        as property_id,
  pr.name                      as property_name,
  pr.property_type,
  pr.description               as property_description,
  pr.address_line_1,
  pr.city,
  pr.county_or_region,
  pr.country,
  pr.latitude,
  pr.longitude,
  pr.verification_status       as property_verification_status,
  coalesce(lp.business_name, lprof.full_name) as landlord_display_name,
  coalesce(
    (select ui.storage_path from public.unit_images ui
      where ui.unit_id = u.id order by ui.is_cover desc, ui.sort_order, ui.created_at limit 1),
    (select pi.storage_path from public.property_images pi
      where pi.property_id = pr.id order by pi.is_cover desc, pi.sort_order, pi.created_at limit 1)
  )                            as cover_image_path,
  coalesce(
    (select jsonb_agg(jsonb_build_object('slug', a.slug, 'name', a.name) order by a.name)
       from public.property_amenities pa join public.amenities a on a.id = pa.amenity_id
      where pa.property_id = pr.id),
    '[]'::jsonb
  )                            as amenities
from public.units u
join public.properties pr on pr.id = u.property_id
join public.landlord_profiles lp on lp.id = pr.landlord_id
join public.profiles lprof on lprof.id = lp.user_id
where u.status in ('vacant', 'reserved')
  and pr.status = 'published'
  and pr.verification_status = 'verified'
  and lprof.status = 'active';

revoke all on public.public_property_listings from public;
grant select on public.public_property_listings to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------------------
-- Role dashboards. Tenants must not read landlord_profiles (registration refs) and landlords
-- must not read tenant_profiles (national ids), yet each side needs the other's NAME and CONTACT.
-- These views join through the private tables as the owner and expose only contact columns,
-- filtered to the caller (auth.uid()). security_barrier stops caller predicates leaking rows.
-- ---------------------------------------------------------------------------------------
create view public.tenant_tenancy_overview with (security_barrier = true) as
select
  te.id            as tenancy_id,
  te.status        as tenancy_status,
  te.start_date,
  te.end_date,
  te.monthly_rent,
  te.security_deposit,
  te.currency,
  u.id             as unit_id,
  u.unit_number,
  u.status         as unit_status,
  pr.id            as property_id,
  pr.name          as property_name,
  pr.property_type,
  pr.address_line_1,
  pr.city,
  lp.id            as landlord_id,
  lp.business_name as landlord_business_name,
  lprof.full_name  as landlord_name,
  lprof.email      as landlord_email,
  lprof.phone      as landlord_phone
from public.tenancies te
join public.tenant_profiles tp on tp.id = te.tenant_id
join public.units u on u.id = te.unit_id
join public.properties pr on pr.id = u.property_id
join public.landlord_profiles lp on lp.id = te.landlord_id
join public.profiles lprof on lprof.id = lp.user_id
where tp.user_id = auth.uid();

create view public.landlord_tenancy_overview with (security_barrier = true) as
select
  te.id            as tenancy_id,
  te.status        as tenancy_status,
  te.start_date,
  te.end_date,
  te.monthly_rent,
  te.security_deposit,
  te.currency,
  tp.id            as tenant_id,
  tprof.id         as tenant_user_id,
  tprof.full_name  as tenant_name,
  tprof.email      as tenant_email,
  tprof.phone      as tenant_phone,
  u.id             as unit_id,
  u.unit_number,
  pr.id            as property_id,
  pr.name          as property_name
from public.tenancies te
join public.tenant_profiles tp on tp.id = te.tenant_id
join public.profiles tprof on tprof.id = tp.user_id
join public.units u on u.id = te.unit_id
join public.properties pr on pr.id = u.property_id
where te.landlord_id = public.my_landlord_profile_id();

create view public.landlord_application_overview with (security_barrier = true) as
select
  a.id             as application_id,
  a.status         as application_status,
  a.message,
  a.desired_move_in_date,
  a.rejection_reason,
  a.reviewed_at,
  a.created_at,
  tp.id            as tenant_id,
  tprof.full_name  as tenant_name,
  tprof.email      as tenant_email,
  tprof.phone      as tenant_phone,
  u.id             as unit_id,
  u.unit_number,
  u.status         as unit_status,
  pr.id            as property_id,
  pr.name          as property_name
from public.rental_applications a
join public.tenant_profiles tp on tp.id = a.tenant_id
join public.profiles tprof on tprof.id = tp.user_id
join public.units u on u.id = a.unit_id
join public.properties pr on pr.id = u.property_id
where pr.landlord_id = public.my_landlord_profile_id();

revoke all on public.tenant_tenancy_overview, public.landlord_tenancy_overview,
  public.landlord_application_overview from public, anon;
grant select on public.tenant_tenancy_overview, public.landlord_tenancy_overview,
  public.landlord_application_overview to authenticated, service_role;
