import test from 'node:test';
import assert from 'node:assert/strict';
import { filterHistory, groupHistoryByDay } from '../src/history.js';

const now = new Date(2026, 9, 27, 12).getTime();
const day = 86_400_000;
const visit = (id, age, spaceId = 'personal') => ({ id, title: `Notebook ${id}`, url: `https://example.com/${id}`, spaceId, visitedAt: now - age });

test('space, title/address search and time range compose without mutating input', () => {
  const entries = [visit('old', 8 * day), visit('new', day / 2), visit('work', day / 2, 'work')];
  const original = structuredClone(entries);
  assert.deepEqual(filterHistory(entries, { spaceId: 'personal', search: 'EXAMPLE.com/new', timeRange: 'last7days', now }).map(entry => entry.id), ['new']);
  assert.equal(filterHistory(entries, { search: 'notebook', now }).length, 3);
  assert.deepEqual(entries, original);
});

for (const [timeRange, days] of [['last24h', 1], ['last7days', 7], ['last30days', 30]]) {
  test(`${timeRange} uses an inclusive rolling boundary and excludes future visits`, () => {
    const entries = [visit('outside', days * day + 1), visit('boundary', days * day), visit('current', 0), visit('future', -1)];
    assert.deepEqual(filterHistory(entries, { timeRange, now }).map(entry => entry.id), ['current', 'boundary']);
    assert.equal(filterHistory(entries, { timeRange: 'all', now }).length, 4);
  });
}

test('invalid or empty history is safe and equal timestamps preserve input order', () => {
  assert.deepEqual(filterHistory(undefined), []);
  assert.deepEqual(filterHistory([null, {}, { visitedAt: NaN }, { visitedAt: Infinity }, { visitedAt: 1e30 }]), []);
  assert.deepEqual(filterHistory([visit('first', 0), visit('second', 0)], { now }).map(entry => entry.id), ['first', 'second']);
});

test('day grouping sorts unsorted visits, uses calendar dates including year, and is stable', () => {
  const entries = [visit('yesterday', day), visit('today-first', 0), visit('today-second', 0), { ...visit('last-year', 0), visitedAt: new Date(2025, 9, 27, 12).getTime() }];
  const groups = groupHistoryByDay(entries);
  assert.deepEqual(groups.map(group => group.key), ['2026-10-27', '2026-10-26', '2025-10-27']);
  assert.deepEqual(groups[0].entries.map(entry => entry.id), ['today-first', 'today-second']);
  assert.deepEqual(groupHistoryByDay(entries), groups);
  assert.deepEqual(groupHistoryByDay([]), []);
});
