import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createPermissionController } = require('../electron/permissions.cjs');
const origin = 'https://example.com';
const denied = { geolocation: false, notifications: false, media: false };

function fixture(controller = createPermissionController(), spaceId = 'personal') {
  const session = {
    requestInstalls: 0,
    checkInstalls: 0,
    setPermissionRequestHandler(handler) { this.request = handler; this.requestInstalls++; },
    setPermissionCheckHandler(handler) { this.check = handler; this.checkInstalls++; },
    setDisplayMediaRequestHandler() { assert.fail('Display handler belongs to the parent.'); },
  };
  let currentUrl = `${origin}/page`;
  const contents = { session, getURL: () => currentUrl, isDestroyed: () => false };
  const details = { requestingUrl: `${origin}/page`, isMainFrame: true };
  controller.install(session, spaceId);
  function request(permission = 'geolocation', data = details, requester = contents) {
    const results = [];
    session.request(requester, permission, result => results.push(result), data);
    assert.equal(results.length, 1);
    assert.equal(typeof results[0], 'boolean');
    return results[0];
  }
  function check(permission = 'geolocation', data = { ...details, embeddingOrigin: origin }, requester = contents, requestingOrigin = origin) {
    return session.check(requester, permission, requestingOrigin, data);
  }
  return { controller, session, contents, details, request, check, navigate: url => { currentUrl = url; } };
}

test('defaults deny with the exact public snapshot shape', () => {
  const { controller, request, check } = fixture();
  assert.deepEqual(controller.get('personal', `${origin}/page`), { origin, eligible: true, permissions: denied });
  for (const permission of Object.keys(denied)) {
    assert.equal(request(permission), false);
    assert.equal(check(permission), false);
  }
});

test('explicit choices allow both real Electron signatures, then revoke immediately', () => {
  const { controller, request, check } = fixture();
  for (const permission of Object.keys(denied)) {
    const snapshot = controller.set('personal', `${origin}/settings`, permission, true);
    assert.equal(snapshot.permissions[permission], true);
    assert.equal(request(permission), true);
    assert.equal(check(permission), true);
    controller.set('personal', origin, permission, false);
    assert.equal(request(permission), false);
    assert.equal(check(permission), false);
  }
});

test('choices use canonical exact origins, ignoring paths but not scheme, host or port', () => {
  const controller = createPermissionController();
  controller.set('personal', 'https://EXAMPLE.com:443/one?q=1#part', 'geolocation', true);
  assert.equal(controller.get('personal', `${origin}/two`).permissions.geolocation, true);
  for (const url of ['https://example.com:444', 'https://sub.example.com', 'https://example.net', 'http://example.com']) {
    assert.equal(controller.get('personal', url).permissions.geolocation, false, url);
  }
});

test('allows HTTPS and exact HTTP loopback hosts only', () => {
  const controller = createPermissionController();
  for (const url of ['https://example.com', 'https://localhost', 'http://localhost:3000', 'http://127.0.0.1:8080', 'http://[::1]:9000']) {
    assert.equal(controller.get('personal', url).eligible, true, url);
    controller.set('personal', url, 'notifications', true);
    assert.equal(controller.get('personal', url).permissions.notifications, true);
  }
  for (const url of ['http://example.com', 'http://192.168.1.1', 'http://localhost.evil.test', 'http://sub.localhost', 'http://localhost.']) {
    assert.equal(controller.get('personal', url).eligible, false, url);
    assert.throws(() => controller.set('personal', url, 'media', true), /Ineligible/);
  }
});

const invalidUrls = [null, undefined, 42, {}, [], '', 'not a url', '//example.com', 'https:', 'https://', 'https:example.com', 'https:///example.com', 'file:///tmp/private', 'about:blank', 'data:text/html,hi', 'blob:https://example.com/id', 'javascript:alert(1)', 'ftp://example.com', 'https://u:p@example.com', 'https://u@example.com', 'https://@example.com', 'https://:p@example.com', 'https://example.com:99999', ' https://example.com', 'https://example.com\n', 'https://exa\tmple.com', 'https://example.com\\@evil.test', `https://example.com/${'x'.repeat(16000)}`];

