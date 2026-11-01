import { initialState, isValidState, STORAGE_KEY } from './model.js';

export const BACKUP_KEY = `${STORAGE_KEY}.backup`;
export const QUARANTINE_KEY = `${STORAGE_KEY}.quarantine`;
export const BACKUP_QUARANTINE_KEY = `${BACKUP_KEY}.quarantine`;

function readSnapshot(storage, key) {
  let raw;
  try { raw = storage.getItem(key); } catch { return { status: 'unavailable' }; }
  if (raw === null) return { status: 'missing', raw };
  let state;
  try { state = JSON.parse(raw); } catch { return { status: 'malformed-json', raw }; }
  try {
    return isValidState(state) ? { status: 'valid', raw, state } : { status: 'invalid-schema', raw };
  } catch { return { status: 'invalid-schema', raw }; }
}

function serialize(state) {
  try {
    if (!isValidState(state)) return null;
    const raw = JSON.stringify(state);
    return typeof raw === 'string' && isValidState(JSON.parse(raw)) ? raw : null;
  } catch { return null; }
}

function inspect(storage) {
  const primary = readSnapshot(storage, STORAGE_KEY);
  const backup = readSnapshot(storage, BACKUP_KEY);
  const unavailable = primary.status === 'unavailable' || backup.status === 'unavailable';
  const protectedState = unavailable || (primary.status !== 'valid' && (primary.status !== 'missing' || backup.status !== 'missing'));
  return {
    primary, backup,
    recovery: {
      status: unavailable ? 'unavailable' : protectedState ? 'recovery-required' : primary.status === 'valid' ? 'ready' : 'empty',
      protected: protectedState,
      reason: unavailable ? 'storage-unavailable' : protectedState ? primary.status === 'missing' ? 'primary-missing' : primary.status : null,
      backupAvailable: backup.status === 'valid',
      primaryStatus: primary.status,
      backupStatus: backup.status,
      source: primary.status === 'valid' ? 'primary' : backup.status === 'valid' ? 'backup' : 'default'
    }
  };
}

export function loadWorkspace(storage) {
  const { primary, backup, recovery } = inspect(storage);
  return { state: primary.state ?? backup.state ?? initialState(), recovery };
}

export function saveWorkspace(storage, state) {
  const raw = serialize(state);
  if (raw === null) return { ok: false, status: 'invalid-state', protected: false };
  const { primary, backup, recovery } = inspect(storage);
  if (recovery.protected) return { ok: false, status: recovery.status, protected: true, recovery };
  if (primary.raw === raw) return { ok: true, status: 'unchanged', protected: false };
  if (primary.status === 'valid' && backup.raw !== primary.raw) {
    try { storage.setItem(BACKUP_KEY, primary.raw); } catch {
      return { ok: false, status: 'storage-error', stage: 'backup', protected: false };
    }
  }
  try { storage.setItem(STORAGE_KEY, raw); } catch {
    return { ok: false, status: 'storage-error', stage: 'primary', protected: false };
  }
  return { ok: true, status: 'saved', protected: false };
}

export function recoverWorkspace(storage, source) {
  if (source !== 'backup' && source !== 'default') return { ok: false, status: 'invalid-source', protected: true };
  const { primary, backup, recovery } = inspect(storage);
  if (recovery.status === 'unavailable') return { ok: false, status: 'unavailable', protected: true, recovery };
  const state = source === 'backup' ? backup.state : initialState();
  const raw = serialize(state);
  if (raw === null) return { ok: false, status: 'invalid-state', protected: true };
  if (primary.status === 'valid') {
    const result = saveWorkspace(storage, state);
    return result.ok ? { ...result, status: 'recovered', state } : result;
  }
  if (source === 'default' && backup.status !== 'missing') {
    let quarantined;
    try { quarantined = storage.getItem(BACKUP_QUARANTINE_KEY); } catch {
      return { ok: false, status: 'storage-error', stage: 'backup-quarantine', protected: true };
    }
    if (quarantined !== null && quarantined !== backup.raw) return { ok: false, status: 'quarantine-occupied', stage: 'backup-quarantine', protected: true };
    if (quarantined === null) {
      try { storage.setItem(BACKUP_QUARANTINE_KEY, backup.raw); } catch {
        return { ok: false, status: 'storage-error', stage: 'backup-quarantine', protected: true };
      }
    }
  }
  if (primary.status !== 'missing') {
    let quarantined;
    try { quarantined = storage.getItem(QUARANTINE_KEY); } catch {
      return { ok: false, status: 'storage-error', stage: 'quarantine', protected: true };
    }
    if (quarantined !== null && quarantined !== primary.raw) return { ok: false, status: 'quarantine-occupied', protected: true };
    if (quarantined === null) {
      try { storage.setItem(QUARANTINE_KEY, primary.raw); } catch {
        return { ok: false, status: 'storage-error', stage: 'quarantine', protected: true };
      }
    }
  }
  try { storage.setItem(STORAGE_KEY, raw); } catch {
    return { ok: false, status: 'storage-error', stage: 'primary', protected: true };
  }
  return { ok: true, status: 'recovered', protected: false, state };
}
