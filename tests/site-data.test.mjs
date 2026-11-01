import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createSiteDataController } = require('../electron/site-data.cjs');
const request = { spaceId: 'space-1', confirmed: true };

function harness(overrides = {}) {
  const calls = [];
  const target = Object.fromEntries(['clearStorageData', 'clearCache', 'clearAuthCache'].map(method => [method, async (...args) => { calls.push([method, ...args]); }]));
  const controller = createSiteDataController({
    canClear: spaceId => { calls.push(['authorize', spaceId]); return true; },
    beforeClear: spaceId => { calls.push(['before', spaceId]); },
    getSession: spaceId => { calls.push(['session', spaceId]); return target; },
    afterClear: (spaceId, result) => { calls.push(['after', spaceId, result]); },
    ...overrides
  });
  return { controller, calls, target };
}

test('requires strict IDs, exact confirmation and no partition overrides before callbacks', async () => {
  const { controller, calls } = harness();
  for (const invalid of [null, undefined, [], {}, 'space-1', { ...request, confirmed: false }, { ...request, confirmed: 'true' }, { ...request, confirmed: 1 }, { ...request, partition: 'default' }, ...['', '../escape', 'persist:cove-a', 'a/b', 'a'.repeat(81), 1, {}].map(spaceId => ({ ...request, spaceId }))]) {
    assert.equal((await controller.clearSpace(invalid)).ok, false);
    assert.equal(controller.isClearing('space-1'), false);
  }
  assert.deepEqual(calls, []);
});

test('destroys guests before obtaining the exact authorized session, clears sequentially, finalizes once', async () => {
  const { controller, calls } = harness();
  assert.deepEqual(await controller.clearSpace(request), { ok: true });
  assert.deepEqual(calls, [['authorize', 'space-1'], ['before', 'space-1'], ['session', 'space-1'], ['clearStorageData'], ['clearCache'], ['clearAuthCache'], ['after', 'space-1', { ok: true }]]);
  assert.equal(controller.isClearing('space-1'), false);
});

test('reserves synchronously and rejects same-space and cross-space concurrent requests', async () => {
  let release;
  const { controller, calls } = harness({ beforeClear: () => new Promise(resolve => { release = resolve; }) });
  const first = controller.clearSpace(request);
  assert.equal(controller.isClearing('space-1'), true);
  assert.equal(controller.isClearing('space-2'), false);
  for (const spaceId of ['space-1', 'space-2']) {
    assert.match((await controller.clearSpace({ spaceId, confirmed: true })).reason, /already in progress/);
  }
  assert.equal(calls.filter(([step]) => step === 'authorize').length, 1);
  release();
  assert.deepEqual(await first, { ok: true });
  const retry = controller.clearSpace(request);
  release();
  assert.deepEqual(await retry, { ok: true });
});

test('denials and throwing authorization never obtain sessions and always release reservations', async () => {
  for (const denial of [false, undefined, { ok: false, reason: 'Unknown space' }, () => { throw new Error('denied'); }]) {
    const { controller, calls } = harness({ canClear: typeof denial === 'function' ? denial : () => denial });
    assert.equal((await controller.clearSpace(request)).ok, false);
    assert.deepEqual(calls, []);
    assert.equal(controller.isClearing('space-1'), false);
  }
});

test('preparation failures and unavailable sessions report failure and finalize without clearing', async () => {
  for (const overrides of [{ beforeClear: () => { throw new Error('guest teardown failed'); } }, { beforeClear: async () => { throw new Error('async teardown failed'); } }, { getSession: () => null }, { getSession: () => { throw new Error('missing session'); } }]) {
    const { controller, calls } = harness(overrides);
    const result = await controller.clearSpace(request);
    assert.equal(result.ok, false);
    assert.equal(result.partial, undefined);
    assert.equal(calls.some(([step]) => step.startsWith('clear')), false);
    assert.equal(calls.at(-1)[0], 'after');
    assert.equal(controller.isClearing('space-1'), false);
  }
});

test('each failed clearing step is honest about partial data and still attempts later steps in order', async () => {
  for (const failure of ['clearStorageData', 'clearCache', 'clearAuthCache']) {
    const { controller, target, calls } = harness();
    target[failure] = () => { calls.push([failure]); throw new Error('private provider details'); };
    const result = await controller.clearSpace(request);
    assert.equal(result.ok, false);
    assert.equal(result.partial, true);
    assert.match(result.reason, new RegExp(failure));
    assert.equal(result.reason.includes('private provider'), false);
    assert.deepEqual(calls.filter(([step]) => step.startsWith('clear')).map(([step]) => step), ['clearStorageData', 'clearCache', 'clearAuthCache']);
    assert.deepEqual(calls.at(-1), ['after', 'space-1', result]);
    assert.equal(controller.isClearing('space-1'), false);
  }
});

test('awaits each clearing promise and retains reservation through asynchronous finalization', async () => {
  const releases = [];
  const { controller, target, calls } = harness({ afterClear: () => new Promise(resolve => releases.push(resolve)) });
  for (const method of ['clearStorageData', 'clearCache', 'clearAuthCache']) target[method] = () => { calls.push([method]); return new Promise(resolve => releases.push(resolve)); };
  const pending = controller.clearSpace(request);
  await Promise.resolve();
  for (const method of ['clearStorageData', 'clearCache', 'clearAuthCache']) {
    assert.equal(calls.at(-1)[0], method);
    assert.equal(releases.length, 1);
    releases.shift()();
    await Promise.resolve();
  }
  assert.equal(controller.isClearing('space-1'), true);
  assert.equal((await controller.clearSpace(request)).ok, false);
  releases.shift()();
  assert.deepEqual(await pending, { ok: true });
  assert.equal(controller.isClearing('space-1'), false);
});

test('finalization failures release busy state and never report success', async () => {
  const { controller } = harness({ afterClear: () => { throw new Error('notification failed'); } });
  assert.deepEqual(await controller.clearSpace(request), { ok: false, partial: true, reason: 'Space reset finalization failed.' });
  assert.equal(controller.isClearing('space-1'), false);
});

test('closes existing authenticated connections after clearing auth and reports connection failures', async () => {
  for (const fail of [false, true]) {
    const { controller, target, calls } = harness();
    target.closeAllConnections = async () => {
      calls.push(['closeAllConnections']);
      if (fail) throw new Error('network teardown failed');
    };
    const result = await controller.clearSpace(request);
    assert.equal(result.ok, !fail);
    assert.equal(calls.at(-2)[0], 'closeAllConnections');
    assert.equal(calls.at(-3)[0], 'clearAuthCache');
    if (fail) assert.equal(result.partial, true);
  }
});