test('invalid and credentialed URLs cannot store or retrieve allowances', () => {
  const controller = createPermissionController();
  controller.set('personal', origin, 'geolocation', true);
  for (const url of invalidUrls) {
    const snapshot = controller.get('personal', url);
    assert.equal(snapshot.eligible, false, String(url));
    assert.deepEqual(snapshot.permissions, denied);
    assert.throws(() => controller.set('personal', url, 'geolocation', true), /Ineligible/);
    assert.deepEqual(controller.clear('personal', url).permissions, denied);
  }
  assert.equal(controller.get('personal', origin).permissions.geolocation, true);
});

test('set strictly validates permission and boolean inputs without mutation', () => {
  const controller = createPermissionController();
  for (const permission of ['camera', 'microphone', 'display-capture', 'fullscreen', '__proto__', 'constructor', 'toString', '', null, {}, ['media']]) {
    assert.throws(() => controller.set('personal', origin, permission, true), /Unsupported/);
  }
  for (const allowed of [undefined, null, 1, 0, 'true', 'false', {}, []]) {
    assert.throws(() => controller.set('personal', origin, 'media', allowed), /boolean/);
  }
  assert.deepEqual(controller.get('personal', origin).permissions, denied);
});

test('space IDs are validated consistently by every method', () => {
  const controller = createPermissionController();
  for (const spaceId of ['', '../other', 'a:b', null, undefined, {}, 'x'.repeat(81)]) {
    assert.throws(() => controller.get(spaceId, origin), /space/);
    assert.throws(() => controller.set(spaceId, origin, 'media', true), /space/);
    assert.throws(() => controller.clear(spaceId, origin), /space/);
    assert.throws(() => controller.install({}, spaceId), /space/);
  }
});

test('choices are memory-only and isolated across spaces, sessions and controller instances', () => {
  const first = fixture();
  const otherSpace = fixture(first.controller, 'work');
  const sameSpace = fixture(first.controller);
  first.controller.set('personal', origin, 'geolocation', true);
  assert.equal(first.request(), true);
  assert.equal(sameSpace.check(), true);
  assert.equal(otherSpace.request(), false);
  assert.equal(otherSpace.check(), false);
  assert.equal(fixture().request(), false);
  assert.equal(first.request('geolocation', first.details, otherSpace.contents), false);
  assert.equal(first.check('geolocation', first.details, otherSpace.contents), false);
});

test('clear resets only the selected space and origin', () => {
  const controller = createPermissionController();
  for (const spaceId of ['personal', 'work']) {
    for (const url of [origin, 'https://other.test']) {
      for (const permission of Object.keys(denied)) controller.set(spaceId, url, permission, true);
    }
  }
  assert.deepEqual(controller.clear('personal', `${origin}/another`).permissions, denied);
  assert.equal(controller.get('work', origin).permissions.media, true);
  assert.equal(controller.get('personal', 'https://other.test').permissions.media, true);
  assert.deepEqual(controller.clear('personal', origin).permissions, denied);
});

test('returned snapshots cannot mutate stored choices', () => {
  const controller = createPermissionController();
  const snapshot = controller.set('personal', origin, 'media', true);
  snapshot.permissions.media = false;
  snapshot.permissions.geolocation = true;
  snapshot.origin = 'https://evil.test';
  assert.deepEqual(controller.get('personal', origin).permissions, { ...denied, media: true });
});

test('installation is idempotent and cannot rebind a session to another space', () => {
  const { controller, session } = fixture();
  controller.install(session, 'personal');
  assert.equal(session.requestInstalls, 1);
  assert.equal(session.checkInstalls, 1);
  assert.throws(() => controller.install(session, 'work'), /another space/);
  assert.equal(session.requestInstalls, 1);
  for (const invalid of [null, undefined, {}, { setPermissionRequestHandler() {} }, { setPermissionCheckHandler() {} }]) {
    assert.throws(() => controller.install(invalid, 'personal'), /session/);
  }
});

test('every non-allowlisted permission, including display capture, stays denied', () => {
  const { controller, request, check } = fixture();
  for (const permission of Object.keys(denied)) controller.set('personal', origin, permission, true);
  for (const permission of ['display-capture', 'camera', 'microphone', 'geolocation-approximate', 'fullscreen', 'clipboard-read', 'clipboard-sanitized-write', 'midi', 'midiSysex', 'usb', 'serial', 'hid', 'pointerLock', 'openExternal', 'storage-access', 'speaker-selection', 'unknown', 'future-permission', '__proto__', 'constructor', null, {}, ['media']]) {
    assert.equal(request(permission), false, String(permission));
    assert.equal(check(permission), false, String(permission));
  }
  const { session, contents, details } = fixture(controller);
  assert.equal(session.check(contents, undefined, origin, details), false);
  session.request(contents, undefined, result => assert.equal(result, false), details);
});

