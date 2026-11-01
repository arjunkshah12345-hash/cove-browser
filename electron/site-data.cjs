const { validId } = require('./policy.cjs');

function createSiteDataController({ getSession, canClear, beforeClear, afterClear }) {
  const clearing = new Set();
  async function clearSpace(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request) || !validId(request.spaceId) || request.confirmed !== true || Object.keys(request).some(key => !['spaceId', 'confirmed'].includes(key))) return { ok: false, reason: 'Invalid confirmed space request.' };
    const { spaceId } = request;
    if (clearing.size) return { ok: false, reason: 'A space reset is already in progress.' };
    clearing.add(spaceId);
    let result = { ok: false, reason: 'Space reset failed.' };
    let authorized = false;
    let attempted = false;
    try {
      const allowed = canClear(spaceId);
      if (allowed !== true && allowed?.ok !== true) return { ok: false, reason: allowed?.reason || 'Space reset is not authorized.' };
      authorized = true;
      await beforeClear(spaceId);
      const target = getSession(spaceId);
      if (!target) throw new Error('Space session is unavailable.');
      const failures = [];
      for (const method of ['clearStorageData', 'clearCache', 'clearAuthCache', ...(typeof target.closeAllConnections === 'function' ? ['closeAllConnections'] : [])]) {
        attempted = true;
        try { await target[method](); }
        catch { failures.push(method); }
      }
      result = failures.length ? { ok: false, partial: true, reason: `Failed to clear: ${failures.join(', ')}.` } : { ok: true };
    } catch {
      result = { ok: false, ...(attempted ? { partial: true } : {}), reason: 'Space reset failed.' };
    } finally {
      try {
        if (authorized) await afterClear(spaceId, result);
      } catch {
        result = { ok: false, ...(attempted ? { partial: true } : {}), reason: 'Space reset finalization failed.' };
      } finally { clearing.delete(spaceId); }
    }
    return result;
  }
  return { clearSpace, isClearing: spaceId => clearing.has(spaceId) };
}

module.exports = { createSiteDataController };
