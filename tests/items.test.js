import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filmsFor, inScope, sortDone, sortOpen, splitLists } from '../js/items.js';
import { dueInfo } from '../js/dates.js';

const item = (id, extra = {}) => ({ id, done: false, due: null, assignee: null, createdAt: `2026-10-0${id}`, doneAt: null, ...extra });

test('sortOpen puts dated items first by deadline, then undated by age, and drops done ones', () => {
  const items = [item(1), item(2, { due: '2026-11-05' }), item(3, { due: '2026-11-01' }), item(4, { done: true }), item(5)];
  assert.deepEqual(sortOpen(items).map((i) => i.id), [3, 2, 1, 5]);
});

test('sortDone shows the most recently ticked first', () => {
  const items = [item(1, { done: true, doneAt: '2026-10-20' }), item(2), item(3, { done: true, doneAt: '2026-10-22' })];
  assert.deepEqual(sortDone(items).map((i) => i.id), [3, 1]);
});

test("inScope separates shared tasks from a person's private ones", () => {
  const items = [item(1, { owner: 'c' }), item(2, { owner: 'm' }), item(3, { owner: null, assignee: 'c' })];
  assert.deepEqual(inScope(items, 'shared', 'c').map((i) => i.id), [3]);
  assert.deepEqual(inScope(items, 'mine', 'c').map((i) => i.id), [1]);
  assert.deepEqual(inScope(items, 'mine', 'm').map((i) => i.id), [2]);
});

test('inScope deadlines gathers dated shared and own tasks, never the partner\'s', () => {
  const items = [item(1, { due: '2026-11-20' }), item(2, { owner: 'c', due: '2026-11-18' }), item(3, { owner: 'm', due: '2026-11-17' }), item(4)];
  assert.deepEqual(inScope(items, 'deadlines', 'c').map((i) => i.id), [1, 2]);
});

test('splitLists keeps shared lists and only your own private ones', () => {
  const lists = [
    { id: 'a', kind: 'custom', owner: null },
    { id: 'b', kind: 'custom', owner: 'c' },
    { id: 'c', kind: 'custom', owner: 'm' },
    { id: 'd', kind: 'todo', owner: null },
    { id: 'e', kind: 'watch', owner: null },
  ];
  const { shared, mine } = splitLists(lists, 'c');
  assert.deepEqual(shared.map((l) => l.id), ['a']);
  assert.deepEqual(mine.map((l) => l.id), ['b']);
});

test('filmsFor filters the watchlist by who wants to see a film', () => {
  const films = [item(1, { assignee: 'c' }), item(2, { assignee: 'm' }), item(3), item(4, { done: true })];
  assert.deepEqual(filmsFor(films, 'all').map((i) => i.id), [1, 2, 3, 4]);
  assert.deepEqual(filmsFor(films, 'c').map((i) => i.id), [1, 4]);
});

test('dueInfo reads deadlines relative to today', () => {
  const now = new Date(2026, 9, 22, 15, 0);
  assert.deepEqual(dueInfo('2026-10-21', now), { label: 'Overskredet', tone: 'late' });
  assert.deepEqual(dueInfo('2026-10-22', now), { label: 'I dag', tone: 'soon' });
  assert.deepEqual(dueInfo('2026-10-23', now), { label: 'I morgen', tone: 'soon' });
  assert.deepEqual(dueInfo('2026-10-26', now), { label: 'Mandag', tone: 'later' });
  assert.equal(dueInfo('2026-12-24', now).label.includes('24'), true);
});
