import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, isValidState, STORAGE_KEY } from '../src/model.js';
import { BACKUP_KEY, BACKUP_QUARANTINE_KEY, QUARANTINE_KEY, loadWorkspace, recoverWorkspace, saveWorkspace } from '../src/persistence.js';

function storageWith(entries = {}, failWrite = () => false) {
  const data = new Map(Object.entries(entries));
  const writes = [];
  return {
    data, writes,
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) {
      writes.push([key, value]);
      if (failWrite(key)) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      data.set(key, String(value));
    }
  };
}

const previous = () => ({ ...initialState(), dark: true });

test('fresh recovery preserves a sole surviving backup across subsequent saves', () => {
  for (const raw of [JSON.stringify(previous()), '{invalid backup']) {
    const storage = storageWith({ [BACKUP_KEY]: raw });
    assert.equal(recoverWorkspace(storage, 'default').ok, true);
    assert.equal(saveWorkspace(storage, { ...initialState(), theme: 'sand' }).ok, true);
    assert.equal(storage.getItem(BACKUP_QUARANTINE_KEY), raw);
  }
});

test('fresh recovery preserves both damaged primary and backup or refuses replacement', () => {
  const primaryRaw = '{original primary';
  const backupRaw = JSON.stringify(previous());
  const storage = storageWith({ [STORAGE_KEY]: primaryRaw, [BACKUP_KEY]: backupRaw });
  assert.equal(recoverWorkspace(storage, 'default').ok, true);
  assert.equal(saveWorkspace(storage, previous()).ok, true);
  assert.equal(storage.getItem(QUARANTINE_KEY), primaryRaw);
  assert.equal(storage.getItem(BACKUP_QUARANTINE_KEY), backupRaw);
  for (const blocked of [
    storageWith({ [BACKUP_KEY]: backupRaw }, key => key === BACKUP_QUARANTINE_KEY),
    storageWith({ [BACKUP_KEY]: backupRaw, [BACKUP_QUARANTINE_KEY]: 'older protected bytes' })
  ]) {
    assert.equal(recoverWorkspace(blocked, 'default').ok, false);
    assert.equal(blocked.getItem(STORAGE_KEY), null);
    assert.equal(blocked.getItem(BACKUP_KEY), backupRaw);
  }
});

test('empty and valid legacy v1 loads never write or migrate', () => {
  const empty = storageWith();
  assert.deepEqual(loadWorkspace(empty).state, initialState());
  assert.equal(loadWorkspace(empty).recovery.status, 'empty');
  assert.equal(loadWorkspace(empty).recovery.protected, false);
  const legacy = previous();
  delete legacy.history;
  delete legacy.shortcuts;
  delete legacy.searchEngine;
  const raw = JSON.stringify(legacy);
  const storage = storageWith({ [STORAGE_KEY]: raw });
  assert.deepEqual(loadWorkspace(storage).state, legacy);
  assert.equal(loadWorkspace(storage).recovery.status, 'ready');
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  assert.deepEqual([...empty.writes, ...storage.writes], []);
});

test('malformed JSON and invalid schemas stay protected across loads and autosaves', () => {
  for (const raw of ['', '{', '{}', 'null', '[]', JSON.stringify({ ...initialState(), tabs: null })]) {
    const storage = storageWith({ [STORAGE_KEY]: raw });
    const loaded = loadWorkspace(storage);
    assert.deepEqual(loaded.state, initialState());
    assert.equal(loaded.recovery.protected, true);
    assert.equal(loaded.recovery.reason, raw === '' || raw === '{' ? 'malformed-json' : 'invalid-schema');
    assert.equal(saveWorkspace(storage, loaded.state).status, 'recovery-required');
    assert.equal(saveWorkspace(storage, previous()).protected, true);
    assert.equal(loadWorkspace(storage).recovery.protected, true);
    assert.equal(storage.getItem(STORAGE_KEY), raw);
    assert.deepEqual(storage.writes, []);
  }
});

test('a valid backup is a protected preview, never an implicit recovery', () => {
  for (const entries of [{ [STORAGE_KEY]: '{' }, {}]) {
    const raw = JSON.stringify(previous());
    const storage = storageWith({ ...entries, [BACKUP_KEY]: raw });
    const loaded = loadWorkspace(storage);
    assert.deepEqual(loaded.state, previous());
    assert.equal(loaded.recovery.source, 'backup');
    assert.equal(loaded.recovery.backupAvailable, true);
    assert.equal(loaded.recovery.protected, true);
    assert.equal(saveWorkspace(storage, loaded.state).ok, false);
    assert.deepEqual(storage.writes, []);
    assert.equal(storage.getItem(BACKUP_KEY), raw);
  }
});

