-- Storage bucket privacy/policies and message edit rules.
begin;
\ir support/helpers.sql
\ir support/fixtures.sql

-- setup: tenant1 actively renting U1 with an open maintenance request; a private draft property of landlord2
insert into public.tenancies (id, tenant_id, unit_id, landlord_id, start_date, monthly_rent, status)
values (t.u('3001'), t.tenant_pid(t.u('c01')), t.u('2001'), t.landlord_pid(t.u('b01')), current_date, 1000, 'active');
update public.units set status = 'occupied' where id = t.u('2001');
insert into public.maintenance_requests (id, tenant_id, unit_id, tenancy_id, title)
values (t.u('7001'), t.tenant_pid(t.u('c01')), t.u('2001'), t.u('3001'), 'Leak');
insert into public.properties (id, landlord_id, name, address_line_1, city)
values (t.u('1004'), t.landlord_pid(t.u('b02')), 'L2 Private Draft', 'x', 'y');
insert into public.units (id, property_id, unit_number, monthly_rent) values (t.u('2005'), t.u('1004'), 'Z1', 100);

-- ===== bucket configuration =================================================================================
select t.eq((select public::text from storage.buckets where id = 'verification-documents'), 'false', 'verification-documents bucket is PRIVATE');
select t.eq((select public::text from storage.buckets where id = 'maintenance-attachments'), 'false', 'maintenance-attachments bucket is private');
select t.eq((select public::text from storage.buckets where id = 'avatars'), 'false', 'avatars bucket is private');
select t.eq((select public::text from storage.buckets where id = 'property-images'), 'true', 'property-images bucket is public-read');
select t.eq((select public::text from storage.buckets where id = 'unit-images'), 'true', 'unit-images bucket is public-read');
select t.ok((select count(*) from storage.buckets) = 5, 'exactly the five expected buckets exist');
select t.ok(not exists (
  select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
    and policyname like 'verification docs%' and 'anon' = any (roles::text[])
), 'no verification-documents policy applies to anon');

-- ===== verification documents ================================================================================
select t.as_user(t.u('b01'));
select t.lives($q$insert into storage.objects (bucket_id, name) values ('verification-documents', t.u('1001')::text || '/deed.pdf')$q$,
  'landlord uploads a verification document for own property');
select t.throws($q$insert into storage.objects (bucket_id, name) values ('verification-documents', t.u('1002')::text || '/deed.pdf')$q$,
  'landlord cannot upload into another landlord''s property folder', '42501');
select t.throws($q$insert into storage.objects (bucket_id, name) values ('verification-documents', 'not-a-uuid/deed.pdf')$q$,
  'malformed folder names are rejected', '42501');
select t.eq((select count(*) from storage.objects where bucket_id = 'verification-documents')::text, '1', 'owner reads own verification document');
select t.as_user(t.u('b02'));
select t.eq((select count(*) from storage.objects where bucket_id = 'verification-documents')::text, '0', 'other landlord cannot read it');
select t.eq(t.affected($q$delete from storage.objects where bucket_id = 'verification-documents'$q$)::text, '0', 'other landlord cannot delete it');
select t.as_user(t.u('c01'));
select t.eq((select count(*) from storage.objects where bucket_id = 'verification-documents')::text, '0', 'tenant cannot read it');
select t.as_anon();
select t.eq((select count(*) from storage.objects where bucket_id = 'verification-documents')::text, '0', 'visitor cannot read it');
select t.throws($q$insert into storage.objects (bucket_id, name) values ('verification-documents', t.u('1001')::text || '/x.pdf')$q$,
  'visitor cannot upload verification documents', '42501');
select t.as_user(t.u('a01'));
select t.eq((select count(*) from storage.objects where bucket_id = 'verification-documents')::text, '1', 'admin can read verification documents for review');

-- ===== public image buckets ================================================================================
select t.as_user(t.u('b01'));
select t.lives($q$insert into storage.objects (bucket_id, name) values ('property-images', t.u('1001')::text || '/front.jpg')$q$, 'landlord uploads a property image');
select t.lives($q$insert into storage.objects (bucket_id, name) values ('unit-images', t.u('2002')::text || '/living.jpg')$q$, 'landlord uploads a unit image');
select t.throws($q$insert into storage.objects (bucket_id, name) values ('property-images', t.u('1002')::text || '/front.jpg')$q$,
  'landlord cannot upload to another landlord''s property', '42501');
select t.throws($q$insert into storage.objects (bucket_id, name) values ('unit-images', t.u('2003')::text || '/x.jpg')$q$,
  'landlord cannot upload to another landlord''s unit', '42501');
