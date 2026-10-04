-- Property verification: landlords prepare + submit, ONLY an admin decides; documents stay private.
begin;
\ir support/helpers.sql
\ir support/fixtures.sql

-- ===== start / upload / submit ==========================================================================
select t.as_user(t.u('b02'));
select t.throws($q$select public.start_property_verification(t.u('1003'))$q$, 'another landlord cannot start verification for my property', 'P0002');
select t.as_user(t.u('c01'));
select t.throws($q$select public.start_property_verification(t.u('1003'))$q$, 'a tenant cannot start verification', 'P0002');
select t.as_anon();
select t.throws($q$select public.start_property_verification(t.u('1003'))$q$, 'a visitor cannot start verification', '42501');

select t.as_user(t.u('b01'));
select public.start_property_verification(t.u('1003')) as req1 \gset
select t.ok(:'req1' is not null, 'landlord starts a draft verification request');
select t.eq(public.start_property_verification(t.u('1003'))::text, :'req1', 'starting again returns the same draft');
select t.throws($q$select public.submit_property_verification(t.u('1003'))$q$, 'cannot submit without documents', '22023', 'at least one');

select t.lives(format($f$insert into public.property_verification_documents (verification_request_id, document_type, storage_path)
  values (%L, 'owner_id', %L)$f$, :'req1', t.u('1003')::text || '/id.pdf'), 'landlord attaches a document to the draft');
select t.throws($q$select public.submit_property_verification(t.u('1003'))$q$, 'required document types are enforced', '22023', 'ownership_proof');
select t.throws(format($f$insert into public.property_verification_documents (verification_request_id, document_type, storage_path, status)
  values (%L, 'ownership_proof', 'x/y.pdf', 'approved')$f$, :'req1'), 'landlord cannot pre-approve a document', '42501');
select t.throws(format($f$insert into public.property_verification_documents (verification_request_id, document_type, storage_path, reviewed_by_admin_id)
  values (%L, 'ownership_proof', 'x/y.pdf', public.current_user_id())$f$, :'req1'), 'landlord cannot forge reviewer fields', '42501');
select t.lives(format($f$insert into public.property_verification_documents (verification_request_id, document_type, storage_path)
  values (%L, 'ownership_proof', %L)$f$, :'req1', t.u('1003')::text || '/deed.pdf'), 'landlord attaches the required document');

select t.as_user(t.u('b02'));
select t.throws(format($f$insert into public.property_verification_documents (verification_request_id, document_type, storage_path)
  values (%L, 'owner_id', 'x/evil.pdf')$f$, :'req1'), 'another landlord cannot attach to my request', '42501');
select t.eq((select count(*) from public.property_verification_documents)::text, '0', 'another landlord cannot read my verification documents');
select t.eq((select count(*) from public.property_verification_requests)::text, '0', 'another landlord cannot read my verification requests');
select t.as_user(t.u('c01'));
select t.eq((select count(*) from public.property_verification_documents)::text, '0', 'tenant cannot read verification documents');
select t.as_anon();
select t.throws($q$select * from public.property_verification_documents$q$, 'visitor cannot read verification documents', '42501');

select t.as_user(t.u('b01'));
select t.lives($q$select public.submit_property_verification(t.u('1003'))$q$, 'landlord submits for verification');
select t.as_owner();
select t.eq((select status::text from public.property_verification_requests where id = :'req1'), 'submitted', 'request is submitted');
select t.eq((select verification_status::text from public.properties where id = t.u('1003')), 'pending', 'property is pending, NOT verified');
select t.ok((select count(*) from public.notifications where type = 'verification_submitted' and user_id = t.u('a01')) = 1, 'admins are notified of the submission');
select t.ok((select count(*) from public.audit_logs where action = 'property_submitted_for_verification') = 1, 'submission audited');

