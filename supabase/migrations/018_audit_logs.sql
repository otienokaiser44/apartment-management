-- 018: central append-only audit trail. Rows are written only by write_audit_log() (019);
-- no UPDATE/DELETE policy or privilege is ever granted to application roles.

create table public.audit_logs (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles (id) on delete set null,
  action        text not null,
  entity_type   text not null,
  entity_id     uuid,
  old_values    jsonb,
  new_values    jsonb,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index audit_logs_actor_idx on public.audit_logs (actor_user_id);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- Defence in depth: no UPDATE/DELETE on audit rows, whatever the policies say.
-- (A table owner can still TRUNCATE or drop the trigger; application roles cannot.)
create or replace function public.audit_logs_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end;
$$;

create trigger audit_logs_no_update_delete
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();
