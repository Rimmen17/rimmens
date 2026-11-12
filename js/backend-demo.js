// Stand-in for Supabase so the site can be tried without a database.
// Used only while config.supabaseUrl is empty. Data stays in this browser.
// It follows the same privacy rules as the database.
import { dateKey, startOfDay } from './dates.js';

const KEY = 'rimmens-demo';
const PASSWORD = 'demo123';
const USERS = ['Anders', 'Christian', 'Joan', 'Michaella', 'Nicolai', 'Sisse']
  .map((name) => ({ id: `u-${name.toLowerCase()}`, name }));
const DEFAULT_PREFS = { events: true, remindBefore: '1d', deadlines: true, todo: true, shopping: false, films: false, responses: true };

function seed() {
  const at = (days, hour) => {
    const d = startOfDay();
    d.setDate(d.getDate() + days);
    d.setHours(hour);
    return d;
  };
  const now = new Date().toISOString();
  const item = (id, listId, text, extra = {}) => ({
    id, listId, text, note: '', done: false, assignee: null, owner: null, due: null, createdBy: 'u-michaella', createdAt: now, doneAt: null, ...extra,
  });
  return {
    session: null,
    prefs: {},
    events: [
      { id: 'e-1', title: 'Middag hos Joan', description: 'Vi tager dessert med.', location: '', startsAt: at(2, 18).toISOString(), endsAt: at(2, 21).toISOString(), allDay: false, who: null, createdBy: 'u-michaella' },
      { id: 'e-2', title: 'Fødselsdag hos Nicolai', description: '', location: '', startsAt: at(5, 17).toISOString(), endsAt: null, allDay: false, who: 'u-nicolai', createdBy: 'u-sisse' },
    ],
    lists: [
      { id: 'l-todo', name: 'To-do', kind: 'todo', owner: null },
      { id: 'l-shop', name: 'Indkøb', kind: 'shopping', owner: null },
      { id: 'l-watch', name: 'Film', kind: 'watch', owner: null },
      { id: 'l-trips', name: 'Ønskesedler', kind: 'custom', owner: null },
      { id: 'l-gift', name: 'Julegaver', kind: 'custom', owner: 'u-christian' },
    ],
    items: [
      item('i-1', 'l-todo', 'Støvsug', { assignee: 'u-christian', due: dateKey(at(1, 0)) }),
      item('i-2', 'l-todo', 'Betal husleje', { due: dateKey(at(4, 0)) }),
      item('i-3', 'l-todo', 'Ring til frisøren', { owner: 'u-michaella' }),
      item('i-4', 'l-shop', 'Mælk'),
      item('i-5', 'l-shop', 'Pasta'),
      item('i-6', 'l-watch', 'Past Lives', { note: 'Netflix' }),
      item('i-7', 'l-watch', 'Dune: Part Two', { assignee: 'u-christian', createdBy: 'u-christian' }),
      item('i-8', 'l-watch', 'La La Land', { done: true, doneAt: now }),
      item('i-9', 'l-trips', 'Joan: nyt tørklæde', { createdBy: 'u-joan' }),
      item('i-10', 'l-gift', 'Bog til Anders', { owner: 'u-christian', createdBy: 'u-christian' }),
    ],
  };
}

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? seed();
  } catch {
    return seed();
  }
}