-- ===== landlord cannot decide or tamper ===================================================================
select t.as_user(t.u('b01'));
select t.throws(format($f$select public.review_property_verification(%L, 'approved')$f$, :'req1'), 'landlord cannot approve own request', '42501', 'administrators');
select t.throws($q$update public.property_verification_requests set status = 'approved'$q$, 'landlord cannot update the request row', '42501');
select t.throws($q$update public.properties set verification_status = 'verified' where id = t.u('1003')$q$, 'landlord cannot set property verified', '42501');
select t.eq(t.affected($q$update public.property_verification_documents set status = 'approved'$q$)::text, '0', 'landlord cannot approve documents');
select t.throws(format($f$insert into public.property_verification_documents (verification_request_id, document_type, storage_path)
  values (%L, 'permit', 'late.pdf')$f$, :'req1'), 'no new documents after submission', '42501');
select t.throws($q$select public.submit_property_verification(t.u('1003'))$q$, 'cannot submit twice (no draft left)', 'P0002');
select t.throws($q$select public.start_property_verification(t.u('1003'))$q$, 'cannot start another request while one is in review', '23505');
select t.as_user(t.u('c01'));
select t.throws(format($f$select public.review_property_verification(%L, 'approved')$f$, :'req1'), 'tenant cannot review', '42501');

-- ===== admin review: reject then approve ==========================================================================
select t.as_user(t.u('a01'));
select t.eq((select count(*) from public.property_verification_requests)::text, '1', 'admin sees the verification queue');
select t.eq((select count(*) from public.property_verification_documents)::text, '2', 'admin sees the documents');
select t.throws(format($f$select public.review_property_verification(%L, 'verified')$f$, :'req1'), 'invalid decision rejected', '22023');
select t.lives(format($f$select public.review_property_verification(%L, 'under_review')$f$, :'req1'), 'admin picks the request up');
select t.eq((select verification_status::text from public.properties where id = t.u('1003')), 'under_review', 'property under_review');
select t.throws(format($f$select public.review_property_verification(%L, 'rejected')$f$, :'req1'), 'rejection requires a reason', '22023');
select t.throws(format($f$select public.review_property_verification(%L, 'rejected', '   ')$f$, :'req1'), 'blank reason rejected', '22023');
select t.lives(format($f$select public.review_property_verification(%L, 'rejected', 'Ownership document is unreadable')$f$, :'req1'), 'admin rejects with a reason');
select t.eq((select rejection_reason from public.property_verification_requests where id = :'req1'), 'Ownership document is unreadable', 'rejection reason retained');
select t.eq((select verification_status::text from public.properties where id = t.u('1003')), 'rejected', 'property rejected');
select t.eq((select reviewed_by_admin_id::text from public.property_verification_requests where id = :'req1'), t.u('a01')::text, 'reviewer recorded');
select t.throws(format($f$select public.review_property_verification(%L, 'approved')$f$, :'req1'), 'a decided request cannot be re-reviewed', '22023');
select t.ok((select count(*) from public.audit_logs where action = 'property_rejected') = 1, 'rejection audited');

select t.as_user(t.u('b01'));
select t.eq((select rejection_reason from public.property_verification_requests where id = :'req1'), 'Ownership document is unreadable', 'landlord can read why it was rejected');
select t.eq((select count(*) from public.notifications where type = 'verification_rejected')::text, '1', 'landlord notified of rejection');

-- resubmission
select public.start_property_verification(t.u('1003')) as req2 \gset
select t.ok(:'req2' <> :'req1', 'a fresh request is created after rejection');
select t.lives(format($f$insert into public.property_verification_documents (verification_request_id, document_type, storage_path)
  values (%L, 'ownership_proof', %L)$f$, :'req2', t.u('1003')::text || '/deed2.pdf'), 'new document attached');
select t.lives($q$select public.submit_property_verification(t.u('1003'))$q$, 'landlord resubmits');
select t.as_user(t.u('a01'));
select t.lives(format($f$select public.review_property_verification(%L, 'approved', 'Looks good')$f$, :'req2'), 'admin approves');
select t.eq((select verification_status::text from public.properties where id = t.u('1003')), 'verified', 'ONLY now is the property verified');
select t.eq((select status::text from public.property_verification_documents where verification_request_id = :'req2'), 'approved', 'documents approved with the request');
select t.ok((select count(*) from public.audit_logs where action = 'property_verified') = 1, 'approval audited');

