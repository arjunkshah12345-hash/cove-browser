import test from 'node:test';
import assert from 'node:assert/strict';
import { clearSplitLayout, getSplitLayout, pruneSplitLayouts, setSplitLayout, swapSplitLayout } from '../src/splits.js';
import { initialState, isValidState } from '../src/model.js';

function freezeState(state) {
  for (const value of Object.values(state)) {
    if (value && typeof value === 'object') freezeState(value);
  }
  return Object.freeze(state);
}

function workspace(splitLayouts) {
  const state = initialState();
  state.tabs = [
    { ...state.tabs[0], id: 'first', spaceId: 'personal' },
    { ...state.tabs[0], id: 'second', spaceId: 'personal' },
    { ...state.tabs[0], id: 'third', spaceId: 'personal' },
    { ...state.tabs[0], id: 'work-first', spaceId: 'work' },
    { ...state.tabs[0], id: 'work-second', spaceId: 'work' }
  ];
  state.activeTabId = 'first';
  if (splitLayouts !== undefined) state.splitLayouts = splitLayouts;
  return freezeState(state);
}

const personal = { spaceId: 'personal', primaryId: 'first', secondaryId: 'second', ratio: 40 };
const work = { spaceId: 'work', primaryId: 'work-first', secondaryId: 'work-second', ratio: 65 };

test('legacy v1 workspaces stay unchanged without optional split layouts', () => {
  const state = workspace();
  assert.equal(state.version, 1);
  assert.equal(isValidState(state), true);
  assert.equal(getSplitLayout(state), null);
  assert.strictEqual(clearSplitLayout(state), state);
  assert.strictEqual(pruneSplitLayouts(state), state);
  assert.strictEqual(swapSplitLayout(state), state);
  assert.equal(Object.hasOwn(state, 'splitLayouts'), false);
  const updated = setSplitLayout(state, { ...personal, ratio: undefined });
  assert.deepEqual(updated.splitLayouts, [{ ...personal, ratio: 50 }]);
  assert.equal(updated.version, 1);
  assert.equal(JSON.parse(JSON.stringify(updated)).splitLayouts[0].ratio, 50);
});

test('getter selects the active or explicit space and returns the stored reference', () => {
  const state = workspace([work, personal]);
  assert.strictEqual(getSplitLayout(state), personal);
  assert.strictEqual(getSplitLayout(state, 'work'), work);
  assert.strictEqual(getSplitLayout({ ...state, activeSpaceId: 'work' }), work);
  assert.equal(getSplitLayout(state, 'missing'), null);
});

test('getter and setter reject stale, archived, wrong-space and identical tabs', () => {
  const state = workspace();
  const archived = { ...state, archive: [{ ...state.tabs[0], id: 'archived', closedAt: 1 }] };
  const invalid = [
    { ...personal, spaceId: 'missing' },
    { ...personal, primaryId: 'missing' },
    { ...personal, secondaryId: 'missing' },
    { ...personal, primaryId: 'archived' },
    { ...personal, secondaryId: 'archived' },
    { ...personal, primaryId: 'work-first' },
    { ...personal, secondaryId: 'work-second' },
    { ...personal, secondaryId: 'first' },
    { ...personal, spaceId: null },
    { ...personal, primaryId: undefined },
    { ...personal, secondaryId: 123 }
  ];
  for (const layout of invalid) {
    assert.equal(getSplitLayout({ ...archived, splitLayouts: [layout] }, layout.spaceId), null);
    assert.strictEqual(setSplitLayout(archived, layout), archived);
    assert.deepEqual(pruneSplitLayouts({ ...archived, splitLayouts: [layout] }).splitLayouts, []);
  }
});

