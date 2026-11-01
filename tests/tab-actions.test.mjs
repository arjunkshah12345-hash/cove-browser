import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, isValidState } from '../src/model.js';
import { getTabNeighbors, initializePinnedTabs, resetPinnedTab, shiftTab, toggleTabPin } from '../src/tab-actions.js';

test('pinning remembers the home address and unpinning removes pin metadata', () => {
  const state = { ...initialState(), tabs: [{ id: 'test', spaceId: 'personal', title: 'Example', url: 'https://example.com/', pinned: false, folderId: 'reading' }], activeTabId: 'test' };
  const pinned = toggleTabPin(state, 'test');
  assert.equal(pinned.tabs[0].pinnedUrl, 'https://example.com/');
  assert.equal(pinned.tabs[0].folderId, undefined);
  const navigated = { ...pinned, tabs: [{ ...pinned.tabs[0], url: 'https://example.com/next' }] };
  const reset = resetPinnedTab(navigated, 'test');
  assert.equal(reset.tabs[0].url, 'https://example.com/');
  assert.equal(navigated.tabs[0].url, 'https://example.com/next');
  assert.equal(isValidState(reset), true);
  const unpinned = toggleTabPin(reset, 'test');
  assert.equal(unpinned.tabs[0].pinned, false);
  assert.equal(unpinned.tabs[0].pinnedUrl, undefined);
});

test('legacy pins capture their current saved address exactly once', () => {
  const state = initialState();
  const migrated = initializePinnedTabs(state);
  assert.ok(migrated.tabs.filter(tab => tab.pinned).every(tab => tab.pinnedUrl === tab.url));
  assert.equal(initializePinnedTabs(migrated), migrated);
  assert.equal(isValidState(migrated), true);
  assert.equal(resetPinnedTab(migrated, 'welcome'), migrated);
  assert.equal(resetPinnedTab(migrated, 'missing'), migrated);
  const unsafe = { ...migrated, tabs: migrated.tabs.map(tab => ({ ...tab, pinnedUrl: 'javascript:alert(1)' })) };
  assert.equal(isValidState(unsafe), false);
  assert.equal(resetPinnedTab(unsafe, 'arena'), unsafe);
});

test('keyboard reorder swaps only neighbors in the same sidebar group', () => {
  const state = initialState();
  state.tabs.push(
    { id: 'first', title: 'First', spaceId: 'personal', url: 'https://first.example/', pinned: false },
    { id: 'other-space', title: 'Other', spaceId: 'work', url: 'https://other.example/', pinned: false },
    { id: 'second', title: 'Second', spaceId: 'personal', url: 'https://second.example/', pinned: false }
  );
  assert.deepEqual(getTabNeighbors(state, 'first'), { previous: undefined, next: 'second' });
  const reordered = shiftTab(state, 'first', 'down');
  assert.equal(reordered.tabs.at(-1).id, 'first');
  assert.equal(reordered.tabs.at(-2).id, 'other-space');
  assert.equal(reordered.activeTabId, state.activeTabId);
  assert.equal(shiftTab(state, 'first', 'up'), state);
  assert.equal(shiftTab(state, 'first', 'invalid'), state);
  assert.equal(isValidState(reordered), true);
  assert.deepEqual(shiftTab(reordered, 'first', 'up'), state);
});