test('same-origin and cross-origin subframes and missing main-frame evidence are denied', () => {
  const { controller, request, check, details } = fixture();
  controller.set('personal', origin, 'geolocation', true);
  for (const isMainFrame of [false, undefined, null, 1, 'true']) {
    for (const requestingUrl of [origin, 'https://evil.test']) {
      const data = { ...details, requestingUrl, isMainFrame };
      assert.equal(request('geolocation', data), false);
      assert.equal(check('geolocation', data), false);
    }
  }
});

test('missing or malformed details and document-less checks fail closed', () => {
  const { controller, session, contents, request, check } = fixture();
  controller.set('personal', origin, 'geolocation', true);
  for (const details of [null, false, 0, '', [], {}, { isMainFrame: true }]) {
    assert.equal(request('geolocation', details), false);
    assert.equal(check('geolocation', details), false);
  }
  assert.equal(session.check(contents, 'geolocation', origin), false);
  const results = [];
  session.request(contents, 'geolocation', result => results.push(result));
  assert.deepEqual(results, [false]);
  assert.doesNotThrow(() => session.request(contents, 'geolocation', null, {}));
});

test('requesting document URL must independently match the secure top-level origin', () => {
  const { controller, request, check, details } = fixture();
  controller.set('personal', origin, 'geolocation', true);
  for (const requestingUrl of [...invalidUrls, 'https://evil.test', 'https://sub.example.com', 'https://example.com:444', 'http://example.com']) {
    const data = { ...details, requestingUrl };
    assert.equal(request('geolocation', data), false, String(requestingUrl));
    assert.equal(check('geolocation', data), false, String(requestingUrl));
  }
  assert.equal(request('geolocation', { ...details, requestingUrl: `${origin}/different` }), true);
});

test('check requestingOrigin uses the third argument, not request-handler argument order', () => {
  const { controller, session, contents, request, check, details } = fixture();
  controller.set('personal', origin, 'geolocation', true);
  for (const requestingOrigin of [...invalidUrls, 'https://evil.test', 'http://example.com', 'https://example.com:444']) {
    assert.equal(session.check(contents, 'geolocation', requestingOrigin, details), false, String(requestingOrigin));
  }
  assert.equal(check(), true);
  assert.equal(request(), true);
  assert.equal(session.check(contents, 'geolocation', details, origin), false);
});

test('conflicting or malformed optional security origins never fall back to document URL', () => {
  const { controller, request, check, details } = fixture();
  controller.set('personal', origin, 'geolocation', true);
  for (const securityOrigin of [...invalidUrls, 'https://evil.test', 'https://example.com:444']) {
    const data = { ...details, securityOrigin };
    assert.equal(request('geolocation', data), false);
    assert.equal(check('geolocation', data), false);
  }
  assert.equal(request('geolocation', { ...details, securityOrigin: origin }), true);
  assert.equal(check('geolocation', { ...details, securityOrigin: origin }), true);
});

test('Electron 45 top-level checks accept matching embedding origins, never request-handler evidence', () => {
  const { controller, request, check, details } = fixture();
  controller.set('personal', origin, 'geolocation', true);
  for (const embeddingOrigin of [origin, `${origin}/`, 'https://EXAMPLE.com:443/']) {
    assert.equal(request('geolocation', { ...details, embeddingOrigin }), false);
    assert.equal(check('geolocation', { ...details, embeddingOrigin }), true);
  }
  for (const embeddingOrigin of [...invalidUrls, 'https://evil.test', 'https://sub.example.com', 'https://example.com:444', 'http://example.com']) {
    assert.equal(check('geolocation', { ...details, embeddingOrigin }), false, String(embeddingOrigin));
  }
});

test('real Electron subframe and document-less check shapes stay denied after explicit grants', () => {
  const { controller, request, check } = fixture();
  controller.set('personal', origin, 'geolocation', true);
  controller.set('personal', 'https://other.test', 'geolocation', true);
  for (const requestingOrigin of [origin, 'https://other.test']) {
    for (const isMainFrame of [false, undefined, null, 1, 'true']) {
      const details = { embeddingOrigin: `${origin}/`, isMainFrame, requestingUrl: `${requestingOrigin}/frame` };
      assert.equal(check('geolocation', details, undefined, `${requestingOrigin}/`), false);
      assert.equal(request('geolocation', { isMainFrame, requestingUrl: details.requestingUrl }), false);
    }
  }
  assert.equal(check('geolocation', { embeddingOrigin: origin, isMainFrame: true }), false);
  assert.equal(check('geolocation', { embeddingOrigin: origin, requestingUrl: `${origin}/` }), false);
});

