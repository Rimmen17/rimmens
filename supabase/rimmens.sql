-- Adds The Rimmens as a third space in the shared project (after spaces.sql).
-- Accounts <name>@rimmens.example land in space "rimmens"; the existing rules keep it apart.
-- One transaction: all or nothing.
begin;

alter table public.profiles drop constraint profiles_space_check;
alter table public.profiles add constraint profiles_space_check check (space in ('krarim', 'kririm', 'rimmens'));
alter table public.events drop constraint events_space_check;
alter table public.events add constraint events_space_check check (space in ('krarim', 'kririm', 'rimmens'));
alter table public.lists drop constraint lists_space_check;
alter table public.lists add constraint lists_space_check check (space in ('krarim', 'kririm', 'rimmens'));
alter table public.items drop constraint items_space_check;
alter table public.items add constraint items_space_check check (space in ('krarim', 'kririm', 'rimmens'));

insert into public.lists (name, kind, created_by, space) values
  ('To-do', 'todo', null, 'rimmens'),
  ('Indkøb', 'shopping', null, 'rimmens'),
  ('Film', 'watch', null, 'rimmens');

commit;
