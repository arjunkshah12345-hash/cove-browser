import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SHORTCUTS, HOME } from '../src/model.js';
import { rankPaletteResults } from '../src/palette.js';

const now = 10_000;
const tab = (id, title, extra = {}) => ({ id, title, url: `https://example.com/${id}`, spaceId: 'personal', ...extra });
const state = extra => ({ spaces: [{ id: 'personal', name: 'Personal' }, { id: 'work', name: 'Engineering Work' }], activeSpaceId: 'personal', activeTabId: 'active', tabs: [], shortcuts: [], history: [], ...extra });
const ids = results => results.map(result => result.id);

test('case-insensitive tokens match across title, URL, space and command keywords', () => {
  const workspace = state({ tabs: [tab('docs', 'API Documentation', { spaceId: 'work' })] });
  assert.deepEqual(ids(rankPaletteResults(workspace, 'API engineering EXAMPLE')), ['tab:docs']);
  assert.deepEqual(ids(rankPaletteResults(workspace, 'api missing')), []);
  const commands = [{ id: 'new', title: 'New tab', keywords: ['Create', 'blank page'] }];
  assert.deepEqual(ids(rankPaletteResults(workspace, 'CREATE PAGE', { commands })), ['new']);
  assert.deepEqual(ids(rankPaletteResults(workspace, 'new create', { commands })), ['new']);
});

test('exact titles and title prefixes beat weak matches regardless of source', () => {
  const workspace = state({ tabs: [tab('weak', 'Some page', { url: 'https://example.com/docs' }), tab('substring', 'My docs'), tab('prefix', 'Docs reference')], shortcuts: [{ id: 'exact', title: 'Docs', url: 'https://docs.example.com/' }] });
  assert.deepEqual(ids(rankPaletteResults(workspace, 'docs')), ['favorite:exact', 'tab:prefix', 'tab:substring', 'tab:weak']);
});

test('canonical destinations prefer current-space live tabs over favorites and history', () => {
  const workspace = state({ tabs: [tab('other', 'Docs', { url: 'HTTPS://EXAMPLE.COM:443', spaceId: 'work', lastActiveAt: 9999 }), tab('current', 'Docs', { url: 'https://example.com/' })], shortcuts: [{ id: 'saved', title: 'Docs', url: 'https://example.com/' }], history: [{ ...tab('visit', 'Docs', { url: 'https://example.com/' }), visitedAt: now }] });
  assert.deepEqual(rankPaletteResults(workspace, 'docs', { now }), [{ id: 'tab:current', type: 'tab', title: 'Docs', url: 'https://example.com/', tabId: 'current', spaceId: 'personal' }]);
});

test('favorites outrank duplicate history and the newest history visit survives', () => {
  const visits = [{ ...tab('old', 'Docs', { url: 'https://example.com/' }), visitedAt: 10 }, { ...tab('new', 'Docs', { url: 'https://example.com/' }), visitedAt: 20 }];
  assert.deepEqual(ids(rankPaletteResults(state({ history: visits }), 'docs', { now })), ['history:new']);
  assert.deepEqual(ids(rankPaletteResults(state({ history: visits, shortcuts: [{ id: 'saved', title: 'Docs', url: 'https://example.com/' }] }), 'docs', { now })), ['favorite:saved']);
});

test('cross-space tabs are discoverable and current-space tabs lead equal matches', () => {
  const workspace = state({ tabs: [tab('work', 'Notes', { spaceId: 'work', lastActiveAt: 9000 }), tab('personal', 'Notes')] });
  assert.deepEqual(ids(rankPaletteResults(workspace, 'notes', { now })), ['tab:personal', 'tab:work']);
  assert.equal(rankPaletteResults(workspace, 'engineering')[0].spaceId, 'work');
});

test('empty queries reserve useful commands, prefer active/current/recent tabs and omit history', () => {
  const workspace = state({ tabs: [tab('work', 'Work', { spaceId: 'work', lastActiveAt: 9000 }), tab('older', 'Older', { lastActiveAt: 1 }), tab('recent', 'Recent', { lastActiveAt: 100 }), tab('active', 'Active')], history: [{ ...tab('visit', 'Visit'), visitedAt: 9999 }] });
  assert.deepEqual(ids(rankPaletteResults(workspace, '  ', { now, limit: 4, commands: [{ id: 'new', title: 'New tab' }] })), ['tab:active', 'tab:recent', 'tab:older', 'new']);
});

