import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, isValidState, restoreTab } from '../src/model.js';
import { autoArchiveTabs, getAutoArchiveHours, restoreAutoArchived, touchTab } from '../src/lifecycle.js';

const HOUR = 3600000;
const NOW = 1000 * HOUR;
const tab = (id, extra = {}) => ({ id, spaceId: 'personal', title: id, url: `https://${id}.example/`, pinned: false, lastActiveAt: 0, ...extra });
const fixture = (tabs = [tab('active'), tab('old')]) => ({ ...initialState(), tabs, archive: [], activeTabId: 'active', autoArchiveHours: 24 });
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

test('only numeric supported presets enable auto-archive; disabled is an immutable no-op', () => {
  for (const value of [undefined, null, false, true, '24', -1, 0, 1, 48, Infinity, NaN]) {
    const state = freeze({ ...fixture(), autoArchiveHours: value });
    assert.equal(getAutoArchiveHours(state), 0);
    assert.deepEqual(autoArchiveTabs(state, { now: NOW }), { state, archivedIds: [] });
  }
  for (const hours of [24, 168, 720]) assert.equal(getAutoArchiveHours({ autoArchiveHours: hours }), hours);
});

test('touch is immutable, preserves full metadata and accepts epoch zero', () => {
  const state = freeze(fixture([tab('active'), tab('old', { folderId: 'reading', custom: { keep: true } })]));
  const next = touchTab(state, 'old', NOW);
  assert.equal(next.tabs[0], state.tabs[0]);
  assert.deepEqual(next.tabs[1], { ...state.tabs[1], lastActiveAt: NOW });
  assert.equal(next.archive, state.archive);
  assert.equal(touchTab(next, 'old', NOW), next);
  assert.equal(touchTab(state, 'missing', NOW), state);
  assert.equal(touchTab(state, 'old', 0), state);
  for (const now of [undefined, null, '1', -1, NaN, Infinity]) {
    if (now !== undefined) assert.equal(touchTab(state, 'old', now), state);
  }
});

test('exact inactivity boundaries use injected time for all presets', () => {
  for (const hours of [24, 168, 720]) {
    const state = freeze({ ...fixture([tab('active'), tab('boundary', { lastActiveAt: NOW - hours * HOUR }), tab('recent', { lastActiveAt: NOW - hours * HOUR + 1 })]), autoArchiveHours: hours });
    const result = autoArchiveTabs(state, { now: NOW });
    assert.deepEqual(result.archivedIds, ['boundary']);
    assert.equal(result.state.archive[0].closedAt, NOW);
    assert.equal(isValidState(result.state), true);
    assert.deepEqual(autoArchiveTabs(state, { now: NOW }), result);
  }
});

test('legacy tabs start tracking; invalid and future timestamps never cause immediate archival', () => {
  const state = freeze(fixture([tab('active'), ...[undefined, null, '0', NaN, Infinity, -1, NOW + 1].map((lastActiveAt, index) => tab(`legacy-${index}`, { lastActiveAt }))]));
  const first = autoArchiveTabs(state, { now: NOW });
  assert.deepEqual(first.archivedIds, []);
  assert.equal(first.state.tabs[1].lastActiveAt, NOW);
  assert.equal(state.tabs[1].lastActiveAt, undefined);
  assert.deepEqual(autoArchiveTabs(first.state, { now: NOW + 24 * HOUR - 1 }).archivedIds, []);
  assert.deepEqual(autoArchiveTabs(first.state, { now: NOW + 24 * HOUR }).archivedIds, ['legacy-0']);
  for (const now of [undefined, null, '1', -1, NaN, Infinity]) assert.equal(autoArchiveTabs(state, { now }).state, state);
});