test('ratios must be finite numbers in the inclusive 25 to 75 range', () => {
  const state = workspace();
  for (const ratio of [25, 25.5, 50, 74.5, 75]) {
    const updated = setSplitLayout(state, { ...personal, ratio });
    assert.equal(getSplitLayout(updated).ratio, ratio);
    assert.strictEqual(pruneSplitLayouts(updated), updated);
  }
  for (const ratio of [24.99, 75.01, 0, 100, -1, NaN, Infinity, -Infinity, '50', null, {}, [], true]) {
    const layout = { ...personal, ratio };
    assert.strictEqual(setSplitLayout(state, layout), state);
    assert.equal(getSplitLayout({ ...state, splitLayouts: [layout] }), null);
    assert.deepEqual(pruneSplitLayouts({ ...state, splitLayouts: [layout] }).splitLayouts, []);
  }
  const missingRatio = { ...personal };
  delete missingRatio.ratio;
  assert.equal(getSplitLayout({ ...state, splitLayouts: [missingRatio] }), null);
  assert.deepEqual(pruneSplitLayouts({ ...state, splitLayouts: [missingRatio] }).splitLayouts, []);
});

test('setter immutably appends and replaces only the requested space', () => {
  const state = workspace([work]);
  const added = setSplitLayout(state, personal);
  assert.notStrictEqual(added, state);
  assert.notStrictEqual(added.splitLayouts, state.splitLayouts);
  assert.deepEqual(added.splitLayouts, [work, personal]);
  assert.strictEqual(added.splitLayouts[0], work);
  assert.notStrictEqual(added.splitLayouts[1], personal);
  assert.strictEqual(added.tabs, state.tabs);
  assert.strictEqual(added.spaces, state.spaces);
  assert.deepEqual({ ...added, splitLayouts: state.splitLayouts }, state);
  const replaced = setSplitLayout(freezeState(added), { ...personal, secondaryId: 'third', ratio: 60 });
  assert.deepEqual(replaced.splitLayouts, [work, { ...personal, secondaryId: 'third', ratio: 60 }]);
  assert.strictEqual(replaced.splitLayouts[0], work);
  assert.strictEqual(setSplitLayout(replaced, { ...personal, secondaryId: 'third', ratio: 60 }), replaced);
});

test('setter deduplicates the requested space without touching other layouts', () => {
  const state = workspace([personal, work, { ...personal, ratio: 55 }]);
  const updated = setSplitLayout(state, personal);
  assert.deepEqual(updated.splitLayouts, [personal, work]);
  assert.strictEqual(updated.splitLayouts[1], work);
  assert.equal(state.splitLayouts.length, 3);
});

test('clear defaults to the active space and removes all matching entries only', () => {
  const state = workspace([personal, work, { ...personal, ratio: 55 }]);
  const cleared = clearSplitLayout(state);
  assert.deepEqual(cleared.splitLayouts, [work]);
  assert.strictEqual(cleared.splitLayouts[0], work);
  assert.strictEqual(cleared.tabs, state.tabs);
  assert.strictEqual(clearSplitLayout(cleared), cleared);
  assert.strictEqual(clearSplitLayout(state, 'missing'), state);
  assert.deepEqual(clearSplitLayout(state, 'work').splitLayouts, [personal, { ...personal, ratio: 55 }]);
  assert.deepEqual(clearSplitLayout(cleared, 'work').splitLayouts, []);
});

test('prune handles closed, moved, deleted-space and imported stale references', () => {
  const state = workspace([personal, work]);
  const staleStates = [
    { ...state, tabs: state.tabs.filter(tab => tab.id !== 'first') },
    { ...state, tabs: state.tabs.filter(tab => tab.id !== 'second') },
    { ...state, tabs: state.tabs.map(tab => tab.id === 'first' ? { ...tab, spaceId: 'work' } : tab) },
    { ...state, tabs: state.tabs.map(tab => tab.id === 'second' ? { ...tab, spaceId: 'work' } : tab) },
    { ...state, spaces: state.spaces.filter(space => space.id !== 'personal') },
    { ...state, tabs: state.tabs.filter(tab => tab.spaceId === 'work'), archive: state.tabs.filter(tab => tab.spaceId === 'personal') }
  ];
  for (const stale of staleStates) {
    freezeState(stale);
    assert.equal(getSplitLayout(stale), null);
    const pruned = pruneSplitLayouts(stale);
    assert.deepEqual(pruned.splitLayouts, [work]);
    assert.strictEqual(pruned.splitLayouts[0], work);
    assert.strictEqual(pruned.tabs, stale.tabs);
    assert.strictEqual(pruned.spaces, stale.spaces);
    assert.strictEqual(pruned.archive, stale.archive);
    assert.strictEqual(pruneSplitLayouts(pruned), pruned);
  }
});

