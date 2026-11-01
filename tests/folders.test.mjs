import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteFolder, renameFolder } from '../src/folders.js';
import { initialState, isValidState, restoreTab } from '../src/model.js';

function freezeState(state) {
  for (const value of Object.values(state)) {
    if (value && typeof value === 'object') freezeState(value);
  }
  return Object.freeze(state);
}

test('rename trims names, preserves state and folder order, and does not mutate input', () => {
  const state = freezeState(initialState());
  const renamed = renameFolder(state, 'inspiration', '  New ideas  ');
  assert.equal(renamed.folders[0].name, 'New ideas');
  assert.deepEqual(renamed.folders.map(folder => folder.id), state.folders.map(folder => folder.id));
  assert.strictEqual(renamed.folders[1], state.folders[1]);
  assert.deepEqual({ ...renamed, folders: state.folders }, state);
  assert.equal(isValidState(renamed), true);
});

test('rename caps trimmed names at 80 characters', () => {
  const state = initialState();
  for (const name of ['a'.repeat(100), '界'.repeat(100)]) {
    const renamed = renameFolder(state, 'inspiration', `  ${name}  `);
    assert.equal(renamed.folders[0].name, name.slice(0, 80));
    assert.equal(isValidState(renamed), true);
  }
});

test('invalid, unknown and unchanged renames return the original state', () => {
  const state = freezeState(initialState());
  for (const name of ['', ' \n\t ', null, undefined, 123, {}, []]) {
    assert.strictEqual(renameFolder(state, 'inspiration', name), state);
  }
  assert.strictEqual(renameFolder(state, 'missing', 'Valid name'), state);
  assert.strictEqual(renameFolder(state, 'inspiration', ` ${state.folders[0].name} `), state);
});

test('delete keeps live and archived tabs, clearing only matching folder assignments', () => {
  const initial = initialState();
  const state = freezeState({ ...initial, activeTabId: 'arena', archive: [
    { ...initial.tabs.find(tab => tab.id === 'arena'), id: 'archived-idea', closedAt: 123 },
    { ...initial.tabs.find(tab => tab.id === 'read'), id: 'archived-reading', closedAt: 124 },
  ] });
  const deleted = deleteFolder(state, 'inspiration');
  assert.deepEqual(deleted.folders, state.folders.filter(folder => folder.id !== 'inspiration'));
  for (const collection of ['tabs', 'archive']) {
    assert.equal(deleted[collection].length, state[collection].length);
    assert.deepEqual(deleted[collection].map(tab => tab.id), state[collection].map(tab => tab.id));
    state[collection].forEach((tab, index) => {
      if (tab.folderId === 'inspiration') {
        const { folderId, ...remaining } = tab;
        assert.deepEqual(deleted[collection][index], remaining);
        assert.equal(Object.hasOwn(deleted[collection][index], 'folderId'), false);
      } else assert.strictEqual(deleted[collection][index], tab);
    });
  }
  assert.deepEqual({ ...deleted, folders: state.folders, tabs: state.tabs, archive: state.archive }, state);
  assert.equal(isValidState(deleted), true);
  assert.equal(isValidState(restoreTab(deleted, 'archived-idea')), true);
});

test('deleting an unknown folder returns the original state', () => {
  const state = freezeState(initialState());
  assert.strictEqual(deleteFolder(state, 'missing'), state);
  assert.strictEqual(deleteFolder(state, undefined), state);
});

test('deleting the last empty folder leaves a valid workspace', () => {
  const initial = initialState();
  const state = freezeState({ ...initial, folders: [{ id: 'empty', spaceId: 'personal', name: 'Empty' }], tabs: initial.tabs.map(tab => {
    const { folderId, ...remaining } = tab;
    return remaining;
  }) });
  const deleted = deleteFolder(state, 'empty');
  assert.deepEqual(deleted.folders, []);
  assert.deepEqual(deleted.tabs, state.tabs);
  assert.equal(isValidState(deleted), true);
});

test('operations target folder IDs, not duplicate names or the active space', () => {
  const initial = initialState();
  const state = freezeState({ ...initial, folders: [...initial.folders,
    { id: 'work-ideas', spaceId: 'work', name: initial.folders[0].name },
  ] });
  assert.equal(isValidState(state), true);
  const renamed = renameFolder(state, 'work-ideas', 'Work ideas');
  assert.strictEqual(renamed.folders[0], state.folders[0]);
  assert.equal(renamed.folders.at(-1).name, 'Work ideas');
  const deleted = deleteFolder(state, 'work-ideas');
  assert.deepEqual(deleted.folders, initial.folders);
  assert.deepEqual(deleted.tabs, initial.tabs);
  assert.equal(isValidState(deleted), true);
});
