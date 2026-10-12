-- Account settings: profile guards, email mirroring, notification preferences, self-service deactivation.
begin;
\ir support/helpers.sql
\ir support/fixtures.sql

-- ===== profile guards =============================================================================
select t.as_user(t.u('c01'));
select t.throws($q$update public.profiles set email = 'someone-else@example.test' where id = t.u('c01')$q$,
  'a user cannot rewrite their own profile email', '42501', 'email is managed');
select t.eq(t.affected($q$update public.profiles set full_name = 'Renamed', phone = '+254799000000' where id = t.u('c01')$q$)::text, '1',
  'name and phone remain editable');
select t.throws($q$update public.profiles set avatar_path = 'someone-else/avatar.webp' where id = t.u('c01')$q$,
  'avatar path must be in the user''s own folder', '42501');
select t.eq(t.affected(format($q$update public.profiles set avatar_path = '%s/a.webp' where id = %L$q$, t.u('c01'), t.u('c01')))::text, '1',
  'own avatar path is allowed');
select t.throws($q$update public.profiles set role = 'admin' where id = t.u('c01')$q$, 'role guard still holds', '42501');

-- ===== email mirroring (a confirmed sign-in email change) ==============================================
select t.as_owner();
update auth.users set email = 'tenant1.new@example.test' where id = t.u('c01');
select t.eq((select email from public.profiles where id = t.u('c01')), 'tenant1.new@example.test',
  'a confirmed sign-in email change is mirrored into profiles');
update auth.users set raw_user_meta_data = '{"full_name":"Tenant One"}' where id = t.u('c01');
select t.eq((select email from public.profiles where id = t.u('c01')), 'tenant1.new@example.test', 'unrelated auth updates leave it alone');

-- ===== notification categories ================================================================================
select t.eq(public.notification_category('invoice_issued'), 'billing', 'invoices are billing');
select t.eq(public.notification_category('notice'), 'announcements', 'notices are announcements');
select t.eq(public.notification_category('tenancy_started'), 'tenancy', 'tenancy events are tenancy');
select t.eq(public.notification_category('staff_joined'), 'staff', 'staff events are staff');
select t.eq(public.notification_category('message'), 'other', 'unknown types are uncategorised');

-- ===== notification preferences ===================================================================================
select t.as_user(t.u('c01'));
select t.lives($q$insert into public.notification_preferences (user_id, muted_categories) values (t.u('c01'), array['billing'])$q$,
  'a user saves their own preferences');
select t.throws($q$insert into public.notification_preferences (user_id, muted_categories) values (t.u('c02'), '{}')$q$,
  'cannot write someone else''s preferences', '42501');
select t.throws($q$update public.notification_preferences set muted_categories = array['security'] where user_id = t.u('c01')$q$,
  'unknown categories are rejected', '23514');
select t.as_user(t.u('c02'));
select t.eq((select count(*) from public.notification_preferences)::text, '0', 'preferences are private to their owner');

select t.as_owner();
select public.notify_user(t.u('c01'), 'invoice_issued', 'Invoice', 'x');
select public.notify_user(t.u('c01'), 'notice', 'Notice', 'x');
select public.notify_user(t.u('c01'), 'message', 'Message', 'x');
select t.eq((select count(*) from public.notifications where user_id = t.u('c01') and type = 'invoice_issued')::text, '0', 'a muted category is not delivered');
select t.eq((select count(*) from public.notifications where user_id = t.u('c01') and type = 'notice')::text, '1', 'other categories still arrive');
select t.eq((select count(*) from public.notifications where user_id = t.u('c01') and type = 'message')::text, '1', 'uncategorised types can never be muted');
select t.eq((select count(*) from public.notifications where user_id = t.u('c02') and type = 'invoice_issued')::text, '0', 'sanity: nothing leaked to others');
select public.notify_user(t.u('c02'), 'invoice_issued', 'Invoice', 'x');
select t.eq((select count(*) from public.notifications where user_id = t.u('c02') and type = 'invoice_issued')::text, '1', 'users without preferences get everything');

update public.notification_preferences set muted_categories = '{}' where user_id = t.u('c01');
select public.notify_user(t.u('c01'), 'invoice_issued', 'Invoice again', 'x');
select t.eq((select count(*) from public.notifications where user_id = t.u('c01') and type = 'invoice_issued')::text, '1', 'unmuting restores delivery');

-- ===== self-service deactivation ====================================================================================
insert into public.tenancies (id, tenant_id, unit_id, landlord_id, start_date, monthly_rent, security_deposit, status)
values (t.u('3001'), t.tenant_pid(t.u('c01')), t.u('2001'), t.landlord_pid(t.u('b01')), current_date - 30, 1000, 1000, 'active');
update public.units set status = 'occupied' where id = t.u('2001');
insert into public.rental_applications (id, tenant_id, unit_id, message)
values (t.u('4001'), t.tenant_pid(t.u('c02')), t.u('2002'), 'hello');

select t.as_anon();
select t.throws($q$select public.deactivate_my_account()$q$, 'a visitor cannot call it', '42501');
select t.as_user(t.u('c01'));
select t.throws($q$select public.deactivate_my_account()$q$, 'a tenant with an active tenancy is blocked', '22023', 'active or pending tenancy');
select t.as_user(t.u('b01'));
select t.throws($q$select public.deactivate_my_account()$q$, 'a landlord with active tenants is blocked', '22023', 'active or pending tenancies');
select t.as_user(t.u('a01'));
select t.throws($q$select public.deactivate_my_account()$q$, 'administrators cannot self-deactivate', '42501');

-- a tenant with only a pending application can leave; the application is withdrawn
select t.as_user(t.u('c02'));
select t.lives($q$select public.deactivate_my_account()$q$, 'a tenant without tenancies can deactivate');
select t.as_owner();
select t.eq((select status::text from public.profiles where id = t.u('c02')), 'disabled', 'the account is disabled');
select t.eq((select status::text from public.rental_applications where id = t.u('4001')), 'withdrawn', 'pending applications are withdrawn');
select t.eq((select count(*) from public.audit_logs where action = 'account_deactivated')::text, '1', 'it is audited');
select t.as_user(t.u('c02'));
select t.ok(public.my_tenant_profile_id() is null, 'a disabled account loses its tenant identity');
select t.throws($q$select public.deactivate_my_account()$q$, 'cannot deactivate twice', '22023', 'not active');

-- a landlord with no tenancies: open invitations are revoked
select t.as_user(t.u('b02'));
select public.create_tenant_invitation(t.u('2003'), 'pending@example.test') as inv_tok \gset
select t.lives($q$select public.deactivate_my_account()$q$, 'a landlord without active tenancies can deactivate');
select t.as_owner();
select t.eq((select count(*) from public.tenant_invitations where landlord_id = t.landlord_pid(t.u('b02')) and status = 'pending')::text, '0',
  'their pending invitations are revoked');
select t.eq((select status::text from public.profiles where id = t.u('b02')), 'disabled', 'landlord account is disabled');

select t.finish();
rollback;