test('prune retains the first valid layout per space and discards malformed entries', () => {
  const state = workspace([
    null, false, 42, 'layout', [], {}, { ...personal, primaryId: 'missing' },
    personal, { ...personal, ratio: 55 }, work, { ...work }
  ]);
  assert.strictEqual(getSplitLayout(state), personal);
  const pruned = pruneSplitLayouts(state);
  assert.deepEqual(pruned.splitLayouts, [personal, work]);
  assert.strictEqual(pruned.splitLayouts[0], personal);
  assert.strictEqual(pruned.splitLayouts[1], work);
  assert.strictEqual(pruneSplitLayouts(pruned), pruned);
});

test('valid and empty arrays preserve state and collection references on no-ops', () => {
  for (const layouts of [[], [personal], [personal, work]]) {
    const state = workspace(layouts);
    assert.strictEqual(pruneSplitLayouts(state), state);
    assert.strictEqual(pruneSplitLayouts(state).splitLayouts, layouts);
    assert.strictEqual(clearSplitLayout(state, 'missing'), state);
    if (layouts.includes(personal)) assert.strictEqual(setSplitLayout(state, personal), state);
  }
});

test('malformed imported collections are safe to read, clear, swap and prune', () => {
  for (const splitLayouts of [null, {}, 'invalid', 50]) {
    const state = freezeState({ ...workspace(), splitLayouts });
    assert.equal(getSplitLayout(state), null);
    assert.strictEqual(clearSplitLayout(state), state);
    assert.strictEqual(swapSplitLayout(state), state);
    assert.deepEqual(pruneSplitLayouts(state).splitLayouts, []);
    assert.deepEqual(setSplitLayout(state, personal).splitLayouts, [personal]);
  }
});

test('swap mirrors ratios, exchanges pane IDs and leaves unrelated state untouched', () => {
  for (const ratio of [25, 40, 50, 60, 75]) {
    const original = { ...personal, ratio };
    const state = workspace([original, work]);
    const swapped = swapSplitLayout(state);
    assert.deepEqual(swapped.splitLayouts, [{ ...personal, primaryId: 'second', secondaryId: 'first', ratio: 100 - ratio }, work]);
    assert.strictEqual(swapped.splitLayouts[1], work);
    assert.strictEqual(swapped.tabs, state.tabs);
    assert.strictEqual(swapped.spaces, state.spaces);
    assert.deepEqual({ ...swapped, splitLayouts: state.splitLayouts }, state);
    assert.deepEqual(swapSplitLayout(freezeState(swapped)), state);
    const explicit = swapSplitLayout(state, 'work');
    assert.strictEqual(explicit.splitLayouts[0], original);
    assert.deepEqual(getSplitLayout(explicit, 'work'), { ...work, primaryId: 'work-second', secondaryId: 'work-first', ratio: 35 });
    assert.strictEqual(swapSplitLayout(state, 'missing'), state);
  }
});

test('invalid stored layouts cannot be swapped into live layouts', () => {
  for (const layout of [{ ...personal, ratio: NaN }, { ...personal, primaryId: 'missing' }, { ...personal, secondaryId: 'work-first' }]) {
    const state = workspace([layout, work]);
    assert.strictEqual(swapSplitLayout(state), state);
  }
});