test('invalid backup is retained without making it available for recovery', () => {
  const storage = storageWith({ [STORAGE_KEY]: '{', [BACKUP_KEY]: '{}' });
  assert.equal(loadWorkspace(storage).recovery.backupAvailable, false);
  assert.equal(recoverWorkspace(storage, 'backup').ok, false);
  assert.deepEqual(storage.writes, []);
  assert.equal(storage.getItem(BACKUP_KEY), '{}');
});

test('saves retain the exact previous valid primary and skip identical snapshots', () => {
  const raw = JSON.stringify(previous(), null, 2);
  const storage = storageWith({ [STORAGE_KEY]: raw, [BACKUP_KEY]: '{}' });
  assert.equal(saveWorkspace(storage, initialState()).status, 'saved');
  assert.equal(storage.getItem(BACKUP_KEY), raw);
  assert.deepEqual(JSON.parse(storage.getItem(STORAGE_KEY)), initialState());
  assert.equal(saveWorkspace(storage, initialState()).status, 'unchanged');
  assert.equal(storage.writes.length, 2);
  const fresh = storageWith();
  assert.equal(saveWorkspace(fresh, previous()).ok, true);
  assert.deepEqual(fresh.writes.map(([key]) => key), [STORAGE_KEY]);
});

test('invalid, circular, and serialization-altered states cause no writes', () => {
  const circular = initialState();
  circular.extra = circular;
  const throwing = { ...initialState(), toJSON() { throw new Error('Cannot serialize'); } };
  const altered = { ...initialState(), toJSON() { return {}; } };
  for (const state of [null, {}, circular, throwing, altered, { ...initialState(), extra: 1n }]) {
    const storage = storageWith({ [STORAGE_KEY]: JSON.stringify(previous()), [BACKUP_KEY]: 'preserve' });
    const before = [...storage.data];
    assert.equal(saveWorkspace(storage, state).status, 'invalid-state');
    assert.deepEqual(storage.writes, []);
    assert.deepEqual([...storage.data], before);
  }
});

test('backup quota failure leaves both existing snapshots unchanged', () => {
  const storage = storageWith({ [STORAGE_KEY]: JSON.stringify(previous()), [BACKUP_KEY]: JSON.stringify(initialState()) }, key => key === BACKUP_KEY);
  const before = [...storage.data];
  assert.equal(saveWorkspace(storage, initialState()).stage, 'backup');
  assert.deepEqual([...storage.data], before);
});

test('primary quota failure keeps primary and the last valid previous snapshot', () => {
  const raw = JSON.stringify(previous());
  const storage = storageWith({ [STORAGE_KEY]: raw, [BACKUP_KEY]: JSON.stringify(initialState()) }, key => key === STORAGE_KEY);
  assert.equal(saveWorkspace(storage, initialState()).stage, 'primary');
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  assert.equal(storage.getItem(BACKUP_KEY), raw);
  const empty = storageWith({}, () => true);
  assert.equal(saveWorkspace(empty, initialState()).ok, false);
  assert.equal(empty.data.size, 0);
});

test('unavailable storage loads defaults, remains protected, and never writes', () => {
  for (const storage of [null, undefined, { getItem() { throw new Error('Denied'); }, setItem() { assert.fail('Must not write'); } }]) {
    assert.equal(loadWorkspace(storage).recovery.status, 'unavailable');
    assert.deepEqual(loadWorkspace(storage).state, initialState());
    assert.equal(saveWorkspace(storage, initialState()).protected, true);
    assert.equal(recoverWorkspace(storage, 'default').protected, true);
  }
});

test('backup read failure protects even a valid primary from writes', () => {
  const raw = JSON.stringify(previous());
  const storage = storageWith({ [STORAGE_KEY]: raw });
  const getItem = storage.getItem;
  storage.getItem = key => { if (key === BACKUP_KEY) throw new Error('Denied'); return getItem(key); };
  assert.deepEqual(loadWorkspace(storage).state, previous());
  assert.equal(loadWorkspace(storage).recovery.status, 'unavailable');
  assert.equal(saveWorkspace(storage, initialState()).protected, true);
  assert.equal(recoverWorkspace(storage, 'default').protected, true);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  assert.deepEqual(storage.writes, []);
});

