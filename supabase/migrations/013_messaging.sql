-- 013: conversations, participants, messages. Access is by participation only.

create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties (id) on delete set null,
  unit_id     uuid references public.units (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index conversations_property_idx on public.conversations (property_id);
create index conversations_unit_idx on public.conversations (unit_id);

create trigger conversations_set_updated_at before update on public.conversations
  for each row execute function public.set_updated_at();

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_participants_user_idx on public.conversation_participants (user_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null check (length(btrim(body)) > 0),
  created_at      timestamptz not null default now(),
  edited_at       timestamptz,
  deleted_at      timestamptz
);
create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index messages_sender_idx on public.messages (sender_id);
