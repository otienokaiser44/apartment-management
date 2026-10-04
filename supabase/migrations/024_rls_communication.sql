-- 024: RLS for notices, messaging and notifications.
-- Messages are visible only to conversation participants (admins included: no back door).

alter table public.notices enable row level security;
alter table public.notice_recipients enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

-- notices (created by send_notice(); read by creator, recipients, admins) -------------
create policy notices_select_creator on public.notices
  for select to authenticated using (created_by = auth.uid());
create policy notices_select_recipient on public.notices
  for select to authenticated using (
    published_at <= now() and (expires_at is null or expires_at > now())
    and public.is_notice_recipient(id)
  );
create policy notices_select_admin on public.notices
  for select to authenticated using (public.is_admin());

create policy notice_recipients_select_tenant on public.notice_recipients
  for select to authenticated using (tenant_id = public.my_tenant_profile_id());
create policy notice_recipients_select_creator on public.notice_recipients
  for select to authenticated using (public.is_notice_creator(notice_id));
create policy notice_recipients_select_admin on public.notice_recipients
  for select to authenticated using (public.is_admin());
create policy notice_recipients_update_tenant on public.notice_recipients
  for update to authenticated
  using (tenant_id = public.my_tenant_profile_id())
  with check (tenant_id = public.my_tenant_profile_id());

create or replace function public.guard_notice_recipients_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    if new.notice_id is distinct from old.notice_id or new.tenant_id is distinct from old.tenant_id then
      raise exception 'only read_at may be changed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger notice_recipients_guard before update on public.notice_recipients
  for each row execute function public.guard_notice_recipients_update();

-- conversations / participants (created by start_conversation()) ---------------------
create policy conversations_select_participant on public.conversations
  for select to authenticated using (public.is_conversation_participant(id));
create policy participants_select_same_conversation on public.conversation_participants
  for select to authenticated using (public.is_conversation_participant(conversation_id));

-- messages ---------------------------------------------------------------------------
create policy messages_select_participant on public.messages
  for select to authenticated using (public.is_conversation_participant(conversation_id));
create policy messages_insert_participant on public.messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and public.is_conversation_participant(conversation_id)
    and edited_at is null and deleted_at is null
  );
create policy messages_update_own on public.messages
  for update to authenticated
  using (sender_id = auth.uid() and public.is_conversation_participant(conversation_id))
  with check (sender_id = auth.uid());

create or replace function public.guard_messages_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.conversation_id is distinct from old.conversation_id
       or new.sender_id is distinct from old.sender_id
       or new.created_at is distinct from old.created_at then
      raise exception 'message identity is immutable' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger messages_guard before update on public.messages
  for each row execute function public.guard_messages_update();

-- notifications ----------------------------------------------------------------------
create policy notifications_select_own on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy notifications_select_admin on public.notifications
  for select to authenticated using (public.is_admin());
create policy notifications_update_own on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.guard_notifications_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.user_id is distinct from old.user_id
       or new.type is distinct from old.type
       or new.title is distinct from old.title
       or new.body is distinct from old.body
       or new.data is distinct from old.data then
      raise exception 'only read_at may be changed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger notifications_guard before update on public.notifications
  for each row execute function public.guard_notifications_update();

revoke all on public.notices, public.notice_recipients, public.conversations,
  public.conversation_participants, public.messages, public.notifications from anon;
revoke insert, delete, truncate on public.notices, public.notice_recipients, public.conversations,
  public.conversation_participants, public.notifications from authenticated;
revoke update, truncate on public.notices, public.conversations, public.conversation_participants
  from authenticated;
revoke delete, truncate on public.messages from authenticated;
