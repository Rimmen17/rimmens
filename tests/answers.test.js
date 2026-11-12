import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupAnswers, STATUSES } from '../js/answers.js';

const PEOPLE = [{ id: 'a', name: 'Anders' }, { id: 'j', name: 'Joan' }, { id: 'n', name: 'Nicolai' }];

test('groupAnswers keeps the order Kommer, Bliver forsinket, Kommer ikke', () => {
  const { groups } = groupAnswers([], PEOPLE);
  assert.deepEqual(groups.map((g) => g.label), STATUSES.map((s) => s.label));
});

test('groupAnswers puts each person under their answer, with their note', () => {
  const { groups, missing } = groupAnswers([
    { userId: 'j', status: 'late', note: '20 min' },
    { userId: 'a', status: 'joining', note: '' },
  ], PEOPLE);
  assert.deepEqual(groups[0].people, [{ name: 'Anders', note: '' }]);
  assert.deepEqual(groups[1].people, [{ name: 'Joan', note: '20 min' }]);
  assert.deepEqual(groups[2].people, []);
  assert.deepEqual(missing.map((p) => p.name), ['Nicolai']);
});

test('groupAnswers lists everyone as missing before anyone answers', () => {
  assert.deepEqual(groupAnswers([], PEOPLE).missing.map((p) => p.name), ['Anders', 'Joan', 'Nicolai']);
});

test('groupAnswers names an unknown account instead of failing', () => {
  const { groups } = groupAnswers([{ userId: 'x', status: 'not_joining', note: '' }], PEOPLE);
  assert.equal(groups[2].people[0].name, 'Ukendt');
});