function save(db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

function current(db) {
  const user = USERS.find((u) => u.id === db.session);
  if (!user) throw new Error('Du er ikke logget ind');
  return user;
}

const withPrefs = (db, user) => user && { ...user, prefs: { ...DEFAULT_PREFS, ...db.prefs[user.id] } };

export async function init() {}

export async function getSession() {
  const db = load();
  return withPrefs(db, USERS.find((u) => u.id === db.session));
}

export async function signIn(name, password) {
  const user = USERS.find((u) => u.name.toLowerCase() === name.trim().toLowerCase());
  if (!user || password !== PASSWORD) throw new Error('Forkert navn eller adgangskode');
  const db = load();
  db.session = user.id;
  save(db);
  return withPrefs(db, user);
}

export async function signOut() {
  const db = load();
  db.session = null;
  save(db);
}

export async function listProfiles() {
  return USERS;
}

export async function savePrefs(prefs) {
  const db = load();
  db.prefs[current(db).id] = { ...prefs };
  save(db);
}

export async function listEvents(fromIso) {
  return load().events
    .filter((e) => e.startsAt >= fromIso)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

export async function saveEvent(ev) {
  const db = load();
  const user = current(db);
  const existing = db.events.find((e) => e.id === ev.id);
  const row = { ...ev, id: ev.id || crypto.randomUUID(), createdBy: existing?.createdBy ?? user.id };
  db.events = db.events.filter((e) => e.id !== row.id).concat(row);
  save(db);
}

export async function deleteEvent(id) {
  const db = load();
  current(db);
  db.events = db.events.filter((e) => e.id !== id);
  db.responses = (db.responses ?? []).filter((r) => r.eventId !== id);
  save(db);
}

export async function listResponses(eventIds) {
  return (load().responses ?? []).filter((r) => eventIds.includes(r.eventId));
}

// Same rule as the database: each person writes only their own answer.
export async function setResponse(eventId, status, note) {
  const db = load();
  const user = current(db);
  const others = (db.responses ?? []).filter((r) => !(r.eventId === eventId && r.userId === user.id));
  db.responses = others.concat({ eventId, userId: user.id, status, note });
  save(db);
}

const listVisible = (list, user) => list && (!list.owner || list.owner === user.id);

export async function listLists() {
  const db = load();
  const user = current(db);
  return db.lists.filter((l) => listVisible(l, user));
}

export async function saveList({ id, name, isPrivate }) {
  const db = load();
  const user = current(db);
  if (id) {
    db.lists = db.lists.map((l) => (l.id === id && listVisible(l, user) ? { ...l, name } : l));
  } else {
    id = crypto.randomUUID();
    db.lists.push({ id, name, kind: 'custom', owner: isPrivate ? user.id : null });
  }
  save(db);
  return id;
}

// Same rule as the database: only the lists they made themselves can go.
export async function deleteList(id) {
  const db = load();
  const user = current(db);
  const list = db.lists.find((l) => l.id === id);
  if (list?.kind !== 'custom' || !listVisible(list, user)) throw new Error('Denne liste kan ikke slettes');
  db.lists = db.lists.filter((l) => l.id !== id);
  db.items = db.items.filter((i) => i.listId !== id);
  save(db);
}

// Same rule as the database: a private item exists only for its owner.
const visible = (item, user) => !item.owner || item.owner === user.id;

export async function listItems() {
  const db = load();
  const user = current(db);
  return db.items.filter((i) => visible(i, user));
}

export async function addItem(listId, fields) {
  const db = load();
  const user = current(db);
  const list = db.lists.find((l) => l.id === listId);
  const owner = fields.owner ?? null;
  const ok = listVisible(list, user) && (list.owner
    ? owner === user.id
    : !owner || (owner === user.id && list.kind === 'todo'));
  if (!ok) throw new Error('Punktet kunne ikke gemmes');
  db.items.push({
    id: crypto.randomUUID(), listId, text: fields.text, note: fields.note ?? '', done: false, assignee: fields.assignee ?? null, owner,
    due: fields.due ?? null, createdBy: user.id, createdAt: new Date().toISOString(), doneAt: null,
  });
  save(db);
}

export async function updateItem(id, patch) {
  const db = load();
  const user = current(db);
  const extra = 'done' in patch ? { doneAt: patch.done ? new Date().toISOString() : null } : {};
  db.items = db.items.map((i) => (i.id === id && visible(i, user) ? { ...i, ...patch, ...extra } : i));
  save(db);
}

export async function deleteItem(id) {
  await deleteItems([id]);
}

export async function deleteItems(ids) {
  const db = load();
  const user = current(db);
  db.items = db.items.filter((i) => !(ids.includes(i.id) && visible(i, user)));
  save(db);
}

// No phone notifications without a database.
export async function savePushSubscription() {}
export async function removePushSubscription() {}
export async function hasPushSubscription() {
  return false;
}

// Another tab of the demo stands in for the partner's phone.
export function subscribe(onChange) {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) onChange();
  });
}
