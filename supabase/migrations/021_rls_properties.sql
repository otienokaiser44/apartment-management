-- 021: RLS for the property domain (properties, units, images, amenities).
-- Public (anon) may read published+verified properties and their vacant/reserved units.
-- Landlords manage their own. Verification and occupancy states are never client-writable.

alter table public.properties enable row level security;
alter table public.property_images enable row level security;
alter table public.amenities enable row level security;
alter table public.property_amenities enable row level security;
alter table public.units enable row level security;
alter table public.unit_images enable row level security;

-- properties -------------------------------------------------------------------------
create policy properties_select_public on public.properties
  for select to anon, authenticated
  using (status = 'published' and verification_status = 'verified');
create policy properties_select_owner on public.properties
  for select to authenticated using (landlord_id = public.my_landlord_profile_id());
create policy properties_select_tenant on public.properties
  for select to authenticated using (public.tenant_can_view_property(id));
create policy properties_select_admin on public.properties
  for select to authenticated using (public.is_admin());
create policy properties_insert_owner on public.properties
  for insert to authenticated with check (landlord_id = public.my_landlord_profile_id());
create policy properties_update_owner on public.properties
  for update to authenticated
  using (landlord_id = public.my_landlord_profile_id())
  with check (landlord_id = public.my_landlord_profile_id());
create policy properties_delete_owner on public.properties
  for delete to authenticated
  using (landlord_id = public.my_landlord_profile_id() and status = 'draft');
create policy properties_admin_write on public.properties
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.guard_properties_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    if tg_op = 'INSERT' then
      if new.verification_status <> 'unverified' then
        raise exception 'a new property must start unverified' using errcode = '42501';
      end if;
      if new.status in ('suspended') then
        raise exception 'landlords cannot suspend properties' using errcode = '42501';
      end if;
    else
      if new.verification_status is distinct from old.verification_status then
        raise exception 'only the platform admin can change property verification'
          using errcode = '42501';
      end if;
      if new.landlord_id is distinct from old.landlord_id then
        raise exception 'property owner cannot be changed' using errcode = '42501';
      end if;
      if new.status is distinct from old.status
         and (new.status = 'suspended' or old.status = 'suspended') then
        raise exception 'suspension is controlled by the platform admin' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger properties_guard_write before insert or update on public.properties
  for each row execute function public.guard_properties_write();

-- property_images --------------------------------------------------------------------
create policy property_images_select_public on public.property_images
  for select to anon, authenticated using (public.is_publicly_listed_property(property_id));
create policy property_images_select_scoped on public.property_images
  for select to authenticated using (
    public.owns_property(property_id) or public.is_admin() or public.tenant_can_view_property(property_id)
  );
create policy property_images_write_owner on public.property_images
  for all to authenticated
  using (public.owns_property(property_id) or public.is_admin())
  with check (public.owns_property(property_id) or public.is_admin());

-- amenities (global catalogue): world-readable, admin-managed ------------------------
create policy amenities_select_all on public.amenities
  for select to anon, authenticated using (true);
create policy amenities_admin_write on public.amenities
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy property_amenities_select_public on public.property_amenities
  for select to anon, authenticated using (public.is_publicly_listed_property(property_id));
create policy property_amenities_select_scoped on public.property_amenities
  for select to authenticated using (public.owns_property(property_id) or public.is_admin());
create policy property_amenities_write_owner on public.property_amenities
  for all to authenticated
  using (public.owns_property(property_id) or public.is_admin())
  with check (public.owns_property(property_id) or public.is_admin());

-- units ------------------------------------------------------------------------------
create policy units_select_public on public.units
  for select to anon, authenticated using (public.is_public_unit(id));
create policy units_select_owner on public.units
  for select to authenticated using (public.owns_property(property_id));
create policy units_select_tenant on public.units
  for select to authenticated using (public.tenant_can_view_unit(id));
create policy units_select_admin on public.units
  for select to authenticated using (public.is_admin());
create policy units_insert_owner on public.units
  for insert to authenticated with check (public.owns_property(property_id));
create policy units_update_owner on public.units
  for update to authenticated
  using (public.owns_property(property_id)) with check (public.owns_property(property_id));
create policy units_delete_owner on public.units
  for delete to authenticated using (public.owns_property(property_id));
create policy units_admin_write on public.units
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- reserved/occupied are set only by lifecycle RPCs (approve / confirm_move_in / end_tenancy).
create or replace function public.guard_units_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    if tg_op = 'INSERT' then
      if new.status in ('reserved', 'occupied') then
        raise exception 'unit occupancy is controlled by tenancy operations' using errcode = '42501';
      end if;
    else
      if new.property_id is distinct from old.property_id then
        raise exception 'a unit cannot move between properties' using errcode = '42501';
      end if;
      if new.status is distinct from old.status
         and (new.status in ('reserved', 'occupied') or old.status in ('reserved', 'occupied')) then
        raise exception 'unit occupancy is controlled by tenancy operations' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger units_guard_write before insert or update on public.units
  for each row execute function public.guard_units_write();

-- unit_images ------------------------------------------------------------------------
create policy unit_images_select_public on public.unit_images
  for select to anon, authenticated using (public.is_public_unit(unit_id));
create policy unit_images_select_scoped on public.unit_images
  for select to authenticated using (
    public.owns_unit(unit_id) or public.is_admin() or public.tenant_can_view_unit(unit_id)
  );
create policy unit_images_write_owner on public.unit_images
  for all to authenticated
  using (public.owns_unit(unit_id) or public.is_admin())
  with check (public.owns_unit(unit_id) or public.is_admin());

-- Privileges: anon is read-only on public catalogue tables.
revoke insert, update, delete, truncate on public.properties, public.property_images,
  public.amenities, public.property_amenities, public.units, public.unit_images from anon;
