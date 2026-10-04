-- Tenancy lifecycle through the protected RPCs:
--   application -> approve (pending tenancy, reserved unit) -> confirm_move_in (active, occupied)
--   -> end_tenancy (history kept, unit vacant) -> move elsewhere (new tenancy, old untouched)
begin;
\ir support/helpers.sql
\ir support/fixtures.sql

create function t.tenancy_of(p_tenant_user uuid, p_unit uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select te.id from public.tenancies te join public.tenant_profiles tp on tp.id = te.tenant_id
   where tp.user_id = p_tenant_user and te.unit_id = p_unit order by te.created_at desc, te.start_date desc limit 1
$$;
create function t.tenancy_status(p_tenant_user uuid, p_unit uuid) returns text
language sql stable security definer set search_path = '' as $$
  select te.status::text from public.tenancies te where te.id = t.tenancy_of(p_tenant_user, p_unit)
$$;
create function t.unit_status(p_unit uuid) returns text
language sql stable security definer set search_path = '' as $$
  select status::text from public.units where id = p_unit
$$;
create function t.any_conversation() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.conversations limit 1
$$;
create function t.audit_count(p_action text) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from public.audit_logs where action = p_action
$$;
create function t.notif_count(p_user uuid, p_type text) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from public.notifications where user_id = p_user and type = p_type
$$;

-- ===== 1. application -> approval =================================================================
select t.as_user(t.u('c01'));
select t.lives($q$insert into public.rental_applications (id, tenant_id, unit_id, message, desired_move_in_date)
                   values (t.u('6001'), t.tenant_pid(t.u('c01')), t.u('2001'), 'I would love A01', current_date)$q$,
  'tenant applies to a vacant public unit');
select t.as_owner();
insert into public.rental_applications (id, tenant_id, unit_id) values (t.u('6002'), t.tenant_pid(t.u('c02')), t.u('2001'));

select t.as_user(t.u('c02'));
select t.throws($q$select public.approve_rental_application(t.u('6001'))$q$, 'a tenant cannot approve applications', '42501');
select t.as_user(t.u('b02'));
select t.throws($q$select public.approve_rental_application(t.u('6001'))$q$, 'another landlord cannot approve', '42501');
select t.throws($q$select public.reject_rental_application(t.u('6001'), 'nope')$q$, 'another landlord cannot reject', '42501');

select t.as_user(t.u('b01'));
select t.lives($q$select public.approve_rental_application(t.u('6001'))$q$, 'owning landlord approves the application');
select t.as_owner();
select t.eq(t.tenancy_status(t.u('c01'), t.u('2001')), 'pending', 'approval creates a PENDING tenancy (not active)');
select t.eq(t.unit_status(t.u('2001')), 'reserved', 'approval RESERVES the unit (not occupied)');
select t.eq((select status::text from public.rental_applications where id = t.u('6001')), 'approved', 'application marked approved');
select t.eq((select reviewed_by::text from public.rental_applications where id = t.u('6001')), t.u('b01')::text, 'reviewer recorded');
select t.eq((select monthly_rent::text from public.tenancies where id = t.tenancy_of(t.u('c01'), t.u('2001'))), '1000.00', 'tenancy copies the unit rent');
select t.eq((select landlord_id::text from public.tenancies where id = t.tenancy_of(t.u('c01'), t.u('2001'))),
            t.landlord_pid(t.u('b01'))::text, 'tenancy landlord = property owner');
select t.eq(t.notif_count(t.u('c01'), 'application_approved')::text, '1', 'tenant notified of approval');
select t.ok(t.audit_count('application_approved') = 1 and t.audit_count('tenancy_created') = 1, 'approval audited');

select t.as_user(t.u('b01'));
select t.throws($q$select public.approve_rental_application(t.u('6001'))$q$, 'cannot approve an already-approved application', '22023', 'not pending');
select t.throws($q$select public.approve_rental_application(t.u('6002'))$q$, 'cannot approve a second applicant for a reserved unit', '22023', 'not available');
select t.as_user(t.u('c02'));
select t.throws($q$insert into public.rental_applications (tenant_id, unit_id) values (t.tenant_pid(t.u('c02')), t.u('2001'))$q$,
  'reserved unit no longer accepts new applications', '42501');

-- ===== 2. confirm move-in ======================================================================================
select t.as_user(t.u('c01'));
select t.throws($q$select public.confirm_move_in(t.tenancy_of(t.u('c01'), t.u('2001')))$q$, 'tenant cannot confirm own move-in', '42501');
select t.as_user(t.u('b02'));
select t.throws($q$select public.confirm_move_in(t.tenancy_of(t.u('c01'), t.u('2001')))$q$, 'other landlord cannot confirm move-in', '42501');
select t.as_user(t.u('b01'));
select t.lives($q$select public.confirm_move_in(t.tenancy_of(t.u('c01'), t.u('2001')))$q$, 'landlord confirms move-in');
select t.as_owner();
select t.eq(t.tenancy_status(t.u('c01'), t.u('2001')), 'active', 'confirm_move_in -> tenancy ACTIVE');
select t.eq(t.unit_status(t.u('2001')), 'occupied', 'confirm_move_in -> unit OCCUPIED');
select t.as_user(t.u('b01'));
select t.throws($q$select public.confirm_move_in(t.tenancy_of(t.u('c01'), t.u('2001')))$q$, 'cannot confirm twice', '22023');

-- ===== 3. tenant dashboard derives everything from the tenancy ====================================================
select t.as_user(t.u('c01'));
select t.eq((select pr.name from public.tenancies te
               join public.units u on u.id = te.unit_id
               join public.properties pr on pr.id = u.property_id
              where te.status = 'active'), 'Sunrise Apartments', 'dashboard: tenancy -> unit -> property');
select t.eq((select landlord_name from public.tenant_tenancy_overview where tenancy_status = 'active'),
            'Landlord One', 'dashboard view: tenancy -> landlord name');
select t.eq((select property_name from public.tenant_tenancy_overview where tenancy_status = 'active'),
            'Sunrise Apartments', 'dashboard view: tenancy -> property');
select t.eq((select count(*) from public.tenant_tenancy_overview)::text, '1', 'dashboard view lists only the caller''s tenancies');
select t.as_user(t.u('c02'));
select t.eq((select count(*) from public.tenant_tenancy_overview)::text, '0', 'other tenant''s dashboard view is empty (no tenancy yet)');
select t.as_user(t.u('b01'));
select t.eq((select tenant_name from public.landlord_tenancy_overview where tenancy_status = 'active'), 'Tenant One', 'landlord view shows the tenant name');
select t.eq((select count(*) from public.landlord_application_overview where application_status = 'approved')::text, '1', 'landlord application view shows applicant rows');
select t.as_user(t.u('b02'));
select t.eq((select count(*) from public.landlord_tenancy_overview)::text, '0', 'other landlord''s tenancy view is empty');
select t.eq((select count(*) from public.landlord_application_overview)::text, '0', 'other landlord''s application view is empty');
select t.as_anon();
select t.throws($q$select * from public.tenant_tenancy_overview$q$, 'visitor cannot query dashboard views', '42501');
select t.as_user(t.u('c01'));
select t.eq((select count(*) from public.landlord_tenancy_overview)::text, '0', 'a tenant sees nothing in the landlord view');
select t.eq((select count(*) from public.tenancies where status = 'active')::text, '1', 'tenant has exactly one active tenancy');

-- ===== 4. rent charge + manual payment ===============================================================================
select t.as_user(t.u('b01'));
select t.lives($q$insert into public.rent_charges (id, tenancy_id, billing_period_start, billing_period_end, due_date, amount)
  values (t.u('4001'), t.tenancy_of(t.u('c01'), t.u('2001')), current_date, current_date + 29, current_date + 4, 1000)$q$, 'landlord bills the tenancy');
select t.as_user(t.u('c01'));
select t.throws($q$select public.record_manual_payment(t.u('4001'), 100, 'cash')$q$, 'tenant cannot record a payment as received', '42501');
select t.as_user(t.u('b02'));
select t.throws($q$select public.record_manual_payment(t.u('4001'), 100, 'cash')$q$, 'other landlord cannot record payments', '42501');
select t.as_user(t.u('b01'));
select t.throws($q$select public.record_manual_payment(t.u('4001'), 0, 'cash')$q$, 'zero payment rejected', '22023');
select t.lives($q$select public.record_manual_payment(t.u('4001'), 400, 'cash')$q$, 'landlord records a part payment');
select t.eq((select status::text from public.rent_charges where id = t.u('4001')), 'partially_paid', 'charge becomes partially_paid');
select t.throws($q$select public.record_manual_payment(t.u('4001'), 700, 'cash')$q$, 'payment above the balance rejected', '22023');
select t.lives($q$select public.record_manual_payment(t.u('4001'), 600, 'bank')$q$, 'landlord records the remainder');
select t.eq((select status::text from public.rent_charges where id = t.u('4001')), 'paid', 'charge becomes paid');
select t.throws($q$select public.record_manual_payment(t.u('4001'), 1, 'cash')$q$, 'cannot pay a settled charge', '22023');
select t.as_user(t.u('c01'));
select t.eq((select count(*) from public.payments where status = 'successful')::text, '2', 'tenant sees the recorded payments');
select t.as_owner();

-- maintenance request that must survive move-out
select t.as_user(t.u('c01'));
select t.lives($q$insert into public.maintenance_requests (id, tenant_id, unit_id, tenancy_id, title)
  values (t.u('7001'), t.tenant_pid(t.u('c01')), t.u('2001'), t.tenancy_of(t.u('c01'), t.u('2001')), 'Tap leaks')$q$, 'tenant raises a request');

-- ===== 5. end tenancy: history preserved ===============================================================================
select t.as_user(t.u('c01'));
select t.throws($q$select public.end_tenancy(t.tenancy_of(t.u('c01'), t.u('2001')), current_date, 'bye')$q$, 'tenant cannot end own tenancy through the API', '42501');
select t.as_user(t.u('b02'));
select t.throws($q$select public.end_tenancy(t.tenancy_of(t.u('c01'), t.u('2001')), current_date, 'x')$q$, 'other landlord cannot end it', '42501');
select t.as_user(t.u('b01'));
select t.throws($q$select public.end_tenancy(t.tenancy_of(t.u('c01'), t.u('2001')), current_date + 5, 'x')$q$, 'end date in the future rejected', '22023');
select t.throws($q$select public.end_tenancy(t.tenancy_of(t.u('c01'), t.u('2001')), current_date - 3650, 'x')$q$, 'end date before start rejected', '22023');
select t.lives($q$select public.end_tenancy(t.tenancy_of(t.u('c01'), t.u('2001')), current_date, 'Moved out, keys returned')$q$, 'landlord ends the tenancy');
select t.as_owner();
select t.eq(t.tenancy_status(t.u('c01'), t.u('2001')), 'ended', 'tenancy status = ended');
select t.eq((select end_date::text from public.tenancies where id = t.tenancy_of(t.u('c01'), t.u('2001'))), current_date::text, 'end_date populated');
select t.eq((select move_out_notes from public.tenancies where id = t.tenancy_of(t.u('c01'), t.u('2001'))), 'Moved out, keys returned', 'move-out notes kept');
select t.eq(t.unit_status(t.u('2001')), 'vacant', 'unit is vacant again');
select t.ok(exists (select 1 from public.tenant_profiles where user_id = t.u('c01')), 'tenant profile survives move-out');
select t.eq((select status::text from public.profiles where id = t.u('c01')), 'active', 'tenant account stays active');
select t.eq((select count(*) from public.payments where tenancy_id = t.tenancy_of(t.u('c01'), t.u('2001')))::text, '2', 'old payments preserved');
select t.eq((select count(*) from public.maintenance_requests where tenancy_id = t.tenancy_of(t.u('c01'), t.u('2001')))::text, '1', 'old maintenance preserved');
select t.eq((select count(*) from public.rent_charges where tenancy_id = t.tenancy_of(t.u('c01'), t.u('2001')))::text, '1', 'old charges preserved');
select t.eq(t.notif_count(t.u('c01'), 'tenancy_ended')::text, '1', 'tenant notified of move-out');
select t.as_user(t.u('c01'));
select t.eq((select count(*) from public.tenancies where status = 'active')::text, '0', 'tenant now has NO active tenancy (account still works)');
select t.eq((select count(*) from public.tenancies where status = 'ended')::text, '1', 'tenant can still read the ended tenancy (history)');
select t.eq((select count(*) from public.units where id = t.u('2001'))::text, '1', 'tenant can still read the unit of a past tenancy');
select t.as_user(t.u('b01'));
select t.throws($q$select public.end_tenancy(t.tenancy_of(t.u('c01'), t.u('2001')), current_date, 'again')$q$, 'cannot end a tenancy twice', '22023');

-- ===== 6. moving to another property creates a NEW tenancy ==============================================================
select t.as_user(t.u('c01'));
select t.lives($q$insert into public.rental_applications (id, tenant_id, unit_id) values (t.u('6003'), t.tenant_pid(t.u('c01')), t.u('2003'))$q$,
  'former tenant applies elsewhere (Green View)');
select t.as_user(t.u('b02'));
select t.lives($q$select public.approve_rental_application(t.u('6003'))$q$, 'landlord 2 approves');
select t.lives($q$select public.confirm_move_in(t.tenancy_of(t.u('c01'), t.u('2003')))$q$, 'landlord 2 confirms move-in');
select t.as_owner();
select t.eq((select count(*) from public.tenancies where tenant_id = t.tenant_pid(t.u('c01')))::text, '2', 'tenant now has two tenancy rows: old + new');
select t.eq(t.tenancy_status(t.u('c01'), t.u('2001')), 'ended', 'old tenancy untouched (still ended)');
select t.eq(t.tenancy_status(t.u('c01'), t.u('2003')), 'active', 'new tenancy active');
select t.as_user(t.u('b01'));
select t.eq((select count(*) from public.tenancies where tenant_id = t.tenant_pid(t.u('c01')))::text, '1', 'landlord 1 sees only the tenancy on their own property');

-- ===== 7. reject / cancel paths ================================================================================================
select t.as_owner();
insert into public.rental_applications (id, tenant_id, unit_id) values
  (t.u('6004'), t.tenant_pid(t.u('c03')), t.u('2002')),
  (t.u('6005'), t.tenant_pid(t.u('c02')), t.u('2002'));
select t.as_user(t.u('b01'));
select t.throws($q$select public.reject_rental_application(t.u('6004'), '  ')$q$, 'rejection needs a reason', '22023');
select t.lives($q$select public.reject_rental_application(t.u('6004'), 'Incomplete references')$q$, 'landlord rejects with a reason');
select t.as_user(t.u('c03'));
select t.eq((select rejection_reason from public.rental_applications where id = t.u('6004')), 'Incomplete references', 'tenant can read the rejection reason');
select t.eq((select status::text from public.rental_applications where id = t.u('6004')), 'rejected', 'application rejected');
select t.eq(t.unit_status(t.u('2002')), 'vacant', 'rejection leaves the unit vacant');
select t.as_user(t.u('b01'));
select t.throws($q$select public.reject_rental_application(t.u('6004'), 'again')$q$, 'cannot reject twice', '22023');

select t.lives($q$select public.approve_rental_application(t.u('6005'))$q$, 'approve c02 for A02');
select t.eq(t.unit_status(t.u('2002')), 'reserved', 'A02 reserved');
select t.lives($q$select public.cancel_pending_tenancy(t.tenancy_of(t.u('c02'), t.u('2002')), 'applicant withdrew')$q$, 'landlord cancels the pending tenancy');
select t.eq(t.tenancy_status(t.u('c02'), t.u('2002')), 'cancelled', 'pending tenancy cancelled (row kept)');
select t.eq(t.unit_status(t.u('2002')), 'vacant', 'cancelling releases the unit');
select t.as_user(t.u('c02'));
select t.throws($q$select public.cancel_pending_tenancy(t.tenancy_of(t.u('c02'), t.u('2002')))$q$, 'tenant cannot cancel through the RPC', '42501');

-- ===== 8. notices (audience scoping) =================================================================================================
select t.as_owner();
insert into public.rental_applications (id, tenant_id, unit_id) values (t.u('6006'), t.tenant_pid(t.u('c03')), t.u('2002'));
select t.as_user(t.u('b01'));
select t.lives($q$select public.approve_rental_application(t.u('6006'))$q$, 'approve c03 for A02');
select t.lives($q$select public.confirm_move_in(t.tenancy_of(t.u('c03'), t.u('2002')))$q$, 'c03 moves in');
select t.throws($q$select public.send_notice('Empty', 'Nobody lives here', null, t.u('2001'))$q$, 'notice to a vacant unit has no recipients', '22023');
select t.throws($q$select public.send_notice('Hijack', 'x', t.u('1002'))$q$, 'landlord cannot notice another landlord''s property', 'P0002');
select t.lives($q$select public.send_notice('Water cut', 'Water off 9-12 on Friday', t.u('1001'))$q$, 'landlord notices own property');
select t.as_user(t.u('c03'));
select t.eq((select count(*) from public.notices)::text, '1', 'tenant of the property receives the notice');
select t.as_user(t.u('c01'));
select t.eq((select count(*) from public.notices)::text, '0', 'tenant of another property does not');
select t.as_user(t.u('c02'));
select t.eq((select count(*) from public.notices)::text, '0', 'tenant without tenancy does not');
select t.as_user(t.u('c03'));
select t.eq(t.affected($q$update public.notice_recipients set read_at = now()$q$)::text, '1', 'tenant marks own notice read');
select t.throws($q$select public.send_notice('Rent up', 'Pay more', t.u('1001'))$q$, 'tenants cannot send notices', '42501');

-- ===== 9. messaging ==============================================================================================================================
select t.as_user(t.u('b01'));
select t.lives($q$select public.start_conversation(t.u('c03'), 'Welcome to Sunrise!')$q$, 'landlord messages own tenant');
select t.as_user(t.u('b02'));
select t.throws($q$select public.start_conversation(t.u('c03'), 'hello')$q$, 'landlord cannot message a tenant they have no dealings with', '42501');
select t.as_user(t.u('c03'));
select t.eq((select count(*) from public.messages)::text, '1', 'participant reads the conversation');
select t.lives($q$select public.start_conversation(t.u('b01'), 'Thanks!')$q$, 'tenant replies (conversation reused)');
select t.eq((select count(*) from public.conversations)::text, '1', 'no duplicate conversation created');
select t.eq((select count(*) from public.messages)::text, '2', 'both messages in one thread');
select t.throws($q$select public.start_conversation(t.u('b02'), 'hi')$q$, 'tenant cannot message an unrelated landlord', '42501');
select t.as_user(t.u('c01'));
select t.eq((select count(*) from public.messages)::text, '0', 'non-participant cannot read messages');
select t.eq((select count(*) from public.conversations)::text, '0', 'non-participant cannot see the conversation');
select t.eq((select count(*) from public.conversation_participants)::text, '0', 'non-participant cannot see participants');
select t.throws($q$insert into public.messages (conversation_id, sender_id, body)
  values (t.any_conversation(), t.u('c01'), 'intruder')$q$, 'non-participant cannot post into a conversation', '42501');
select t.as_user(t.u('a01'));
select t.eq((select count(*) from public.messages)::text, '0', 'even admins cannot read private messages');

-- ===== 10. admin operations & audit ===================================================================================================================
select t.as_user(t.u('b01'));
select t.throws($q$select public.admin_set_user_status(t.u('c03'), 'suspended')$q$, 'landlord cannot suspend users', '42501');
select t.as_user(t.u('a01'));
select t.throws($q$select public.admin_set_user_status(t.u('a01'), 'suspended')$q$, 'admin cannot suspend self', '22023');
select t.lives($q$select public.admin_set_user_status(t.u('c02'), 'suspended', 'spam')$q$, 'admin suspends a user');
select t.eq((select status::text from public.profiles where id = t.u('c02')), 'suspended', 'status changed');
select t.ok((select count(*) from public.audit_logs where action = 'user_suspended') = 1, 'admin can read audit logs incl. user_suspended');
select t.ok((select count(*) from public.audit_logs) >= 10, 'audit trail recorded the lifecycle');
select t.lives($q$select public.admin_set_property_status(t.u('1002'), 'suspended', 'reported')$q$, 'admin suspends a property');
select t.as_anon();
select t.eq((select count(*) from public.properties where id = t.u('1002'))::text, '0', 'suspended property disappears from the public site');
select t.as_user(t.u('b02'));
select t.throws($q$update public.properties set status = 'published' where id = t.u('1002')$q$, 'landlord cannot un-suspend', '42501');

-- ===== 11. scheduled job ===============================================================================================================================
select t.as_user(t.u('c03'));
select t.throws($q$select public.mark_overdue_charges()$q$, 'users cannot run mark_overdue_charges', '42501');
select t.as_service();
select t.lives($q$select public.mark_overdue_charges()$q$, 'service role can run mark_overdue_charges');

select t.as_owner();
select t.finish();
rollback;
