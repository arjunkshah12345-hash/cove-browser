import test from 'node:test';
import assert from 'node:assert/strict';
import { closeTab, DEFAULT_SHORTCUTS, deleteSpace, duplicateTab, getHistory, getSearchEngine, getShortcuts, HOME, initialState, isValidState, loadState, moveTab, moveTabToSpace, normalizeUrl, recordVisit, renameSpace, renameTab, restoreTab, SEARCH_ENGINES, STORAGE_KEY } from '../src/model.js';

test('history retention validates optional numeric presets and survives loading', () => {
  const state = initialState();
  assert.equal(isValidState(state), true);
  assert.equal(Object.hasOwn(state, 'historyRetentionDays'), false);
  const legacy = { ...state };
  delete legacy.history;
  assert.equal(isValidState(legacy), true);
  assert.deepEqual(loadState({ getItem: () => JSON.stringify(legacy) }), legacy);
  for (const historyRetentionDays of [0, 1, 7, 30, 90]) {
    const configured = { ...state, historyRetentionDays };
    assert.equal(isValidState(configured), true);
    assert.deepEqual(loadState({ getItem: () => JSON.stringify(configured) }), configured);
  }
  for (const historyRetentionDays of [null, false, true, '0', '7', -1, 2, 24, 365, 1.5, Infinity, NaN, [], {}]) {
    assert.equal(isValidState({ ...state, historyRetentionDays }), false);
  }
});

test('search engines use safe fixed endpoints and preserve address navigation', () => {
  for (const engine of SEARCH_ENGINES) {
    assert.equal(normalizeUrl('a & b/# café', engine.id), `${engine.url}a%20%26%20b%2F%23%20caf%C3%A9`);
    assert.equal(normalizeUrl('example.com/path', engine.id), 'https://example.com/path');
    assert.equal(normalizeUrl('javascript:alert(1)', engine.id), null);
    const state = { ...initialState(), searchEngine: engine.id };
    assert.equal(isValidState(state), true);
    assert.equal(getSearchEngine(loadState({ getItem: () => JSON.stringify(state) })).id, engine.id);
  }
  const legacy = initialState();
  delete legacy.searchEngine;
  assert.equal(isValidState(legacy), true);
  assert.equal(getSearchEngine(legacy).id, 'duckduckgo');
  for (const searchEngine of ['constructor', 'https://evil.example/', null, {}]) {
    assert.equal(normalizeUrl('hello world', searchEngine), 'https://duckduckgo.com/?q=hello%20world');
    assert.equal(isValidState({ ...legacy, searchEngine }), false);
  }
});

