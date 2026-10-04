-- Tenant invitations: hashed single-use expiring tokens, ownership validation, atomic acceptance.
begin;
\ir support/helpers.sql
\ir support/fixtures.sql

-- extra vacant unit in landlord1's property for the phone-only case
insert into public.units (id, property_id, unit_number, monthly_rent, security_deposit)
values (t.u('2006'), t.u('1001'), 'A06', 700, 700);

-- ===== creation ======================================================================================
select t.as_user(t.u('c01'));
select t.throws($q$select public.create_tenant_invitation(t.u('2001'), 'x@example.test')$q$, 'a tenant cannot create invitations', '42501');
select t.as_anon();
select t.throws($q$select public.create_tenant_invitation(t.u('2001'), 'x@example.test')$q$, 'a visitor cannot create invitations', '42501');
select t.as_user(t.u('b02'));
select t.throws($q$select public.create_tenant_invitation(t.u('2001'), 'x@example.test')$q$,
  'a landlord cannot invite to somebody else''s unit', 'P0002', 'unit not found');
select t.as_user(t.u('b01'));
select t.throws($q$select public.create_tenant_invitation(t.u('2001'))$q$, 'invitation needs a contact', '22023');
select t.throws($q$select public.create_tenant_invitation(t.u('2001'), 'x@example.test', null, interval '100 days')$q$, 'invitation lifetime is capped', '22023');
select t.throws($q$select public.create_tenant_invitation(t.u('2001'), 'x@example.test', null, interval '-1 day')$q$, 'negative lifetime rejected', '22023');
select t.throws($q$insert into public.tenant_invitations (landlord_id, property_id, unit_id, invitee_email, token_hash, expires_at)
   values (t.landlord_pid(t.u('b01')), t.u('1001'), t.u('2001'), 'forged@example.test', 'abc', now() + interval '1 day')$q$,
  'clients cannot insert invitations directly', '42501');

select public.create_tenant_invitation(t.u('2001'), 'Tenant1@Example.test') as tok1 \gset
select t.ok(length(:'tok1') >= 40, 'token is long and random');

select t.as_owner();
select t.eq((select count(*) from public.tenant_invitations where token_hash = :'tok1')::text, '0', 'raw token is NOT stored');
select t.eq((select count(*) from public.tenant_invitations
              where token_hash = encode(sha256(convert_to(:'tok1', 'UTF8')), 'hex'))::text, '1', 'only the SHA-256 hash is stored');
select t.eq((select invitee_email from public.tenant_invitations limit 1), 'tenant1@example.test', 'email normalised to lower case');

-- visibility
select t.as_user(t.u('b01'));
select t.eq((select count(*) from public.tenant_invitations)::text, '1', 'landlord sees own invitations');
select t.as_user(t.u('b02'));
select t.eq((select count(*) from public.tenant_invitations)::text, '0', 'other landlord cannot see them');
select t.as_user(t.u('c02'));
select t.eq((select count(*) from public.tenant_invitations)::text, '0', 'a different tenant cannot see it');
select t.as_user(t.u('c01'));
select t.eq((select count(*) from public.tenant_invitations)::text, '1', 'the addressed tenant can see it');
select t.throws($q$update public.tenant_invitations set status = 'accepted', accepted_at = now()$q$, 'invitee cannot mark it accepted', '42501');

-- ===== acceptance: who may redeem ============================================================================
select t.as_user(t.u('c02'));
select t.throws(format('select public.accept_tenant_invitation(%L)', :'tok1'), 'wrong tenant cannot redeem someone else''s invitation', '42501', 'different account');
select t.as_user(t.u('b01'));
select t.throws(format('select public.accept_tenant_invitation(%L)', :'tok1'), 'landlords cannot accept invitations', '42501');
select t.as_anon();
select t.throws(format('select public.accept_tenant_invitation(%L)', :'tok1'), 'visitor cannot call accept', '42501');
select t.as_user(t.u('c01'));
select t.throws($q$select public.accept_tenant_invitation('not-a-real-token-at-all-0123456789')$q$, 'garbage token rejected', 'P0002', 'invalid or expired');
select t.throws($q$select public.accept_tenant_invitation('short')$q$, 'short token rejected', 'P0002');
select t.throws($q$select public.accept_tenant_invitation(null)$q$, 'null token rejected', 'P0002');

-- ===== acceptance creates the tenancy ================================================================================
select t.lives(format('select public.accept_tenant_invitation(%L)', :'tok1'), 'addressed tenant accepts');
select t.as_owner();
select t.eq((select status::text from public.tenancies where unit_id = t.u('2001')), 'active', 'acceptance creates an ACTIVE tenancy');
select t.eq((select tenant_id::text from public.tenancies where unit_id = t.u('2001')), t.tenant_pid(t.u('c01'))::text, 'tenancy belongs to the accepting tenant');
select t.eq((select landlord_id::text from public.tenancies where unit_id = t.u('2001')), t.landlord_pid(t.u('b01'))::text, 'tenancy landlord taken from the invitation, not the caller');
select t.eq((select monthly_rent::text from public.tenancies where unit_id = t.u('2001')), '1000.00', 'tenancy rent copied from the unit');
select t.eq((select status::text from public.units where id = t.u('2001')), 'occupied', 'unit becomes occupied');
select t.eq((select status::text from public.tenant_invitations where token_hash = encode(sha256(convert_to(:'tok1', 'UTF8')), 'hex')), 'accepted', 'invitation marked accepted');
select t.ok((select accepted_at is not null and accepted_by_tenant_id = t.tenant_pid(t.u('c01'))
              from public.tenant_invitations where token_hash = encode(sha256(convert_to(:'tok1', 'UTF8')), 'hex')), 'accepted_at/by recorded');
