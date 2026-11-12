import { nameToEmail } from './dates.js';

let sb;
let domain;
let me = null;
let space;

const PREF_COLUMNS = 'notify_events, remind_before, notify_deadlines, notify_todo, notify_shopping, notify_films, notify_responses';

export async function init(config) {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  // Krarim and Kririm live on the same address and use the same project, so the login is
  // kept under this site's own key; otherwise one site would pick up another's session.
  sb = createClient(config.supabaseUrl, config.supabaseAnonKey, { auth: { storageKey: 'rimmens-auth' } });
  domain = config.loginDomain;
  space = config.loginDomain.split('.')[0];
}

function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}

const toPrefs = (p) => ({
  events: p.notify_events,
  remindBefore: p.remind_before,
  deadlines: p.notify_deadlines,
  todo: p.notify_todo,
  shopping: p.notify_shopping,
  films: p.notify_films,
  responses: p.notify_responses,
});

async function loadProfile(id) {
  const p = check(await sb.from('profiles').select(`id, name, space, ${PREF_COLUMNS}`).eq('id', id).single());
  // Only The Rimmens' own accounts belong here.
  if (p.space !== space) {
    await sb.auth.signOut({ scope: 'local' });
    return null;
  }
  me = { id: p.id, name: p.name, prefs: toPrefs(p) };
  return me;
}

export async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session ? loadProfile(data.session.user.id) : null;
}

export async function signIn(name, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email: nameToEmail(name, domain), password });
  if (error) throw new Error('Forkert navn eller adgangskode');
  const profile = await loadProfile(data.user.id);
  if (!profile) throw new Error('Forkert navn eller adgangskode');
  return profile;
}

export async function signOut() {
  me = null;
  await sb.auth.signOut();
}

export async function listProfiles() {
  return check(await sb.from('profiles').select('id, name').order('name'));
}

export async function savePrefs(prefs) {
  check(await sb.from('profiles').update({
    notify_events: prefs.events,
    remind_before: prefs.remindBefore,
    notify_deadlines: prefs.deadlines,
    notify_todo: prefs.todo,
    notify_shopping: prefs.shopping,
    notify_films: prefs.films,
    notify_responses: prefs.responses,
  }).eq('id', me.id));
  me.prefs = { ...prefs };
}

export async function listEvents(fromIso) {
  const rows = check(await sb.from('events').select('*').gte('starts_at', fromIso).order('starts_at'));
  return rows.map((e) => ({
    id: e.id,
    title: e.title,
    description: e.description,
    location: e.location,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    allDay: e.all_day,
    who: e.who,
    createdBy: e.created_by,
  }));
}

export async function saveEvent(ev) {
  const row = {
    title: ev.title,
    description: ev.description,
    location: ev.location,
    starts_at: ev.startsAt,
    ends_at: ev.endsAt,
    all_day: ev.allDay,
    who: ev.who,
  };
  check(ev.id ? await sb.from('events').update(row).eq('id', ev.id) : await sb.from('events').insert(row));
}

export async function deleteEvent(id) {
  check(await sb.from('events').delete().eq('id', id));
}

export async function listResponses(eventIds) {
  if (!eventIds.length) return [];
  const rows = check(await sb.from('responses').select('event_id, user_id, status, note').in('event_id', eventIds));
  return rows.map((r) => ({ eventId: r.event_id, userId: r.user_id, status: r.status, note: r.note }));
}

// Your own answer only; the database refuses anyone else's.
export async function setResponse(eventId, status, note) {
  check(await sb.from('responses').upsert({ event_id: eventId, user_id: me.id, status, note }));
}

export async function listLists() {
  return check(await sb.from('lists').select('id, name, kind, owner').order('created_at'));
}

// A new list is shared, or private to the person making it. That cannot change later.
export async function saveList({ id, name, isPrivate }) {
  if (id) {
    check(await sb.from('lists').update({ name }).eq('id', id));
    return id;
  }
  return check(await sb.from('lists').insert({ name, owner: isPrivate ? me.id : null }).select('id').single()).id;
}

export async function deleteList(id) {
  const gone = check(await sb.from('lists').delete().eq('id', id).select('id'));
  if (!gone.length) throw new Error('Denne liste kan ikke slettes');
}

export async function listItems() {
  const rows = check(await sb.from('items').select('*'));
  return rows.map((i) => ({
    id: i.id,
    listId: i.list_id,
    text: i.text,
    note: i.note,
    done: i.done,
    assignee: i.assignee,
    owner: i.owner,
    due: i.due,
    createdBy: i.created_by,
    createdAt: i.created_at,
    doneAt: i.done_at,
  }));
}

export async function addItem(listId, fields) {
  check(await sb.from('items').insert({
    list_id: listId,
    text: fields.text,
    note: fields.note ?? '',
    assignee: fields.assignee ?? null,
    owner: fields.owner ?? null,
    due: fields.due ?? null,
  }));
}

export async function updateItem(id, patch) {
  const row = {};
  for (const key of ['text', 'note', 'assignee', 'due']) {
    if (key in patch) row[key] = patch[key];
  }
  if ('done' in patch) {
    row.done = patch.done;
    row.done_at = patch.done ? new Date().toISOString() : null;
  }
  check(await sb.from('items').update(row).eq('id', id));
}

export async function deleteItem(id) {
  check(await sb.from('items').delete().eq('id', id));
}

export async function deleteItems(ids) {
  if (ids.length) check(await sb.from('items').delete().in('id', ids));
}

// Phone notifications: the device is tied to whoever is logged in on it.
export async function savePushSubscription(sub) {
  const { endpoint, keys } = sub.toJSON();
  check(await sb.rpc('save_push_subscription', { p_endpoint: endpoint, p_p256dh: keys.p256dh, p_auth: keys.auth }));
}

export async function removePushSubscription(endpoint) {
  check(await sb.from('push_subscriptions').delete().eq('endpoint', endpoint));
}

export async function hasPushSubscription(endpoint) {
  return check(await sb.from('push_subscriptions').select('endpoint').eq('endpoint', endpoint)).length > 0;
}

// Live updates: anything the partner changes shows up without reloading.
export function subscribe(onChange) {
  sb.channel('rimmens')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'responses' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lists' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, onChange)
    .subscribe();
}
