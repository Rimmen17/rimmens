-- Kririm moves into Krarim's Supabase project (the free plan's two projects are both in use).
-- Run once in the SQL editor of project "krarim", after schema.sql. One transaction: all or nothing.
--
-- Spaces: each login belongs to one space, taken from its email domain
-- (nicolai@krarim.example -> krarim, christian@kririm.example -> kririm). Every row carries
-- its space, filled in automatically, and the rules only ever show a person their own space.
-- Krarim's site needs no change for this: its rows default to its own space.
--
-- Also added here, used by Kririm (and later by Krarim): a film watchlist, private lists,
-- a note on items, notification choices per person, and phone notifications.

begin;

-- 1. Spaces ------------------------------------------------------------------

alter table public.profiles add column space text;
update public.profiles p
  set space = split_part(split_part(u.email, '@', 2), '.', 1)
  from auth.users u where u.id = p.id;
alter table public.profiles
  alter column space set not null,
  add constraint profiles_space_check check (space in ('krarim', 'kririm'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, space)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), initcap(split_part(new.email, '@', 1))),
    split_part(split_part(new.email, '@', 2), '.', 1)
  );
  return new;
end;
$$;

-- The logged-in person's space. Security definer so it can read profiles without
-- going through the profile rules (which themselves call it).
create function public.my_space()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select space from public.profiles where id = auth.uid()
$$;

revoke execute on function public.my_space() from public, anon;
grant execute on function public.my_space() to authenticated;