-- verified + published => public
select t.as_user(t.u('b01'));
select t.lives($q$update public.properties set status = 'published' where id = t.u('1003')$q$, 'landlord publishes the verified property');
select t.as_anon();
select t.eq((select count(*) from public.properties where id = t.u('1003'))::text, '1', 'verified + published property is publicly visible');
select t.eq((select count(*) from public.public_property_listings where property_id = t.u('1003'))::text, '1', 'and appears in the public listings view');
select t.eq((select property_verification_status::text from public.public_property_listings where property_id = t.u('1003')), 'verified', 'listing carries the verified badge');
select t.as_user(t.u('b01'));
select t.throws($q$select public.start_property_verification(t.u('1003'))$q$, 'a verified property cannot be re-verified', '22023');
select t.throws($q$update public.properties set verification_status = 'unverified' where id = t.u('1003')$q$, 'landlord cannot un-verify either', '42501');

-- ===== withdraw ==============================================================================================================
select t.as_owner();
insert into public.properties (id, landlord_id, name, address_line_1, city)
values (t.u('1005'), t.landlord_pid(t.u('b01')), 'Withdraw Me', 'x', 'y');
select t.as_user(t.u('b01'));
select public.start_property_verification(t.u('1005')) as req3 \gset
select t.lives(format($f$insert into public.property_verification_documents (verification_request_id, document_type, storage_path)
  values (%L, 'ownership_proof', 'w.pdf')$f$, :'req3'), 'document for withdraw case');
select t.lives($q$select public.submit_property_verification(t.u('1005'))$q$, 'submit');
select t.as_user(t.u('b02'));
select t.throws(format($f$select public.withdraw_property_verification(%L)$f$, :'req3'), 'other landlord cannot withdraw', 'P0002');
select t.as_user(t.u('b01'));
select t.lives(format($f$select public.withdraw_property_verification(%L)$f$, :'req3'), 'owner withdraws');
select t.eq((select verification_status::text from public.properties where id = t.u('1005')), 'unverified', 'property back to unverified');
select t.as_user(t.u('a01'));
select t.throws(format($f$select public.review_property_verification(%L, 'approved')$f$, :'req3'), 'cannot review a withdrawn request', '22023');

-- ===== admin suspension ==================================================================================================
select t.lives($q$select public.admin_set_property_status(t.u('1003'), 'suspended', 'complaint upheld')$q$, 'admin suspends a verified property');
select t.eq((select verification_status::text from public.properties where id = t.u('1003')), 'suspended', 'verification also suspended');
select t.as_anon();
select t.eq((select count(*) from public.properties where id = t.u('1003'))::text, '0', 'suspended property is hidden from visitors');
select t.as_user(t.u('b01'));
select t.throws($q$select public.admin_set_property_status(t.u('1003'), 'published')$q$, 'landlord cannot call the admin RPC', '42501');
select t.throws($q$update public.properties set status = 'published' where id = t.u('1003')$q$, 'landlord cannot un-suspend', '42501');

-- ===== reports (moderation inbox) ===========================================================================================
select t.as_user(t.u('c01'));
select t.lives($q$insert into public.property_reports (property_id, reported_by, reason) values (t.u('1001'), t.u('c01'), 'Photos are stolen')$q$, 'user reports a listing');
select t.throws($q$insert into public.property_reports (property_id, reported_by, reason) values (t.u('1001'), t.u('c02'), 'spoof')$q$, 'cannot report as someone else', '42501');
select t.throws($q$insert into public.property_reports (property_id, reported_by, reason, status) values (t.u('1001'), t.u('c01'), 'x', 'resolved')$q$, 'cannot self-resolve a report', '42501');
select t.eq(t.affected($q$update public.property_reports set status = 'dismissed'$q$)::text, '0', 'reporter cannot dismiss their own report');
select t.as_user(t.u('c02'));
select t.eq((select count(*) from public.property_reports)::text, '0', 'other users cannot read the report');
select t.as_user(t.u('b01'));
select t.eq((select count(*) from public.property_reports)::text, '0', 'reported landlord cannot read the report');
select t.as_user(t.u('a01'));
select t.eq((select count(*) from public.property_reports)::text, '1', 'admin sees the report');
select t.lives($q$update public.property_reports set status = 'resolved', reviewed_by = t.u('a01'), reviewed_at = now(), resolution_notes = 'Checked' $q$, 'admin resolves it');

select t.as_owner();
select t.finish();
rollback;
