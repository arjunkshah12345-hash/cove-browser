import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { launchPrivate } = require('../electron/private.cjs');

function harness(overrides = {}) {
  const children = [];
  const launches = [];
  const prefixes = [];
  const options = {
    execPath: '/Applications/Cove.app/Contents/MacOS/Cove',
    appPath: '/development/cove app',
    isPackaged: false,
    env: { PATH: '/usr/bin', COVE_DEV_URL: 'http://127.0.0.1:5173', ELECTRON_RUN_AS_NODE: '1' },
    tmpdir: () => '/temporary',
    mkdtemp: async prefix => {
      prefixes.push(prefix);
      return `${prefix}${prefixes.length}`;
    },
    spawn: (...args) => {
      launches.push(args);
      const child = new EventEmitter();
      child.pid = 1000 + children.length;
      child.unrefCount = 0;
      child.unref = () => { child.unrefCount += 1; };
      children.push(child);
      return child;
    },
    ...overrides,
  };
  return { options, children, launches, prefixes };
}

async function start(runtime) {
  const pending = launchPrivate(runtime.options);
  await Promise.resolve();
  return { pending, child: runtime.children.at(-1) };
}

test('unpackaged launch waits for spawn and reports only process creation', async () => {
  const runtime = harness();
  const { pending, child } = await start(runtime);
  let settled = false;
  pending.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(child.unrefCount, 0);
  assert.equal(child.listenerCount('error'), 1);
  assert.deepEqual(runtime.prefixes, [path.join('/temporary', 'cove-private-')]);
  assert.deepEqual(runtime.launches, [[runtime.options.execPath, [runtime.options.appPath], {
    detached: true,
    stdio: 'ignore',
    env: { PATH: '/usr/bin', COVE_DEV_URL: 'http://127.0.0.1:5173', COVE_PRIVATE: '1', COVE_USER_DATA: '/temporary/cove-private-1' },
  }]]);
  child.emit('spawn');
  assert.deepEqual(await pending, { spawned: true, pid: 1000, userDataPath: '/temporary/cove-private-1' });
  assert.equal(child.unrefCount, 1);
});

test('packaged launch passes no app argument and needs no appPath', async () => {
  const runtime = harness({ isPackaged: true, appPath: undefined, env: {} });
  const { pending, child } = await start(runtime);
  child.emit('spawn');
  await pending;
  assert.deepEqual(runtime.launches[0][1], []);
  assert.equal(Object.hasOwn(runtime.launches[0][2].env, 'COVE_DEV_URL'), false);
});

test('every launch gets a distinct profile and leaves the inherited environment untouched', async () => {
  const env = Object.freeze({ COVE_PRIVATE: '0', COVE_USER_DATA: '/regular/profile', ELECTRON_RUN_AS_NODE: '1', COVE_DEV_URL: 'http://localhost:5173' });
  const runtime = harness({ env });
  const first = await start(runtime);
  const second = await start(runtime);
  first.child.emit('spawn');
  second.child.emit('spawn');
  const results = await Promise.all([first.pending, second.pending]);
  assert.notEqual(results[0].userDataPath, results[1].userDataPath);
  for (const [, , options] of runtime.launches) {
    assert.notEqual(options.env, env);
    assert.equal(options.env.COVE_PRIVATE, '1');
    assert.notEqual(options.env.COVE_USER_DATA, env.COVE_USER_DATA);
    assert.equal(options.env.COVE_DEV_URL, env.COVE_DEV_URL);
    assert.equal(Object.hasOwn(options.env, 'ELECTRON_RUN_AS_NODE'), false);
  }
  assert.equal(env.COVE_PRIVATE, '0');
  assert.equal(env.COVE_USER_DATA, '/regular/profile');
  assert.equal(env.ELECTRON_RUN_AS_NODE, '1');
});

test('directory creation failures reject without spawning or deleting anything', async () => {
  const failure = new Error('temporary directory denied');
  const runtime = harness({ mkdtemp: async () => { throw failure; } });
  await assert.rejects(launchPrivate(runtime.options), error => error === failure);
  assert.equal(runtime.launches.length, 0);
});

test('synchronous spawn failures become rejected promises', async () => {
  const failure = new Error('spawn failed synchronously');
  const runtime = harness({ spawn: () => { throw failure; } });
  await assert.rejects(launchPrivate(runtime.options), error => error === failure);
  assert.equal(runtime.prefixes.length, 1);
});

test('asynchronous spawn errors reject before reporting success', async () => {
  const runtime = harness();
  const { pending, child } = await start(runtime);
  const failure = Object.assign(new Error('executable not found'), { code: 'ENOENT' });
  const rejected = assert.rejects(pending, error => error === failure);
  queueMicrotask(() => child.emit('error', failure));
  await rejected;
  assert.equal(child.unrefCount, 0);
});

test('post-spawn process errors are handled without changing the spawn result', async () => {
  const runtime = harness();
  const { pending, child } = await start(runtime);
  child.emit('spawn');
  const result = await pending;
  assert.doesNotThrow(() => child.emit('error', new Error('later process error')));
  assert.equal(result.spawned, true);
});

test('unref failures reject rather than escaping the event handler', async () => {
  const runtime = harness();
  const { pending, child } = await start(runtime);
  const failure = new Error('unref failed');
  child.unref = () => { throw failure; };
  const rejected = assert.rejects(pending, error => error === failure);
  assert.doesNotThrow(() => child.emit('spawn'));
  await rejected;
});

test('invalid launch inputs reject before creating a directory or child', async () => {
  for (const overrides of [
    { execPath: '' }, { execPath: null }, { execPath: 'bad\0path' },
    { appPath: '' }, { appPath: undefined }, { appPath: 'bad\0path' },
    { isPackaged: 'false' }, { env: null }, { env: [] },
    { spawn: null }, { mkdtemp: null }, { tmpdir: null },
    { tmpdir: () => '' }, { tmpdir: () => 'relative' },
  ]) {
    const runtime = harness(overrides);
    await assert.rejects(launchPrivate(runtime.options), TypeError);
    assert.equal(runtime.prefixes.length, 0);
    assert.equal(runtime.launches.length, 0);
  }
});

test('invalid temporary-directory results reject without spawning', async () => {
  for (const userDataPath of [undefined, '', 'relative', '/bad\0path']) {
    const runtime = harness({ mkdtemp: async () => userDataPath });
    await assert.rejects(launchPrivate(runtime.options), TypeError);
    assert.equal(runtime.launches.length, 0);
  }
});

test('invalid child-process results reject safely', async () => {
  for (const child of [null, {}, { once() {} }, { unref() {} }]) {
    const runtime = harness({ spawn: () => child });
    await assert.rejects(launchPrivate(runtime.options), TypeError);
  }
});