test('camera and microphone share media choices using actual media request/check fields', () => {
  const { controller, request, check, details } = fixture();
  controller.set('personal', origin, 'media', true);
  for (const mediaTypes of [['audio'], ['video'], ['audio', 'video']]) {
    assert.equal(request('media', { ...details, securityOrigin: origin, mediaTypes }), true);
  }
  for (const mediaType of ['audio', 'video']) assert.equal(check('media', { ...details, securityOrigin: origin, mediaType }), true);
  assert.equal(request('media'), true);
  assert.equal(check('media'), true);
  controller.set('personal', origin, 'media', false);
  assert.equal(request('media', { ...details, mediaTypes: ['audio', 'video'] }), false);
});

test('unsupported and malformed media metadata cannot grant display or unknown access', () => {
  const { controller, request, check, details } = fixture();
  controller.set('personal', origin, 'media', true);
  for (const mediaTypes of [[], new Array(1), ['screen'], ['display'], ['audio', 'screen'], ['unknown'], 'video', null, undefined, {}]) {
    assert.equal(request('media', { ...details, mediaTypes }), false);
  }
  for (const mediaType of ['screen', 'display', 'unknown', null, undefined, {}, ['video']]) {
    assert.equal(check('media', { ...details, mediaType }), false);
  }
  assert.equal(request('display-capture', { ...details, mediaTypes: ['audio', 'video'] }), false);
});

test('null, destroyed, wrong-session and malformed webContents are denied', () => {
  const { controller, contents, request, check, details } = fixture();
  controller.set('personal', origin, 'geolocation', true);
  for (const requester of [null, {}, { ...contents, session: {} }, { ...contents, session: undefined }, { ...contents, isDestroyed: () => true }, { ...contents, isDestroyed: () => undefined }, { ...contents, isDestroyed: null }, { ...contents, getURL: null }, { ...contents, getURL() { throw new Error('destroyed'); } }, { ...contents, isDestroyed() { throw new Error('destroyed'); } }]) {
    assert.equal(request('geolocation', details, requester), false);
    assert.equal(check('geolocation', details, requester), false);
  }
});

test('navigation is evaluated on every call; stale and ineligible top-level URLs deny', () => {
  const { controller, navigate, request, check, details } = fixture();
  controller.set('personal', origin, 'geolocation', true);
  for (const url of [...invalidUrls, 'https://other.test', 'http://example.com']) {
    navigate(url);
    assert.equal(request(), false, String(url));
    assert.equal(check(), false, String(url));
  }
  navigate('https://other.test');
  controller.set('personal', 'https://other.test', 'geolocation', true);
  assert.equal(request(), false);
  assert.equal(check(), false);
  const otherDetails = { ...details, requestingUrl: 'https://other.test/page' };
  assert.equal(request('geolocation', otherDetails), true);
  assert.equal(check('geolocation', otherDetails), false);
  assert.equal(check('geolocation', otherDetails, undefined, 'https://other.test'), true);
  navigate(origin);
  assert.equal(request(), true);
});

test('eligible localhost documents pass both handlers with matching exact origin', () => {
  const { controller, contents, navigate, request, check } = fixture();
  const local = 'http://localhost:3000';
  controller.set('personal', local, 'notifications', true);
  navigate(`${local}/page`);
  const details = { isMainFrame: true, requestingUrl: `${local}/page` };
  assert.equal(request('notifications', details), true);
  assert.equal(check('notifications', details, contents, local), true);
  assert.equal(check('notifications', details, contents, 'http://localhost:3001'), false);
});

test('unexpected property access errors fail closed and callbacks are invoked only once', () => {
  const { controller, session, contents, details, request, check } = fixture();
  controller.set('personal', origin, 'geolocation', true);
  const broken = { get isMainFrame() { throw new Error('bad details'); } };
  assert.equal(request('geolocation', broken), false);
  assert.equal(check('geolocation', broken), false);
  let calls = 0;
  assert.throws(() => session.request(contents, 'geolocation', () => { calls++; throw new Error('callback failure'); }, details), /callback failure/);
  assert.equal(calls, 1);
});