select t.ok((select count(*) from public.audit_logs where action in ('invitation_accepted', 'tenancy_created', 'invitation_created')) = 3, 'invitation lifecycle audited');
select t.ok((select count(*) from public.notifications where type = 'tenancy_started' and user_id = t.u('c01')) = 1
        and (select count(*) from public.notifications where type = 'invitation_accepted' and user_id = t.u('b01')) = 1, 'both parties notified');
select t.as_user(t.u('c01'));
select t.eq((select unit_number from public.tenant_tenancy_overview where tenancy_status = 'active'), 'A01', 'tenant dashboard is now linked to the unit');
select t.throws(format('select public.accept_tenant_invitation(%L)', :'tok1'), 'token is single-use', 'P0002', 'invalid or expired');

-- ===== expiry / revocation / state ==========================================================================================
select t.as_user(t.u('b01'));
select public.create_tenant_invitation(t.u('2002'), 'tenant2@example.test') as tok2 \gset
select t.as_owner();
update public.tenant_invitations set expires_at = now() - interval '1 minute'
 where token_hash = encode(sha256(convert_to(:'tok2', 'UTF8')), 'hex');
select t.as_user(t.u('c02'));
select t.throws(format('select public.accept_tenant_invitation(%L)', :'tok2'), 'expired invitation rejected', 'P0002', 'invalid or expired');

select t.as_user(t.u('b01'));
select public.create_tenant_invitation(t.u('2002'), 'tenant2@example.test') as tok3 \gset
select t.as_user(t.u('b02'));
select t.throws($q$select public.revoke_tenant_invitation((select id from public.tenant_invitations limit 1))$q$ , 'other landlord cannot see/revoke (no row)', 'P0002');
select t.as_user(t.u('b01'));
select t.lives(format($f$select public.revoke_tenant_invitation((select id from public.tenant_invitations
                         where token_hash = encode(sha256(convert_to(%L, 'UTF8')), 'hex')))$f$, :'tok3'), 'landlord revokes an invitation');
select t.as_user(t.u('c02'));
select t.throws(format('select public.accept_tenant_invitation(%L)', :'tok3'), 'revoked invitation rejected', 'P0002', 'invalid or expired');

select t.as_user(t.u('b01'));
select public.create_tenant_invitation(t.u('2002'), 'tenant2@example.test') as tok4 \gset
select t.as_owner();
update public.units set status = 'maintenance' where id = t.u('2002');
select t.as_user(t.u('c02'));
select t.throws(format('select public.accept_tenant_invitation(%L)', :'tok4'), 'cannot accept when the unit is no longer vacant', '22023', 'no longer available');
select t.as_user(t.u('b01'));
select t.throws($q$select public.create_tenant_invitation(t.u('2002'), 'z@example.test')$q$, 'cannot invite to a non-vacant unit', '22023');
select t.as_owner();
update public.units set status = 'vacant' where id = t.u('2002');

-- competing invitations for one unit: first acceptance wins, the rest are revoked
select t.as_user(t.u('b01'));
select public.create_tenant_invitation(t.u('2002'), 'tenant3@example.test') as tok5 \gset
select t.as_user(t.u('c02'));
select t.lives(format('select public.accept_tenant_invitation(%L)', :'tok4'), 'first competing invitation accepted (tenant2)');
select t.as_user(t.u('c03'));
select t.throws(format('select public.accept_tenant_invitation(%L)', :'tok5'), 'the competing invitation is dead once the unit is taken', 'P0002', 'invalid or expired');

-- ===== phone-only invitation ===================================================================================================
select t.as_user(t.u('b01'));
select public.create_tenant_invitation(t.u('2006'), null, '+254 711 000 003') as tok6 \gset
select t.as_user(t.u('c02'));
select t.throws(format('select public.accept_tenant_invitation(%L)', :'tok6'), 'phone invitation rejects a different phone', '42501', 'different account');
select t.as_user(t.u('c03'));
select t.lives(format('select public.accept_tenant_invitation(%L)', :'tok6'), 'phone invitation accepted by matching phone (formatting ignored)');

-- ===== brand-new tenant: invite first, register after =====================================================================================
select t.as_owner();
update public.units set status = 'vacant' where id = t.u('2006');
update public.tenancies set status = 'ended', end_date = current_date where unit_id = t.u('2006');
select t.as_user(t.u('b01'));
select public.create_tenant_invitation(t.u('2006'), 'newbie@example.test') as tok7 \gset
select t.as_owner();
insert into auth.users (id, email, raw_user_meta_data) values (t.u('e01'), 'newbie@example.test', '{"full_name":"Newbie"}');
select t.eq((select count(*) from public.tenancies where tenant_id = t.tenant_pid(t.u('e01')))::text, '0', 'a new tenant account starts with no tenancy');
select t.as_user(t.u('e01'));
select t.lives(format('select public.accept_tenant_invitation(%L)', :'tok7'), 'new tenant accepts after creating an account');
select t.eq((select count(*) from public.tenant_tenancy_overview where tenancy_status = 'active')::text, '1', 'new tenant dashboard linked via tenancy');

-- ===== suspended tenants cannot redeem ==============================================================================================================
select t.as_owner();
update public.units set status = 'vacant' where id = t.u('2006');
update public.tenancies set status = 'ended', end_date = current_date where unit_id = t.u('2006') and status = 'active';
select t.as_user(t.u('b01'));
select public.create_tenant_invitation(t.u('2006'), 'tenant3@example.test') as tok8 \gset
select t.as_owner();
update public.profiles set status = 'suspended' where id = t.u('c03');
select t.as_user(t.u('c03'));
select t.throws(format('select public.accept_tenant_invitation(%L)', :'tok8'), 'suspended tenant cannot redeem', '42501');

select t.as_owner();
select t.finish();
rollback;