-- A person picked on an event or task must be from your own space (or nobody).
create function public.partner_ok(p uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p is null or exists (select 1 from public.profiles where id = p and space = public.my_space())
$$;

revoke execute on function public.partner_ok(uuid) from public, anon;
grant execute on function public.partner_ok(uuid) to authenticated;

alter table public.events add column space text not null default 'krarim' check (space in ('krarim', 'kririm'));
alter table public.lists add column space text not null default 'krarim' check (space in ('krarim', 'kririm'));
alter table public.items add column space text not null default 'krarim' check (space in ('krarim', 'kririm'));
alter table public.events alter column space set default public.my_space();
alter table public.lists alter column space set default public.my_space();
alter table public.items alter column space set default public.my_space();
create index events_space_idx on public.events (space, starts_at);
create index items_space_idx on public.items (space);

-- 2. Lists: watchlist, private lists, one fixed list of each kind per space --

alter table public.lists drop constraint lists_kind_check;
alter table public.lists add constraint lists_kind_check check (kind in ('todo', 'shopping', 'watch', 'custom'));
-- Set: a private list only this person sees. Only lists they make themselves can be private.
alter table public.lists add column owner uuid references public.profiles on delete cascade;
alter table public.lists add constraint lists_owner_custom check (owner is null or kind = 'custom');

drop index public.lists_one_per_fixed_kind;
create unique index lists_one_per_fixed_kind on public.lists (space, kind) where kind <> 'custom';

insert into public.lists (name, kind, created_by, space) values
  ('To-do', 'todo', null, 'kririm'),
  ('Indkøb', 'shopping', null, 'kririm'),
  ('Film', 'watch', null, 'kririm');

-- A short note per item (for a film: where to stream it, who recommended it).
alter table public.items add column note text not null default '' check (char_length(note) <= 200);
grant update (note) on public.items to authenticated;

-- Whether an item may go on a list: the list is in your space and visible to you;
-- an item on a private list is private too; a private item on a shared list only on the to-do.
create function public.item_allowed(p_list uuid, p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.lists l
    where l.id = p_list
      and l.space = public.my_space()
      and case
        when l.owner is not null then l.owner = auth.uid() and p_owner is not distinct from auth.uid()
        when p_owner is not null then p_owner = auth.uid() and l.kind = 'todo'
        else true
      end
  )
$$;

revoke execute on function public.item_allowed(uuid, uuid) from public, anon;
grant execute on function public.item_allowed(uuid, uuid) to authenticated;

-- 3. Rules, now per space ----------------------------------------------------

drop policy "partners read profiles" on public.profiles;
drop policy "partners read events" on public.events;
drop policy "partners add events" on public.events;
drop policy "partners edit events" on public.events;
drop policy "partners delete events" on public.events;
drop policy "partners read lists" on public.lists;
drop policy "partners add lists" on public.lists;
drop policy "partners rename lists" on public.lists;
drop policy "partners delete own lists" on public.lists;
drop policy "partners read items" on public.items;
drop policy "partners add items" on public.items;
drop policy "partners edit items" on public.items;
drop policy "partners delete items" on public.items;

create policy "partners read profiles" on public.profiles
  for select to authenticated using (space = public.my_space());

create policy "partners read events" on public.events
  for select to authenticated using (space = public.my_space());
create policy "partners add events" on public.events
  for insert to authenticated
  with check (created_by = auth.uid() and space = public.my_space() and public.partner_ok(who));
create policy "partners edit events" on public.events
  for update to authenticated
  using (space = public.my_space())
  with check (space = public.my_space() and public.partner_ok(who));
create policy "partners delete events" on public.events
  for delete to authenticated using (space = public.my_space());

create policy "partners read lists" on public.lists
  for select to authenticated using (space = public.my_space() and (owner is null or owner = auth.uid()));
create policy "partners add lists" on public.lists
  for insert to authenticated
  with check (created_by = auth.uid() and kind = 'custom' and space = public.my_space() and (owner is null or owner = auth.uid()));
create policy "partners rename lists" on public.lists
  for update to authenticated
  using (space = public.my_space() and (owner is null or owner = auth.uid()))
  with check (space = public.my_space() and (owner is null or owner = auth.uid()));
create policy "partners delete own lists" on public.lists
  for delete to authenticated using (kind = 'custom' and space = public.my_space() and (owner is null or owner = auth.uid()));

create policy "partners read items" on public.items
  for select to authenticated using (space = public.my_space() and (owner is null or owner = auth.uid()));
create policy "partners add items" on public.items
  for insert to authenticated
  with check (created_by = auth.uid() and space = public.my_space() and public.item_allowed(list_id, owner) and public.partner_ok(assignee));
create policy "partners edit items" on public.items
  for update to authenticated
  using (space = public.my_space() and (owner is null or owner = auth.uid()))
  with check (space = public.my_space() and (owner is null or owner = auth.uid()) and public.partner_ok(assignee));
create policy "partners delete items" on public.items
  for delete to authenticated using (space = public.my_space() and (owner is null or owner = auth.uid()));

-- 4. Notification choices, per person ----------------------------------------

alter table public.profiles
  add column notify_events boolean not null default true,
  add column remind_before text not null default '1d' check (remind_before in ('none', '1h', '1d')),
  add column notify_deadlines boolean not null default true,
  add column notify_todo boolean not null default true,
  add column notify_shopping boolean not null default false,
  add column notify_films boolean not null default false;

-- Each person changes only their own choices, and nothing else on their profile.
grant update (notify_events, remind_before, notify_deadlines, notify_todo, notify_shopping, notify_films)
  on public.profiles to authenticated;
create policy "own notification choices" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- 5. Phone notifications (web push), as in Rimbak ---------------------------

create table public.push_subscriptions (
  endpoint text primary key check (
    char_length(endpoint) <= 1000
    -- Only the browsers' own push services, so the function never posts anywhere else.
    and endpoint ~ '^https://[a-z0-9.-]+\.(push\.apple\.com|googleapis\.com|mozilla\.com|notify\.windows\.com)/'
  ),
  user_id uuid not null references public.profiles on delete cascade,
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;

create policy "own subscription read" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy "own subscription delete" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- Saving goes through this function, so a phone follows whoever is logged in on it now.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not logged in';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- What has been sent, so a notification never goes out twice. Only the function touches it.
create table public.notices_sent (
  key text primary key,
  sent_at timestamptz not null default now()
);

alter table public.notices_sent enable row level security;
revoke all on public.notices_sent from anon, authenticated;

grant select on public.profiles, public.events, public.lists, public.items to service_role;
grant select, delete on public.push_subscriptions to service_role;
grant select, insert, delete on public.notices_sent to service_role;

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Wakes the sending function. It takes no input and works out from the tables what is
-- due, so extra calls send nothing extra. The call carries the project's legacy anon key
-- (public by design), stored once by hand: select vault.create_secret('<anon key>', 'notify_jwt');
create function public.post_notify()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  key text;
begin
  select decrypted_secret into key from vault.decrypted_secrets where name = 'notify_jwt';
  perform net.http_post(
    url := 'https://rdabjsryzearizqbafpu.supabase.co/functions/v1/notify',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || key)
  );
end;
$$;

revoke execute on function public.post_notify() from public, anon, authenticated;

create function public.call_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.post_notify();
  return null;
exception when others then
  -- An event is never refused because the notification could not be queued.
  return null;
end;
$$;

revoke execute on function public.call_notify() from public, anon, authenticated;

-- New events go out at once; reminders, deadlines and new list items on the timer.
create trigger events_announce
  after insert on public.events
  for each statement execute function public.call_notify();

select cron.schedule('krarim-notify', '*/5 * * * *', 'select public.post_notify()');

commit;