test('legacy state uses model shortcut and history defaults without writing state', () => {
  const workspace = state();
  delete workspace.shortcuts;
  delete workspace.history;
  const before = structuredClone(workspace);
  assert.equal(rankPaletteResults(workspace, 'github')[0].url, DEFAULT_SHORTCUTS[0].url);
  assert.deepEqual(workspace, before);
  assert.doesNotThrow(() => rankPaletteResults(null, null));
});

test('unsafe destinations never surface, and HOME is only valid for live tabs', () => {
  const unsafe = ['javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,test', 'https://user:pass@example.com/', 'https://user@example.com/', 'https://example.com/\n', 'https://exa mple.com/', 'https://example.com\\evil', '//example.com/', 'https://', 'https://example.com/\ud800'];
  const workspace = state({ tabs: [...unsafe.map((url, index) => tab(`bad${index}`, 'Unsafe', { url })), tab('home', 'Home', { url: HOME })], shortcuts: [...unsafe.map((url, index) => ({ id: `bad${index}`, title: 'Unsafe', url })), { id: 'home', title: 'Home', url: HOME }], history: [...unsafe.map((url, index) => ({ ...tab(`bad${index}`, 'Unsafe', { url }), visitedAt: 1 })), { ...tab('home', 'Home', { url: HOME }), visitedAt: 1 }] });
  assert.deepEqual(rankPaletteResults(workspace, 'unsafe'), []);
  assert.deepEqual(ids(rankPaletteResults(workspace, 'home')), ['tab:home']);
});

test('malformed lists, entries, keywords and timestamps are handled defensively', () => {
  assert.deepEqual(rankPaletteResults(state({ tabs: {}, shortcuts: 'bad', history: 3 }), 'anything', { commands: {} }), []);
  const workspace = state({ tabs: [null, {}, tab('unknown', 'Docs', { spaceId: 'missing' }), tab('valid', 'Docs', { lastActiveAt: Infinity })], history: [{ ...tab('invalid', 'Docs'), visitedAt: NaN }] });
  assert.deepEqual(ids(rankPaletteResults(workspace, 'docs', { commands: [null, {}, { id: 'ok', title: 'Other', keywords: [null, {}, 'docs'] }], now })), ['tab:valid', 'ok']);
});

test('command IDs and descriptions pass through for direct action dispatch', () => {
  const commands = [{ id: 'history', title: 'History', description: 'Browse your recent visits', keywords: ['past'] }];
  assert.deepEqual(rankPaletteResults(state(), 'past', { commands }), [{ id: 'history', type: 'command', title: 'History', description: 'Browse your recent visits' }]);
  const manyCommands = Array.from({ length: 20 }, (_, index) => ({ id: `action${index}`, title: `Action ${index}` }));
  assert.equal(rankPaletteResults(state(), '', { commands: manyCommands }).length, 3);
});

test('ties are deterministic across input order and results contain no ranking internals', () => {
  const tabs = [tab('bravo', 'Notes'), tab('alpha', 'Notes')];
  const forward = rankPaletteResults(state({ tabs }), 'notes', { now });
  assert.deepEqual(forward, rankPaletteResults(state({ tabs: [...tabs].reverse() }), 'notes', { now }));
  assert.deepEqual(ids(forward), ['tab:alpha', 'tab:bravo']);
  assert.deepEqual(Object.keys(forward[0]).sort(), ['id', 'spaceId', 'tabId', 'title', 'type', 'url']);
});

test('limits default, floor, clamp and never exceed the hard cap', () => {
  const workspace = state({ tabs: Array.from({ length: 150 }, (_, index) => tab(`tab${index}`, 'Notes')) });
  for (const [limit, expected] of [[undefined, 12], [NaN, 12], [Infinity, 12], ['2', 12], [-1, 0], [0, 0], [2.9, 2], [1000, 100]]) {
    assert.equal(rankPaletteResults(workspace, 'notes', { limit, now }).length, expected);
  }
});