test('normalizes URLs and searches without accepting executable schemes', () => {
  assert.equal(normalizeUrl('example.com/path'), 'https://example.com/path');
  assert.equal(normalizeUrl('localhost:3000'), 'http://localhost:3000/');
  assert.equal(normalizeUrl('hello world'), 'https://duckduckgo.com/?q=hello%20world');
  assert.equal(normalizeUrl(''), HOME);
  for (const url of ['javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'ftp://example.com', 'https://user:pass@example.com', 'https://']) assert.equal(normalizeUrl(url), null, url);
});

test('navigation with query and fragment backslashes survives saving and loading', () => {
  for (const input of ['https://example.com/?q=a\\b', 'https://example.com/#a\\b', 'example.com/path?q=a\\b#c\\d', 'localhost:3000/?q=a\\b', 'https://example.com/café?q=hello world#界\\end']) {
    const url = normalizeUrl(input);
    assert.equal(url, new URL(input.includes('://') ? input : `${input.startsWith('localhost') ? 'http' : 'https'}://${input}`).href);
    const state = initialState();
    state.dark = true;
    state.tabs[0] = { ...state.tabs[0], url };
    state.shortcuts = [{ id: 'saved', title: 'Saved address', url }];
    const navigated = recordVisit(state, { id: 'visit', url, title: 'Visited address', visitedAt: 100 });
    assert.equal(navigated.history[0]?.url, url);
    for (const snapshot of [navigated, closeTab(navigated, 'welcome')]) {
      const values = new Map();
      const storage = { setItem: (key, value) => values.set(key, value), getItem: key => values.get(key) ?? null };
      storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      assert.ok(isValidState(snapshot), input);
      assert.deepEqual(loadState(storage), snapshot, input);
    }
  }
});

test('rejects raw authority and path backslashes but preserves encoded backslashes', () => {
  const state = initialState();
  for (const url of ['https://example.com\\path', 'https://example.com/a\\b?q=safe', 'https://example.com\\@evil.test/', 'https:\\example.com', 'example.com/a\\b', 'https://example.com/a\\b#fragment']) {
    assert.equal(normalizeUrl(url), null, url);
    assert.equal(isValidState({ ...state, tabs: [{ ...state.tabs[0], url }] }), false, url);
    assert.equal(recordVisit(state, { url, title: 'Rejected' }), state, url);
  }
  const url = 'https://example.com/a%5Cb?q=c%5Cd#e%5Cf';
  assert.equal(normalizeUrl(url), url);
  assert.ok(isValidState({ ...state, tabs: [{ ...state.tabs[0], url }] }));
});

test('bounds canonical URL length after Unicode and search encoding', () => {
  for (const [inputPrefix, hrefPrefix] of [
    ['https://example.com/', 'https://example.com/'],
    ['https://example.com/?q=', 'https://example.com/?q='],
    ['https://example.com/#', 'https://example.com/#'],
    ['example.com/', 'https://example.com/'],
    ['localhost:3000/', 'http://localhost:3000/'],
    ['search ', 'https://duckduckgo.com/?q=search%20']
  ]) {
    const exact = inputPrefix + 'a'.repeat(16000 - hrefPrefix.length);
    const normalized = normalizeUrl(exact);
    assert.equal(normalized?.length, 16000, inputPrefix);
    assert.equal(normalizeUrl(exact + 'a'), null, inputPrefix);
    assert.equal(normalizeUrl(inputPrefix + '界'.repeat(1800)), null, inputPrefix);
    assert.ok(isValidState({ ...initialState(), tabs: [{ ...initialState().tabs[0], url: normalized }] }));
  }
  const prefix = 'https://example.com/';
  const unicode = prefix + 'é'.repeat(2663) + 'aa';
  assert.equal(normalizeUrl(unicode)?.length, 16000);
  assert.equal(normalizeUrl(unicode + 'a'), null);
  const state = initialState();
  const overflow = prefix + '界'.repeat(1800);
  assert.equal(isValidState({ ...state, tabs: [{ ...state.tabs[0], url: overflow }] }), false);
  assert.equal(recordVisit(state, { url: overflow, title: 'Too long' }), state);
});

test('normalization rejects lone surrogates and nonstrings without throwing', () => {
  for (const input of [null, undefined, 42, true, {}, [], Symbol('url'), { trim: () => { throw new Error('Do not coerce'); } }, '\ud800', '\udc00', 'https://example.com/\ud800', 'https://example.com/?q=\udc00', 'query \ud800']) {
    assert.equal(normalizeUrl(input), null);
  }
  assert.equal(normalizeUrl('hello 😀'), 'https://duckduckgo.com/?q=hello%20%F0%9F%98%80');
  assert.equal(normalizeUrl('https://example.com/😀'), 'https://example.com/%F0%9F%98%80');
});

test('default workspace is valid and corrupt storage recovers safely', () => {
  assert.ok(isValidState(initialState()));
  for (const value of ['{', '{}', 'null', '[]', JSON.stringify({ ...initialState(), tabs: null })]) assert.deepEqual(loadState({ getItem: () => value }), initialState());
  const stored = initialState(); stored.dark = true;
  assert.deepEqual(loadState({ getItem: key => key === STORAGE_KEY ? JSON.stringify(stored) : null }), stored);
  assert.deepEqual(loadState({ getItem: () => { throw new Error('Unavailable'); } }), initialState());
});

test('workspace import rejects unsafe URLs, duplicate ids and invalid active tabs', () => {
  const state = initialState();
  assert.equal(isValidState({ ...state, tabs: [...state.tabs, state.tabs[0]] }), false);
  assert.equal(isValidState({ ...state, activeTabId: 'github' }), false);
  assert.equal(isValidState({ ...state, theme: 'bad' }), false);
  assert.equal(isValidState({ ...state, tabs: [{ ...state.tabs[0], url: 'javascript:alert(1)' }] }), false);
  assert.equal(isValidState({ ...state, spaces: [{ id: '../escape', name: 'No' }] }), false);
  assert.equal(isValidState({ ...state, spaces: [null] }), false);
  assert.equal(isValidState({ ...state, tabs: [null] }), false);
  assert.equal(isValidState({ ...state, folders: [null] }), false);
  assert.equal(isValidState({ ...state, folders: [...state.folders, state.folders[0]] }), false);
  assert.equal(isValidState({ ...state, tabs: [{ ...state.tabs[0], folderId: 'missing' }] }), false);
});

test('closing active tabs selects a tab in the same space and archives them', () => {
  const state = initialState();
  const result = closeTab(state, 'welcome');
  assert.equal(result.activeTabId, 'read');
  assert.equal(result.archive[0].id, 'welcome');
  assert.equal(result.tabs.length, state.tabs.length - 1);
  assert.equal(state.tabs.length, 4);
  assert.equal(closeTab(state, 'missing'), state);
  const empty = ['welcome', 'arena', 'read'].reduce(closeTab, state);
  assert.equal(empty.activeTabId, null);
  assert.ok(isValidState(empty));
});

test('dragging a tab moves it into the target group without crossing spaces', () => {
  const state = initialState();
  const result = moveTab(state, 'welcome', 'arena');
  assert.equal(result.tabs.find(tab => tab.id === 'welcome').folderId, 'inspiration');
  assert.equal(result.tabs[0].id, 'welcome');
  assert.equal(moveTab(state, 'welcome', 'github'), state);
});

test('optional collections preserve version one storage and independent defaults', () => {
  const legacy = initialState();
  delete legacy.history;
  delete legacy.shortcuts;
  assert.ok(isValidState(legacy));
  assert.deepEqual(loadState({ getItem: () => JSON.stringify(legacy) }), legacy);
  assert.deepEqual(getHistory(legacy), []);
  assert.deepEqual(getShortcuts(legacy), DEFAULT_SHORTCUTS);
  assert.deepEqual(DEFAULT_SHORTCUTS.map(shortcut => shortcut.title), ['GitHub', 'Notion', 'Figma', 'Gmail']);
  const state = initialState();
  state.shortcuts[0].title = 'Changed';
  assert.equal(initialState().shortcuts[0].title, 'GitHub');
});

test('restore activates the archived space, preserves pins, and removes timestamps', () => {
  const state = closeTab(initialState(), 'github');
  assert.equal(state.archive[0].pinned, true);
  assert.ok(Number.isFinite(state.archive[0].closedAt));
  const result = restoreTab(state);
  assert.equal(result.activeSpaceId, 'work');
  assert.equal(result.activeTabId, 'github');
  assert.equal(result.tabs.at(-1).closedAt, undefined);
  assert.equal(result.tabs.at(-1).pinned, true);
  assert.equal(result.archive.length, 0);
  assert.ok(isValidState(result));
  assert.equal(restoreTab(result), result);
  assert.equal(restoreTab(state, 'missing'), state);
});

test('legacy duplicate archive ids restore one occurrence without duplicate live ids', () => {
  const state = initialState();
  state.archive = [{ ...state.tabs[0] }, { ...state.tabs[0] }];
  assert.ok(isValidState(state));
  const first = restoreTab(state, 'welcome');
  assert.notEqual(first.activeTabId, 'welcome');
  assert.equal(first.archive.length, 1);
  const second = restoreTab(first, 'welcome');
  assert.notEqual(second.activeTabId, first.activeTabId);
  assert.equal(second.archive.length, 0);
  assert.ok(isValidState(second));
  const closed = closeTab(state, 'welcome');
  assert.notEqual(closed.archive[0].id, 'welcome');
  assert.ok(isValidState(closed));
});

test('archive is bounded and restore repairs stale folders, not URLs', () => {
  const state = initialState();
  state.archive = Array.from({ length: 100 }, (_, index) => ({ ...state.tabs[0], id: `archive-${index}` }));
  const closed = closeTab(state, 'arena');
  assert.equal(closed.archive.length, 100);
  closed.folders = closed.folders.filter(folder => folder.id !== 'inspiration');
  const restored = restoreTab(closed);
  assert.equal(restored.tabs.at(-1).folderId, undefined);
  assert.ok(isValidState(restored));
});

test('duplicate and cross-space moves keep active selection valid without mutation', () => {
  const state = initialState();
  const duplicate = duplicateTab(state, 'github');
  assert.equal(duplicate.activeSpaceId, 'work');
  assert.notEqual(duplicate.activeTabId, 'github');
  assert.equal(duplicate.tabs.at(-1).url, state.tabs.at(-1).url);
  assert.ok(isValidState(duplicate));
  const moved = moveTabToSpace(state, 'welcome', 'studio');
  assert.equal(moved.activeSpaceId, 'personal');
  assert.equal(moved.activeTabId, 'read');
  assert.ok(isValidState(moved));
  const folderMove = moveTabToSpace(state, 'arena', 'work');
  assert.equal(folderMove.tabs.find(tab => tab.id === 'arena').folderId, undefined);
  assert.equal(state.tabs.find(tab => tab.id === 'arena').folderId, 'inspiration');
  const lastMove = moveTabToSpace({ ...state, activeSpaceId: 'work', activeTabId: 'github' }, 'github', 'studio');
  assert.equal(lastMove.activeTabId, null);
  assert.ok(isValidState(lastMove));
  assert.equal(moveTabToSpace(state, 'arena', 'missing'), state);
  assert.equal(moveTabToSpace(state, 'arena', 'personal'), state);
  assert.equal(duplicateTab(state, 'missing'), state);
});

test('renames trim and bound labels, rejecting empty or missing targets', () => {
  const state = initialState();
  assert.equal(renameTab(state, 'welcome', '  Hello  ').tabs[0].title, 'Hello');
  assert.equal(renameTab(state, 'welcome', 'x'.repeat(100)).tabs[0].title.length, 80);
  assert.equal(renameSpace(state, 'personal', '  Mine  ').spaces[0].name, 'Mine');
  assert.equal(renameSpace(state, 'personal', 'x'.repeat(100)).spaces[0].name.length, 40);
  for (const value of ['', '   ', null]) {
    assert.equal(renameTab(state, 'welcome', value), state);
    assert.equal(renameSpace(state, 'personal', value), state);
  }
  assert.equal(renameTab(state, 'missing', 'Name'), state);
  assert.equal(renameSpace(state, 'missing', 'Name'), state);
});

test('deleting spaces removes associated records and selects a valid fallback', () => {
  const state = recordVisit(closeTab(initialState(), 'arena'), { url: 'https://example.com/', title: 'Example' });
  const result = deleteSpace(state, 'personal');
  assert.equal(result.activeSpaceId, 'work');
  assert.equal(result.activeTabId, 'github');
  assert.deepEqual(result.archive, []);
  assert.deepEqual(result.folders, []);
  assert.deepEqual(result.history, []);
  assert.ok(isValidState(result));
  const empty = deleteSpace(result, 'work');
  assert.equal(empty.activeSpaceId, 'studio');
  assert.equal(empty.activeTabId, null);
  assert.ok(isValidState(empty));
  assert.equal(deleteSpace(empty, 'studio'), empty);
  assert.equal(deleteSpace(state, 'missing'), state);
  assert.equal(deleteSpace(state, 'studio').activeTabId, state.activeTabId);
});

test('history rejects unsafe entries, dedupes immediate visits, and stays bounded', () => {
  const state = initialState();
  const entry = { id: 'visit', url: 'https://example.com/', title: 'Example', spaceId: 'personal', visitedAt: 100 };
  const first = recordVisit(state, entry);
  assert.deepEqual(first.history, [entry]);
  assert.equal(recordVisit(first, { ...entry, id: 'next' }), first);
  const otherSpace = recordVisit(first, { ...entry, spaceId: 'work' });
  assert.equal(otherSpace.history.length, 2);
  assert.notEqual(otherSpace.history[0].id, 'visit');
  assert.ok(isValidState(otherSpace));
  for (const url of [HOME, 'example.com', 'javascript:alert(1)', 'https://user:pass@example.com/', 'https://', 'https:///example.com', 'https://example.com/a b', 'https://example.com\\path']) assert.equal(recordVisit(state, { ...entry, url }), state);
  assert.equal(recordVisit(state, { ...entry, visitedAt: Infinity }), state);
  assert.equal(recordVisit(state, { ...entry, spaceId: 'missing' }), state);
  const full = { ...state, history: Array.from({ length: 1000 }, (_, index) => ({ ...entry, id: `visit-${index}` })) };
  const bounded = recordVisit(full, { ...entry, url: 'https://different.com/' });
  assert.equal(bounded.history.length, 1000);
  assert.ok(isValidState(bounded));
  assert.deepEqual(state.history, []);
});

test('collection validation rejects oversized, malformed, credentialed, and duplicate records', () => {
  const state = initialState();
  const entry = { id: 'visit', url: 'https://example.com/', title: 'Example', spaceId: 'personal', visitedAt: 100 };
  for (const history of [null, [null], [entry, entry], Array(1001).fill(entry), [{ ...entry, url: 'https://u:p@example.com/' }], [{ ...entry, spaceId: 'missing' }], [{ ...entry, visitedAt: 'today' }]]) assert.equal(isValidState({ ...state, history }), false);
  for (const shortcuts of [null, [null], [DEFAULT_SHORTCUTS[0], DEFAULT_SHORTCUTS[0]], Array(13).fill(DEFAULT_SHORTCUTS[0]), [{ ...DEFAULT_SHORTCUTS[0], url: 'data:text/html,x' }]]) assert.equal(isValidState({ ...state, shortcuts }), false);
  assert.equal(isValidState({ ...state, history: [], shortcuts: [] }), true);
});

test('lifecycle options validate without invalidating legacy workspaces', () => {
  const state = initialState();
  assert.equal(isValidState(state), true);
  for (const autoArchiveHours of [0, 24, 168, 720]) assert.equal(isValidState({ ...state, autoArchiveHours }), true);
  for (const autoArchiveHours of [1, -1, '24', null, Infinity]) assert.equal(isValidState({ ...state, autoArchiveHours }), false);
  for (const lastActiveAt of [0, Date.now()]) assert.equal(isValidState({ ...state, tabs: state.tabs.map(tab => ({ ...tab, lastActiveAt })) }), true);
  for (const lastActiveAt of [-1, NaN, 'today', null]) assert.equal(isValidState({ ...state, tabs: state.tabs.map(tab => ({ ...tab, lastActiveAt })) }), false);
});

test('persisted split layouts validate and tab or space removal cannot leave dangling references', () => {
  const base = initialState();
  const layout = { spaceId: 'personal', primaryId: 'welcome', secondaryId: 'arena', ratio: 60 };
  const state = { ...base, splitLayouts: [layout] };
  assert.equal(isValidState(state), true);
  assert.equal(isValidState({ ...base, splitLayouts: [] }), true);
  for (const splitLayouts of [null, [null], [layout, layout], [{ ...layout, secondaryId: 'welcome' }], [{ ...layout, primaryId: 'github' }], [{ ...layout, ratio: NaN }], [{ ...layout, ratio: 76 }], [{ ...layout, spaceId: 'missing' }]]) {
    assert.equal(isValidState({ ...base, splitLayouts }), false);
  }
  for (const result of [closeTab(state, 'arena'), moveTabToSpace(state, 'arena', 'work'), deleteSpace(state, 'personal')]) {
    assert.deepEqual(result.splitLayouts, []);
    assert.equal(isValidState(result), true);
  }
  assert.deepEqual(closeTab(state, 'github').splitLayouts, [layout]);
});
