-- Answers on events (Kommer, Bliver forsinket, Kommer ikke, with a short note), as in Rimbak.
-- Run once in the SQL editor of project "krarim", after spaces.sql and rimmens.sql.
-- Used by The Rimmens. Each person sees the answers on events in their own space and
-- writes only their own answer. The event's creator can be told when someone answers.
-- One transaction: all or nothing.
begin;

create table public.responses (
  event_id uuid not null references public.events on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  status text not null check (status in ('joining', 'late', 'not_joining')),
  note text not null default '' check (char_length(note) <= 120),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- The time of an answer is always the database's own, so a notification key is never forged.
create function public.responses_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger responses_touch
  before insert or update on public.responses
  for each row execute function public.responses_touch();

-- An event in the logged-in person's own space.
create function public.event_in_my_space(e uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.events where id = e and space = public.my_space())
$$;

revoke execute on function public.event_in_my_space(uuid) from public, anon;
grant execute on function public.event_in_my_space(uuid) to authenticated;

alter table public.responses enable row level security;
revoke all on public.responses from anon, authenticated;
grant select, insert, update, delete on public.responses to authenticated;

create policy "space reads answers" on public.responses
  for select to authenticated using (public.event_in_my_space(event_id));
create policy "own answer insert" on public.responses
  for insert to authenticated
  with check (user_id = auth.uid() and public.event_in_my_space(event_id));
create policy "own answer update" on public.responses
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.event_in_my_space(event_id));
create policy "own answer delete" on public.responses
  for delete to authenticated using (user_id = auth.uid());

-- Notification choice: tell me when someone answers an event I made. On by default.
alter table public.profiles add column notify_responses boolean not null default true;
grant update (notify_responses) on public.profiles to authenticated;

-- The sending function reads the answers; an answer wakes it at once.
grant select on public.responses to service_role;
create trigger responses_announce
  after insert or update on public.responses
  for each statement execute function public.call_notify();

alter publication supabase_realtime add table public.responses;

commit;
