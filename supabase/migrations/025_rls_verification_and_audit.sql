-- 025: RLS for verification, reports, inquiries, favorites, audit logs.
-- Landlords can prepare and submit evidence; only an admin (via review_property_verification)
-- can make a property verified. Verification data is never public.

alter table public.verification_document_types enable row level security;
alter table public.property_verification_requests enable row level security;
alter table public.property_verification_documents enable row level security;
alter table public.property_reports enable row level security;
alter table public.property_inquiries enable row level security;
alter table public.favorites enable row level security;
alter table public.audit_logs enable row level security;

-- document type catalogue --------------------------------------------------------------
create policy vdt_select_authenticated on public.verification_document_types
  for select to authenticated using (true);
create policy vdt_admin_write on public.verification_document_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- verification requests (created by start_property_verification(), decided by review_...) --
create policy pvr_select_landlord on public.property_verification_requests
  for select to authenticated using (submitted_by_landlord_id = public.my_landlord_profile_id());
create policy pvr_select_admin on public.property_verification_requests
  for select to authenticated using (public.is_admin());
create policy pvr_delete_draft on public.property_verification_requests
  for delete to authenticated using (
    submitted_by_landlord_id = public.my_landlord_profile_id() and status = 'draft'
  );
-- No landlord INSERT/UPDATE policy: start / submit / withdraw / review are RPCs.

-- verification documents (PRIVATE) -----------------------------------------------------
create policy pvd_select_landlord on public.property_verification_documents
  for select to authenticated using (
    exists (
      select 1 from public.property_verification_requests r
      where r.id = verification_request_id
        and r.submitted_by_landlord_id = public.my_landlord_profile_id()
    )
  );
create policy pvd_select_admin on public.property_verification_documents
  for select to authenticated using (public.is_admin());
-- Landlords may attach/remove documents only while the request is still a draft, and can
-- never set review fields.
create policy pvd_insert_landlord on public.property_verification_documents
  for insert to authenticated with check (
    status = 'pending' and reviewed_by_admin_id is null and reviewed_at is null
    and rejection_reason is null
    and exists (
      select 1 from public.property_verification_requests r
      where r.id = verification_request_id
        and r.submitted_by_landlord_id = public.my_landlord_profile_id()
        and r.status = 'draft'
    )
  );
create policy pvd_delete_landlord on public.property_verification_documents
  for delete to authenticated using (
    exists (
      select 1 from public.property_verification_requests r
      where r.id = verification_request_id
        and r.submitted_by_landlord_id = public.my_landlord_profile_id()
        and r.status = 'draft'
    )
  );
create policy pvd_admin_update on public.property_verification_documents
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- property_reports -------------------------------------------------------------------
create policy reports_insert_authenticated on public.property_reports
  for insert to authenticated with check (
    reported_by = auth.uid() and status = 'open'
    and reviewed_by is null and reviewed_at is null and resolution_notes is null
  );
create policy reports_select_own on public.property_reports
  for select to authenticated using (reported_by = auth.uid());
create policy reports_admin_all on public.property_reports
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- property_inquiries (visitors may submit before signing in) ---------------------------
create policy inquiries_insert_public on public.property_inquiries
  for insert to anon, authenticated with check (
    status = 'new'
    and (sender_user_id is null or sender_user_id = auth.uid())
    and public.is_publicly_listed_property(property_id)
  );
create policy inquiries_select_owner on public.property_inquiries
  for select to authenticated using (public.owns_property(property_id));
create policy inquiries_select_sender on public.property_inquiries
  for select to authenticated using (sender_user_id = auth.uid());
create policy inquiries_update_owner on public.property_inquiries
  for update to authenticated
  using (public.owns_property(property_id)) with check (public.owns_property(property_id));
create policy inquiries_admin_all on public.property_inquiries
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.guard_inquiries_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    if new.property_id is distinct from old.property_id
       or new.unit_id is distinct from old.unit_id
       or new.sender_user_id is distinct from old.sender_user_id
       or new.sender_name is distinct from old.sender_name
       or new.sender_email is distinct from old.sender_email
       or new.sender_phone is distinct from old.sender_phone
       or new.message is distinct from old.message then
      raise exception 'landlords may only change the inquiry status' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger inquiries_guard before update on public.property_inquiries
  for each row execute function public.guard_inquiries_update();

-- favorites --------------------------------------------------------------------------
create policy favorites_own on public.favorites
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit_logs: admins read; nobody writes through the API --------------------------------
create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated using (public.is_admin());

revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

revoke all on public.verification_document_types, public.property_verification_requests,
  public.property_verification_documents, public.property_reports, public.favorites from anon;
revoke insert, update, truncate on public.property_verification_requests from authenticated;
revoke truncate on public.property_verification_documents from authenticated;
revoke delete, truncate on public.property_reports from authenticated;
-- anon may only INSERT inquiries (and read nothing).
revoke all on public.property_inquiries from anon;
grant insert on public.property_inquiries to anon;
