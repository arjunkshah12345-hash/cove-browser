import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, isValidState, recordVisit } from '../src/model.js';
import { applyHistoryRetention, getHistoryRetentionDays } from '../src/retention.js';

const DAY = 86400000;
const NOW = 200 * DAY;
const visit = (id, visitedAt) => Object.freeze({ id, visitedAt, url: `https://${id}.example/`, title: id, spaceId: 'personal' });
const fixture = (historyRetentionDays, history) => Object.freeze({ ...initialState(), historyRetentionDays, history: Object.freeze(history) });

test('only supported numeric presets enable retention; legacy default is off', () => {
  assert.equal(getHistoryRetentionDays(initialState()), 0);
  for (const days of [0, 1, 7, 30, 90]) assert.equal(getHistoryRetentionDays({ historyRetentionDays: days }), days);
  for (const days of [undefined, null, false, true, '1', '7', -1, 2, 1.5, Infinity, NaN, [], {}]) {
    const state = fixture(days, [visit('old', 0)]);
    assert.equal(getHistoryRetentionDays(state), 0);
    assert.equal(applyHistoryRetention(state, { now: NOW }), state);
  }
});

test('each finite preset removes only visits strictly older than its cutoff, across spaces', () => {
  for (const days of [1, 7, 30, 90]) {
    const cutoff = NOW - days * DAY;
    const history = [visit('future', NOW + DAY), visit('old', cutoff - 1), visit('boundary', cutoff), Object.freeze({ ...visit('work', cutoff - 1), spaceId: 'work' }), visit('recent', NOW)];
    const state = fixture(days, history);
    const next = applyHistoryRetention(state, { now: NOW });
    assert.notEqual(next, state);
    assert.deepEqual(next.history, [history[0], history[2], history[4]]);
    next.history.forEach(entry => assert.equal(entry, history.find(original => original.id === entry.id)));
    for (const key of Object.keys(state).filter(key => key !== 'history')) assert.equal(next[key], state[key]);
    assert.deepEqual(state.history, history);
    assert.equal(isValidState(next), true);
    assert.equal(applyHistoryRetention(next, { now: NOW }), next);
  }
});

test('retention requires an explicitly injected finite nonnegative numeric clock', () => {
  const state = fixture(1, [visit('old', 0)]);
  assert.equal(applyHistoryRetention(state), state);
  assert.equal(applyHistoryRetention(state, {}), state);
  for (const now of [undefined, null, false, true, '99999999999', -1, Infinity, -Infinity, NaN, {}, []]) {
    assert.equal(applyHistoryRetention(state, { now }), state);
  }
  assert.equal(applyHistoryRetention(state, { now: 0 }), state);
  assert.equal(applyHistoryRetention(state, { now: DAY }), state);
  assert.deepEqual(applyHistoryRetention(state, { now: DAY + 1 }).history, []);
});

test('missing history, empty history, and unexpired history preserve all references', () => {
  const legacy = { ...initialState(), historyRetentionDays: 7 };
  delete legacy.history;
  Object.freeze(legacy);
  assert.equal(applyHistoryRetention(legacy, { now: NOW }), legacy);
  assert.equal(Object.hasOwn(legacy, 'history'), false);
  for (const history of [[], [visit('recent', NOW)], [visit('future', NOW + DAY)]]) {
    const state = fixture(7, history);
    assert.equal(applyHistoryRetention(state, { now: NOW }), state);
  }
});

test('disabled retention leaves the existing 1,000-visit recording cap intact', () => {
  const history = Array.from({ length: 1000 }, (_, index) => visit(`visit-${index}`, index));
  for (const historyRetentionDays of [undefined, 0]) {
    const state = fixture(historyRetentionDays, history);
    assert.equal(applyHistoryRetention(state, { now: NOW }), state);
    const next = recordVisit(state, { ...visit('new', NOW) });
    assert.equal(next.history.length, 1000);
    assert.equal(next.history[0].id, 'new');
    assert.equal(next.history.at(-1), history[998]);
  }
});
