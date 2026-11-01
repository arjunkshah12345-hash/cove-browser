import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBookmarkExport } from '../src/bookmark-export.js';
import { DEFAULT_SHORTCUTS, HOME, initialState } from '../src/model.js';

const fixture = () => ({
  spaces: [{ id: 'personal', name: 'Personal & home' }, { id: 'work', name: 'Work' }],
  folders: [{ id: 'ideas', spaceId: 'personal', name: 'Ideas' }],
  tabs: [
    { title: 'Home', url: HOME, spaceId: 'personal' },
    { title: 'First', url: 'https://EXAMPLE.com:443', spaceId: 'personal', folderId: 'ideas' },
    { title: 'Duplicate', url: 'https://example.com/', spaceId: 'personal', folderId: 'ideas' },
    { title: 'Unfiled copy', url: 'https://example.com/', spaceId: 'personal' },
    { title: 'Work link', url: 'https://work.example/', spaceId: 'work' }
  ],
  shortcuts: [{ title: 'Favorite copy', url: 'https://example.com/' }],
  history: [{ url: 'https://history-secret.example/' }], archive: [{ url: 'https://archive-secret.example/' }],
  notes: 'note-secret', permissions: 'permission-secret', cookies: 'cookie-secret'
});

test('legacy workspaces export the default favorites displayed by the shell', () => {
  const state = initialState();
  delete state.shortcuts;
  const html = buildBookmarkExport(state);
  for (const favorite of DEFAULT_SHORTCUTS) assert.ok(html.includes(`HREF="${favorite.url}"`));
});

test('exports Netscape HTML, live space/folder groups and separate favorites only', () => {
  const html = buildBookmarkExport(fixture());
  assert.ok(html.startsWith('<!DOCTYPE NETSCAPE-Bookmark-file-1>'));
  for (const text of ['charset=UTF-8', '<H3>Personal &amp; home</H3>', '<H3>Ideas</H3>', '<H3>Favorites</H3>', 'Work link']) assert.ok(html.includes(text));
  for (const excluded of [HOME, 'history-secret', 'archive-secret', 'note-secret', 'permission-secret', 'cookie-secret']) assert.ok(!html.includes(excluded));
});

test('canonical duplicate URLs: first wins per group, distinct group placements remain', () => {
  const state = fixture();
  const before = structuredClone(state);
  const html = buildBookmarkExport(state);
  assert.equal((html.match(/HREF="https:\/\/example.com\/"/g) || []).length, 3);
  assert.ok(!html.includes('Duplicate'));
  assert.equal(buildBookmarkExport(state), html);
  assert.deepEqual(state, before);
});

test('selected space excludes other spaces but keeps global favorites; unknown scope leaks no tabs', () => {
  const html = buildBookmarkExport(fixture(), { spaceId: 'personal' });
  assert.ok(html.includes('Personal &amp; home'));
  assert.ok(html.includes('Favorite copy'));
  assert.ok(!html.includes('Work link'));
  assert.ok(!html.includes('<H3>Work</H3>'));
  const unknown = buildBookmarkExport(fixture(), { spaceId: 'missing' });
  assert.ok(!unknown.includes('First'));
  assert.ok(unknown.includes('Favorite copy'));
});

test('escapes malicious titles, folder and space names, and URL attributes', () => {
  const attack = '<img src=x onerror="alert(1)"> & \'quoted\'';
  const state = { spaces: [{ id: 'space', name: attack }], folders: [{ id: 'folder', spaceId: 'space', name: attack }], tabs: [{ spaceId: 'space', folderId: 'folder', title: attack, url: 'https://example.com/?a=1&b="<tag>' }] };
  const html = buildBookmarkExport(state);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;quoted&#39;'));
  assert.ok(html.includes('a=1&amp;b=%22%3Ctag%3E'));
});

test('empty and malformed entries are safe; unsafe and credential-bearing URLs never export', () => {
  assert.equal((buildBookmarkExport().match(/<A /g) || []).length, 0);
  assert.equal(buildBookmarkExport(null), buildBookmarkExport({}));
  const state = fixture();
  state.tabs = [null, {}, ...['javascript:alert(1)', 'data:text/html,bad', 'file:///tmp/secret', 'https://user:password@example.com/', '//example.com', 'https://', 'https://example.com/\n'].map(url => ({ spaceId: 'personal', url })), { spaceId: 'personal', url: 'http://localhost:8080', title: {} }];
  state.shortcuts = [null, {}, { url: HOME }];
  state.folders.push(null, {});
  state.spaces.push(null, {});
  const html = buildBookmarkExport(state);
  assert.equal((html.match(/<A /g) || []).length, 1);
  assert.ok(html.includes('HREF="http://localhost:8080/">localhost</A>'));
  assert.doesNotThrow(() => buildBookmarkExport({ spaces: {}, tabs: {}, folders: {}, shortcuts: {} }));
});
