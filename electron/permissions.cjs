const { validId } = require('./policy.cjs');

const permissionNames = ['geolocation', 'notifications', 'media'];

function describeUrl(value) {
  if (typeof value !== 'string' || value.length > 16000 || /[\s\\\u0000-\u001f\u007f]/.test(value) || !/^https?:\/\//i.test(value)) return { origin: null, eligible: false };
  try {
    const url = new URL(value);
    const authority = value.slice(value.indexOf('://') + 3).split(/[/?#]/, 1)[0];
    if (!authority || url.username || url.password || authority.includes('@')) return { origin: null, eligible: false };
    const eligible = url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
    return { origin: url.origin, eligible };
  } catch { return { origin: null, eligible: false }; }
}

function validateSpace(spaceId) {
  if (!validId(spaceId)) throw new TypeError('Invalid permission space identifier.');
}

function createPermissionController() {
  const spaces = new Map();
  const sessions = new WeakMap();

  function get(spaceId, url) {
    validateSpace(spaceId);
    const { origin, eligible } = describeUrl(url);
    const choices = eligible ? spaces.get(spaceId)?.get(origin) : undefined;
    return { origin, eligible, permissions: Object.fromEntries(permissionNames.map(permission => [permission, choices?.has(permission) === true])) };
  }

  function set(spaceId, url, permission, allowed) {
    validateSpace(spaceId);
    if (!permissionNames.includes(permission)) throw new TypeError('Unsupported permission.');
    if (typeof allowed !== 'boolean') throw new TypeError('Permission allowance must be boolean.');
    const { origin, eligible } = describeUrl(url);
    if (!eligible) throw new TypeError('Ineligible permission origin.');
    if (allowed) {
      if (!spaces.has(spaceId)) spaces.set(spaceId, new Map());
      const origins = spaces.get(spaceId);
      if (!origins.has(origin)) origins.set(origin, new Set());
      origins.get(origin).add(permission);
    } else {
      const origins = spaces.get(spaceId);
      const choices = origins?.get(origin);
      choices?.delete(permission);
      if (choices?.size === 0) origins.delete(origin);
      if (origins?.size === 0) spaces.delete(spaceId);
    }
    return get(spaceId, url);
  }

  function clear(spaceId, url) {
    validateSpace(spaceId);
    const { origin, eligible } = describeUrl(url);
    if (eligible) {
      const origins = spaces.get(spaceId);
      origins?.delete(origin);
      if (origins?.size === 0) spaces.delete(spaceId);
    }
    return get(spaceId, url);
  }

  function install(session, spaceId) {
    validateSpace(spaceId);
    if (!session || typeof session.setPermissionRequestHandler !== 'function' || typeof session.setPermissionCheckHandler !== 'function') throw new TypeError('Invalid permission session.');
    if (sessions.has(session)) {
      if (sessions.get(session) !== spaceId) throw new Error('Permission session already belongs to another space.');
      return;
    }

    function allows(webContents, permission, details, requestingOrigin, check) {
      try {
        if (!permissionNames.includes(permission) || !details || typeof details !== 'object' || Array.isArray(details) || details.isMainFrame !== true) return false;
        if (!webContents || webContents.session !== session || typeof webContents.isDestroyed !== 'function' || webContents.isDestroyed() !== false || typeof webContents.getURL !== 'function') return false;
        const top = describeUrl(webContents.getURL());
        const frame = describeUrl(details.requestingUrl);
        if (!top.eligible || !frame.eligible || top.origin !== frame.origin) return false;
        if (check) {
          const requesting = describeUrl(requestingOrigin);
          if (!requesting.eligible || requesting.origin !== top.origin) return false;
        }
        if ('embeddingOrigin' in details) {
          const embedding = describeUrl(details.embeddingOrigin);
          if (!check || !embedding.eligible || embedding.origin !== top.origin) return false;
        }
        if ('securityOrigin' in details) {
          const security = describeUrl(details.securityOrigin);
          if (!security.eligible || security.origin !== top.origin) return false;
        }
        if (permission === 'media') {
          if ('mediaType' in details && !['audio', 'video'].includes(details.mediaType)) return false;
          if ('mediaTypes' in details && (!Array.isArray(details.mediaTypes) || details.mediaTypes.length === 0 || !Array.from(details.mediaTypes).every(type => ['audio', 'video'].includes(type)))) return false;
        }
        return spaces.get(spaceId)?.get(top.origin)?.has(permission) === true;
      } catch { return false; }
    }

    session.setPermissionRequestHandler((webContents, permission, callback, details) => {
      if (typeof callback === 'function') callback(allows(webContents, permission, details, undefined, false));
    });
    session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => allows(webContents, permission, details, requestingOrigin, true));
    sessions.set(session, spaceId);
  }

  return { install, get, set, clear };
}

module.exports = { createPermissionController };