test('pinned, favorite shortcuts, active selection and both visible panes are protected', () => {
  const state = freeze(fixture([tab('active'), tab('pinned', { pinned: true }), tab('favorite', { favorite: true }), tab('github', { url: 'https://github.com' }), tab('left'), tab('right', { spaceId: 'work' }), tab('old')]));
  const result = autoArchiveTabs(state, { now: NOW, visibleIds: new Set(['left', 'right']) });
  assert.deepEqual(result.archivedIds, ['old']);
  for (const id of ['active', 'left', 'right']) assert.equal(result.state.tabs.find(entry => entry.id === id).lastActiveAt, NOW);
  assert.equal(isValidState(result.state), true);
});

test('archives preserve metadata and cross-space selection; standard archive recovery works', () => {
  const state = freeze(fixture([tab('old', { folderId: 'reading', custom: { intact: true } }), tab('active'), tab('work-old', { spaceId: 'work' })]));
  const result = autoArchiveTabs(state, { now: NOW });
  assert.deepEqual(result.archivedIds, ['old', 'work-old']);
  assert.equal(result.state.activeSpaceId, 'personal');
  assert.equal(result.state.activeTabId, 'active');
  assert.equal(isValidState(result.state), true);
  const restored = restoreTab(result.state, 'old');
  assert.deepEqual(restored.tabs.at(-1), state.tabs[0]);
  assert.equal(isValidState(restored), true);
});

test('archive capacity never drops a tab archived earlier in the same sweep', () => {
  const state = freeze({ ...fixture([tab('active'), ...Array.from({ length: 105 }, (_, index) => tab(`old-${index}`))]), archive: Array.from({ length: 100 }, (_, index) => ({ ...tab(`closed-${index}`), closedAt: 0 })) });
  const result = autoArchiveTabs(state, { now: NOW });
  assert.equal(result.archivedIds.length, 100);
  assert.equal(result.state.tabs.length, 6);
  assert.equal(result.state.archive.length, 100);
  for (const id of result.archivedIds) assert.ok(result.state.archive.some(entry => entry.id === id));
  assert.equal(isValidState(result.state), true);
});

test('archive ID collisions are deterministic, unique and preserve older entries', () => {
  const state = freeze({ ...fixture(), archive: [{ ...tab('old'), closedAt: 1 }, { ...tab('old-auto-1'), closedAt: 2 }] });
  const first = autoArchiveTabs(state, { now: NOW });
  assert.equal(first.state.archive[0].id, 'old-auto-2');
  assert.deepEqual(first.state.archive.slice(1), state.archive);
  assert.deepEqual(autoArchiveTabs(state, { now: NOW }), first);
  assert.equal(isValidState(first.state), true);
});

test('undo restores complete ordering, archive and selection without reverting unrelated preferences', () => {
  const before = freeze(fixture([tab('first'), tab('active'), tab('work', { spaceId: 'work' }), tab('last')]));
  const { state: after } = autoArchiveTabs(before, { now: NOW });
  const restored = restoreAutoArchived({ ...after, theme: 'sand' }, { before, after });
  assert.equal(restored.tabs, before.tabs);
  assert.equal(restored.archive, before.archive);
  assert.equal(restored.activeTabId, before.activeTabId);
  assert.equal(restored.activeSpaceId, before.activeSpaceId);
  assert.equal(restored.theme, 'sand');
  assert.equal(isValidState(restored), true);
});

test('undo refuses later tab, archive, space, folder or selection edits', () => {
  const before = freeze(fixture());
  const { state: after } = autoArchiveTabs(before, { now: NOW });
  for (const patch of [{ tabs: [...after.tabs, tab('new')] }, { archive: [] }, { spaces: [...after.spaces] }, { folders: [] }, { activeTabId: null }, { activeSpaceId: 'work', activeTabId: null }]) {
    const edited = { ...after, ...patch };
    assert.equal(restoreAutoArchived(edited, { before, after }), edited);
  }
  assert.equal(restoreAutoArchived(after), after);
  assert.equal(restoreAutoArchived(after, {}), after);
});
