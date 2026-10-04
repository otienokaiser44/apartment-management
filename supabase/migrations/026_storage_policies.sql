-- 026: Storage buckets and policies. Object paths start with the owning entity id so policies
-- can reuse the same ownership helpers as the tables:
--   property-images/<property_id>/<file>          (public read, owner write)
--   unit-images/<unit_id>/<file>                  (public read, owner write)
--   avatars/<user_id>/<file>                      (private: owner + admin)
--   verification-documents/<property_id>/<file>   (PRIVATE: owning landlord + admin)
--   maintenance-attachments/<request_id>/<file>   (private: tenant, unit landlord, admin)
-- Only paths are stored in database tables; never binaries.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('property-images', 'property-images', true, 5242880,
    array['image/jpeg', 'image/png', 'image/webp']),
  ('unit-images', 'unit-images', true, 5242880,
    array['image/jpeg', 'image/png', 'image/webp']),
  ('avatars', 'avatars', false, 2097152,
    array['image/jpeg', 'image/png', 'image/webp']),
  ('verification-documents', 'verification-documents', false, 10485760,
    array['application/pdf', 'image/jpeg', 'image/png']),
  ('maintenance-attachments', 'maintenance-attachments', false, 10485760,
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- property-images ------------------------------------------------------------------------
create policy "property images: read" on storage.objects
  for select to anon, authenticated using (
    bucket_id = 'property-images' and (
      public.is_publicly_listed_property(public.safe_uuid((storage.foldername(name))[1]))
      or public.owns_property(public.safe_uuid((storage.foldername(name))[1]))
      or public.is_admin()
    )
  );
create policy "property images: owner write" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'property-images' and (
      public.owns_property(public.safe_uuid((storage.foldername(name))[1])) or public.is_admin()
    )
  );
create policy "property images: owner update" on storage.objects
  for update to authenticated using (
    bucket_id = 'property-images' and (
      public.owns_property(public.safe_uuid((storage.foldername(name))[1])) or public.is_admin()
    )
  );
create policy "property images: owner delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'property-images' and (
      public.owns_property(public.safe_uuid((storage.foldername(name))[1])) or public.is_admin()
    )
  );

-- unit-images ----------------------------------------------------------------------------
create policy "unit images: read" on storage.objects
  for select to anon, authenticated using (
    bucket_id = 'unit-images' and (
      public.is_public_unit(public.safe_uuid((storage.foldername(name))[1]))
      or public.owns_unit(public.safe_uuid((storage.foldername(name))[1]))
      or public.is_admin()
    )
  );
create policy "unit images: owner write" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'unit-images' and (
      public.owns_unit(public.safe_uuid((storage.foldername(name))[1])) or public.is_admin()
    )
  );
create policy "unit images: owner update" on storage.objects
  for update to authenticated using (
    bucket_id = 'unit-images' and (
      public.owns_unit(public.safe_uuid((storage.foldername(name))[1])) or public.is_admin()
    )
  );
create policy "unit images: owner delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'unit-images' and (
      public.owns_unit(public.safe_uuid((storage.foldername(name))[1])) or public.is_admin()
    )
  );

-- avatars --------------------------------------------------------------------------------
create policy "avatars: owner or admin read" on storage.objects
  for select to authenticated using (
    bucket_id = 'avatars'
    and (public.safe_uuid((storage.foldername(name))[1]) = auth.uid() or public.is_admin())
  );
create policy "avatars: owner write" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'avatars' and public.safe_uuid((storage.foldername(name))[1]) = auth.uid()
  );
create policy "avatars: owner update" on storage.objects
  for update to authenticated using (
    bucket_id = 'avatars' and public.safe_uuid((storage.foldername(name))[1]) = auth.uid()
  );
create policy "avatars: owner delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'avatars' and public.safe_uuid((storage.foldername(name))[1]) = auth.uid()
  );

-- verification-documents: PRIVATE bucket, no anon policy of any kind ---------------------
create policy "verification docs: owner or admin read" on storage.objects
  for select to authenticated using (
    bucket_id = 'verification-documents' and (
      public.owns_property(public.safe_uuid((storage.foldername(name))[1])) or public.is_admin()
    )
  );
create policy "verification docs: owner upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'verification-documents'
    and public.owns_property(public.safe_uuid((storage.foldername(name))[1]))
  );
create policy "verification docs: owner delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'verification-documents'
    and public.owns_property(public.safe_uuid((storage.foldername(name))[1]))
  );

-- maintenance-attachments: access follows the (RLS-filtered) maintenance request ----------
create policy "maintenance files: parties read" on storage.objects
  for select to authenticated using (
    bucket_id = 'maintenance-attachments' and exists (
      select 1 from public.maintenance_requests r
      where r.id = public.safe_uuid((storage.foldername(name))[1])
    )
  );
create policy "maintenance files: parties upload" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'maintenance-attachments' and exists (
      select 1 from public.maintenance_requests r
      where r.id = public.safe_uuid((storage.foldername(name))[1])
    )
  );
create policy "maintenance files: parties delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'maintenance-attachments' and exists (
      select 1 from public.maintenance_requests r
      where r.id = public.safe_uuid((storage.foldername(name))[1])
        and (r.tenant_id = public.my_tenant_profile_id() or public.owns_unit(r.unit_id) or public.is_admin())
    )
  );