test('default recovery without a backup preserves malformed and invalid primary bytes', () => {
  for (const raw of ['', '{', '{}']) {
    const storage = storageWith({ [STORAGE_KEY]: raw });
    assert.equal(recoverWorkspace(storage, 'backup').ok, false);
    assert.deepEqual(storage.writes, []);
    assert.equal(recoverWorkspace(storage, 'default').ok, true);
    assert.equal(storage.getItem(QUARANTINE_KEY), raw);
    assert.equal(storage.getItem(BACKUP_KEY), null);
    assert.deepEqual(loadWorkspace(storage).state, initialState());
  }
});

test('explicit backup/default recovery quarantines exact corruption and enables autosave', () => {
  for (const source of ['backup', 'default']) {
    const raw = '  { damaged bytes';
    const backupRaw = JSON.stringify(previous());
    const storage = storageWith({ [STORAGE_KEY]: raw, [BACKUP_KEY]: backupRaw });
    const result = recoverWorkspace(storage, source);
    assert.equal(result.status, 'recovered');
    assert.equal(result.protected, false);
    assert.deepEqual(result.state, source === 'backup' ? previous() : initialState());
    assert.equal(storage.getItem(QUARANTINE_KEY), raw);
    assert.equal(storage.getItem(BACKUP_KEY), backupRaw);
    assert.deepEqual(storage.writes.map(([key]) => key), [...(source === 'default' ? [BACKUP_QUARANTINE_KEY] : []), QUARANTINE_KEY, STORAGE_KEY]);
    assert.equal(loadWorkspace(storage).recovery.protected, false);
    assert.equal(saveWorkspace(storage, previous()).ok, true);
  }
});

test('quarantine quota/read failure or occupied quarantine blocks replacement', () => {
  const entries = { [STORAGE_KEY]: '{', [BACKUP_KEY]: JSON.stringify(previous()) };
  const quota = storageWith(entries, key => key === QUARANTINE_KEY);
  const occupied = storageWith({ ...entries, [QUARANTINE_KEY]: 'older damage' });
  const denied = storageWith(entries);
  const getItem = denied.getItem;
  denied.getItem = key => { if (key === QUARANTINE_KEY) throw new Error('Denied'); return getItem(key); };
  for (const storage of [quota, occupied, denied]) {
    const before = [...storage.data];
    assert.equal(recoverWorkspace(storage, 'backup').ok, false);
    assert.deepEqual([...storage.data], before);
    assert.equal(loadWorkspace(storage).recovery.protected, true);
  }
  assert.equal(recoverWorkspace(occupied, 'default').status, 'quarantine-occupied');
});

test('replacement quota failure preserves quarantine and permits a safe retry', () => {
  let failPrimary = true;
  const storage = storageWith({ [STORAGE_KEY]: '{', [BACKUP_KEY]: JSON.stringify(previous()) }, key => key === STORAGE_KEY && failPrimary);
  assert.equal(recoverWorkspace(storage, 'backup').stage, 'primary');
  assert.equal(storage.getItem(STORAGE_KEY), '{');
  assert.equal(storage.getItem(QUARANTINE_KEY), '{');
  assert.equal(isValidState(JSON.parse(storage.getItem(BACKUP_KEY))), true);
  assert.equal(saveWorkspace(storage, initialState()).protected, true);
  failPrimary = false;
  assert.equal(recoverWorkspace(storage, 'backup').ok, true);
  assert.equal(storage.writes.filter(([key]) => key === QUARANTINE_KEY).length, 1);
});

test('explicit recovery handles missing primary and rejects unknown sources without writes', () => {
  const storage = storageWith({ [BACKUP_KEY]: JSON.stringify(previous()) });
  assert.equal(recoverWorkspace(storage, 'other').status, 'invalid-source');
  assert.deepEqual(storage.writes, []);
  assert.equal(recoverWorkspace(storage, 'backup').ok, true);
  assert.equal(storage.getItem(QUARANTINE_KEY), null);
  assert.deepEqual(loadWorkspace(storage).state, previous());
  assert.equal(recoverWorkspace(storage, 'default').ok, true);
  assert.deepEqual(loadWorkspace(storage).state, initialState());
  assert.deepEqual(JSON.parse(storage.getItem(BACKUP_KEY)), previous());
});
