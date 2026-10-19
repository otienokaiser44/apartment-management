-- READ-ONLY database audit. Paste into the Supabase SQL editor and run QUERY 1, then QUERY 2.
-- Returns counts and object names only: no emails, no row contents. Changes nothing.

-- ===================================================================================================
-- QUERY 1: the full audit as one JSON value (copy the single result cell)
-- ===================================================================================================
with
tbl as (
  select c.oid, c.relname,
         c.relrowsecurity as rls,
         (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
),
tbl_out as (
  select relname, rls, policies,
         (xpath('/row/c/text()',
                query_to_xml(format('select count(*) as c from public.%I', relname), false, true, '')))[1]::text::bigint as row_count
  from tbl
),
exp_rel(name) as (values
  ('profiles'),('tenant_profiles'),('landlord_profiles'),('admin_profiles'),('properties'),('amenities'),
  ('property_amenities'),('property_images'),('units'),('unit_images'),('rental_applications'),
  ('tenant_invitations'),('tenancies'),('leases'),('rent_charges'),('payments'),('maintenance_requests'),
  ('maintenance_attachments'),('notices'),('notice_recipients'),('conversations'),
  ('conversation_participants'),('messages'),('notifications'),('favorites'),('property_inquiries'),
  ('property_verification_requests'),('property_verification_documents'),('verification_document_types'),
  ('property_reports'),('audit_logs'),
  ('public_property_listings'),('tenant_tenancy_overview'),('landlord_tenancy_overview'),
  ('landlord_application_overview'),
  -- 030-035
  ('tenant_link_requests'),('property_settings'),('utility_readings'),('invoices'),('invoice_overview'),
  ('property_staff'),('staff_invitations'),('property_staff_overview'),('notification_preferences'),
  ('maintenance_updates'),('vacate_notices'),('tenant_link_request_overview'),('tenant_property_contacts'),
  ('tenant_payment_info')
),
exp_fn(name) as (values
  ('approve_rental_application'),('reject_rental_application'),('confirm_move_in'),('cancel_pending_tenancy'),
  ('end_tenancy'),('create_tenant_invitation'),('revoke_tenant_invitation'),('accept_tenant_invitation'),
  ('start_property_verification'),('submit_property_verification'),('withdraw_property_verification'),
  ('review_property_verification'),('record_manual_payment'),('send_notice'),('start_conversation'),
  ('admin_set_user_status'),('admin_set_landlord_verification'),('admin_set_property_status'),
  ('write_audit_log'),('is_admin'),('is_landlord'),('is_tenant'),('handle_new_user'),
  -- 030-035
  ('create_tenant_invitations_bulk'),('request_tenant_link'),('respond_tenant_link'),
  ('cancel_tenant_link_request'),('submit_unit_link_request'),('generate_property_code'),
  ('record_utility_readings'),('generate_monthly_invoices'),('send_announcement'),
  ('is_manager'),('is_property_owner'),('is_property_staff'),('owns_property'),('owns_unit'),('owns_tenancy'),
  ('can_view_property'),('invite_staff'),('revoke_staff_invitation'),('accept_staff_invitation'),
  ('remove_staff'),('guard_profiles_update'),('sync_profile_email'),('notification_category'),
  ('skip_muted_notification'),('deactivate_my_account'),('is_tenant_at_property'),('can_handle_maintenance'),
  ('maintenance_actor_role'),('property_team_user_ids'),('submit_maintenance_ticket'),
  ('update_maintenance_ticket'),('comment_on_maintenance_ticket'),('cancel_maintenance_ticket'),
  ('submit_vacate_notice'),('withdraw_vacate_notice'),('advance_vacate_notice')
),
exp_col(tbl, col) as (values
  ('tenant_invitations','invitee_name'),('properties','property_code'),('notices','target_audience'),
  ('notices','target_value'),('notices','category'),('maintenance_requests','category'),
  ('property_settings','mpesa_paybill'),('property_settings','payment_instructions')
),
exp_trg(name) as (values
  ('properties_lock_code'),('tenant_link_requests_consistency'),('properties_create_settings'),
  ('staff_invitations_properties_check'),('on_auth_user_email_changed'),('notifications_respect_preferences'),
  ('property_staff_set_updated_at'),('vacate_notices_set_updated_at')
)
select jsonb_build_object(

  'server', jsonb_build_object('version', version(), 'now', now()),

  'extensions', (select coalesce(jsonb_agg(extname || ' ' || extversion order by extname), '[]') from pg_extension),

  'user_role_enum', (select coalesce(jsonb_agg(e.enumlabel order by e.enumsortorder), '[]')
                     from pg_enum e join pg_type t on t.oid = e.enumtypid
                     where t.typname = 'user_role'),

  -- migration status by objects (030-035 present?)
  'missing_relations', (select coalesce(jsonb_agg(x.name order by x.name), '[]') from exp_rel x
                        where not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                                          where n.nspname = 'public' and c.relname = x.name
                                            and c.relkind in ('r','p','v','m'))),
  'missing_functions', (select coalesce(jsonb_agg(x.name order by x.name), '[]') from exp_fn x
                        where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                          where n.nspname = 'public' and p.proname = x.name)),
  'missing_columns', (select coalesce(jsonb_agg(x.tbl || '.' || x.col order by x.tbl, x.col), '[]') from exp_col x
                      where not exists (select 1 from information_schema.columns c
                                        where c.table_schema = 'public' and c.table_name = x.tbl
                                          and c.column_name = x.col)),
  'missing_triggers', (select coalesce(jsonb_agg(x.name order by x.name), '[]') from exp_trg x
                       where not exists (select 1 from pg_trigger t where t.tgname = x.name and not t.tgisinternal)),
  'auth_users_triggers', (select coalesce(jsonb_agg(tgname order by tgname), '[]') from pg_trigger
                          where tgrelid = 'auth.users'::regclass and not tgisinternal),

  -- tables: RLS, policies, exact row counts
  'tables', (select coalesce(jsonb_agg(jsonb_build_object('t', relname, 'rls', rls, 'policies', policies,
                                                          'rows', row_count) order by relname), '[]') from tbl_out),
  'rls_disabled', (select coalesce(jsonb_agg(relname order by relname), '[]') from tbl where not rls),
  'rls_on_but_no_policies', (select coalesce(jsonb_agg(relname order by relname), '[]') from tbl where rls and policies = 0),

  -- exposure to the anonymous (logged-out) role
  'anon_can_select_table_without_rls', (select coalesce(jsonb_agg(relname order by relname), '[]') from tbl
                                         where not rls and has_table_privilege('anon', oid, 'SELECT')),
  'anon_can_select_views_not_security_invoker', (select coalesce(jsonb_agg(c.relname order by c.relname), '[]')
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v' and has_table_privilege('anon', c.oid, 'SELECT')
        and not (coalesce(c.reloptions, '{}') && array['security_invoker=true','security_invoker=on'])),
  'security_definer_callable_by_anon', (select coalesce(jsonb_agg(p.proname order by p.proname), '[]')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
        and has_function_privilege('anon', p.oid, 'EXECUTE')),
  'security_definer_without_search_path', (select coalesce(jsonb_agg(p.proname order by p.proname), '[]')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
        and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')),

  -- performance: foreign keys whose first column has no index
  'fk_without_index', (select coalesce(jsonb_agg(c.conrelid::regclass::text || ' (' || c.conname || ')'
                                                 order by c.conrelid::regclass::text), '[]')
      from pg_constraint c
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace
        and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])),

  -- storage
  'buckets', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'public', public,
                                                           'max_bytes', file_size_limit) order by id), '[]')
              from storage.buckets),
  'storage_objects_policies', (select count(*) from pg_policy where polrelid = 'storage.objects'::regclass),

  -- people (counts only)
  'auth_users', (select count(*) from auth.users),
  'profiles_by_role_status', (select coalesce(jsonb_agg(jsonb_build_object('role', role::text, 'status', status::text,
                                                                           'n', n)), '[]')
                              from (select role, status, count(*) n from public.profiles group by 1, 2) s)

) as audit;


-- ===================================================================================================
-- QUERY 2: which migrations the Supabase CLI recorded as applied (run separately).
-- If it errors with "relation does not exist", migrations were never applied through the CLI
-- (e.g. pasted into the SQL editor), so QUERY 1's missing_* lists are the source of truth.
-- ===================================================================================================
select version, name from supabase_migrations.schema_migrations order by version;