select t.as_user(t.u('b02'));
select t.lives($q$insert into storage.objects (bucket_id, name) values ('property-images', t.u('1004')::text || '/draft.jpg')$q$, 'landlord2 uploads to own draft property');
select t.eq(t.affected($q$delete from storage.objects where bucket_id = 'property-images' and name like '%front.jpg'$q$)::text, '0', 'landlord2 cannot delete landlord1''s image');
select t.as_anon();
select t.eq((select count(*) from storage.objects where bucket_id = 'property-images' and name like '%front.jpg')::text, '1', 'visitor can read images of a public property');
select t.eq((select count(*) from storage.objects where bucket_id = 'property-images' and name like '%draft.jpg')::text, '0', 'visitor cannot read images of a non-public property');
select t.eq((select count(*) from storage.objects where bucket_id = 'unit-images' and name like '%living.jpg')::text, '1', 'visitor can read images of a public vacant unit');
select t.throws($q$insert into storage.objects (bucket_id, name) values ('property-images', t.u('1001')::text || '/anon.jpg')$q$, 'visitor cannot upload images', '42501');

-- ===== avatars =======================================================================================================
select t.as_user(t.u('c01'));
select t.lives($q$insert into storage.objects (bucket_id, name) values ('avatars', t.u('c01')::text || '/me.png')$q$, 'user uploads own avatar');
select t.throws($q$insert into storage.objects (bucket_id, name) values ('avatars', t.u('c02')::text || '/me.png')$q$, 'user cannot upload into another user''s avatar folder', '42501');
select t.as_user(t.u('c02'));
select t.eq((select count(*) from storage.objects where bucket_id = 'avatars')::text, '0', 'other users cannot read my avatar object');
select t.as_user(t.u('a01'));
select t.eq((select count(*) from storage.objects where bucket_id = 'avatars')::text, '1', 'admin can read avatars');

-- ===== maintenance attachments ======================================================================================
select t.as_user(t.u('c01'));
select t.lives($q$insert into storage.objects (bucket_id, name) values ('maintenance-attachments', t.u('7001')::text || '/leak.png')$q$, 'tenant attaches a photo to own request');
select t.as_user(t.u('c02'));
select t.throws($q$insert into storage.objects (bucket_id, name) values ('maintenance-attachments', t.u('7001')::text || '/evil.png')$q$, 'other tenant cannot attach', '42501');
select t.eq((select count(*) from storage.objects where bucket_id = 'maintenance-attachments')::text, '0', 'other tenant cannot read it');
select t.as_user(t.u('b01'));
select t.eq((select count(*) from storage.objects where bucket_id = 'maintenance-attachments')::text, '1', 'unit landlord can read the attachment');
select t.as_user(t.u('b02'));
select t.eq((select count(*) from storage.objects where bucket_id = 'maintenance-attachments')::text, '0', 'other landlord cannot read it');
select t.as_anon();
select t.eq((select count(*) from storage.objects where bucket_id = 'maintenance-attachments')::text, '0', 'visitor cannot read it');

-- ===== messages ===========================================================================================================
select t.as_user(t.u('b01'));
select public.start_conversation(t.u('c01'), 'Hello tenant') as conv \gset
select t.as_user(t.u('c01'));
select t.lives(format($f$insert into public.messages (conversation_id, sender_id, body) values (%L, t.u('c01'), 'Hi landlord')$f$, :'conv'), 'participant posts a message');
select t.throws(format($f$insert into public.messages (conversation_id, sender_id, body) values (%L, t.u('b01'), 'impersonation')$f$, :'conv'), 'cannot post as another sender', '42501');
select t.eq(t.affected($q$update public.messages set body = 'edited', edited_at = now() where sender_id = t.u('c01')$q$)::text, '1', 'sender edits own message');
select t.eq(t.affected($q$update public.messages set deleted_at = now() where sender_id = t.u('b01')$q$)::text, '0', 'cannot delete the other party''s message');
select t.throws($q$update public.messages set sender_id = t.u('b01') where sender_id = t.u('c01')$q$, 'cannot reassign message sender', '42501');
select t.throws($q$delete from public.messages$q$, 'messages are never hard-deleted by clients', '42501');
select t.as_user(t.u('c02'));
select t.eq((select count(*) from public.messages)::text, '0', 'non-participant sees no messages');
select t.eq((select count(*) from public.profiles where id = t.u('b01'))::text, '0', 'non-participant cannot resolve participant profiles');
select t.as_user(t.u('c01'));
select t.eq((select count(*) from public.profiles where id = t.u('b01'))::text, '1', 'participants can see each other''s profile');

select t.as_owner();
select t.finish();
rollback;
