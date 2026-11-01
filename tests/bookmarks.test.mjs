import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBookmarks } from '../src/bookmarks.js';
import { initialState, isValidState, loadState, STORAGE_KEY } from '../src/model.js';

const anchor = (href, textContent = '', parentElement = null) => ({ getAttribute: name => name === 'href' ? href : null, textContent, parentElement });
const documentWith = anchors => ({ querySelectorAll: selector => { assert.equal(selector, 'a[href]'); return anchors; } });

test('accepts a document-like tree and imports only credential-free HTTP(S) anchors', () => {
  const document = documentWith([
    anchor('https://example.com?a=1&b=2', '  Example & friends  '), anchor('http://localhost:3000', ''),
    anchor('javascript:alert(1)', 'Bad'), anchor('data:text/html,x'), anchor('file:///tmp/test'),
    anchor('/relative'), anchor('https://user:pass@example.com'), anchor('https://'), anchor(null)
  ]);
  assert.deepEqual(parseBookmarks(document), [
    { title: 'Example & friends', url: 'https://example.com/?a=1&b=2' },
    { title: 'localhost', url: 'http://localhost:3000/' }
  ]);
});

test('parses string inputs through the injected inert HTML parser', () => {
  let received;
  class Parser {
    parseFromString(html, type) {
      received = { html, type };
      return documentWith([anchor('https://example.com/', 'Safe')]);
    }
  }
  const html = '<script>throw new Error("must not execute")</script><a href="https://example.com/">Safe</a>';
  assert.deepEqual(parseBookmarks(html, Parser), [{ title: 'Safe', url: 'https://example.com/' }]);
  assert.deepEqual(received, { html: '<a href="https://example.com/">Safe</a>', type: 'text/html' });
  assert.deepEqual(parseBookmarks(html, null), []);
  assert.deepEqual(parseBookmarks(null), []);
});

test('parser input excludes resource elements, scripts, handlers, and styles', () => {
  let received;
  class Parser {
    parseFromString(html) { received = html; return documentWith([]); }
  }
  parseBookmarks('<!DOCTYPE NETSCAPE-Bookmark-file-1><img src="https://tracking.test/"><link rel="stylesheet" href="https://tracking.test/style"><script src="https://tracking.test/script">evil()</script><DL><DT><H3 style="background:url(https://tracking.test/)">Folder</H3><A HREF=\'https://example.com/?a=1&amp;b=2\' onclick="evil()">Example</A></DL>', Parser);
  assert.equal(received, '<dl><dt><h3>Folder</h3><a href="https://example.com/?a=1&amp;b=2">Example</a></dl>');
});

test('Netscape folder headings yield nested folder paths', () => {
  const outer = { tagName: 'DL', previousElementSibling: { tagName: 'DT', querySelector: () => ({ textContent: ' Work ' }) } };
  const inner = { tagName: 'DL', previousElementSibling: { tagName: 'H3', textContent: 'Design' }, parentElement: outer };
  assert.deepEqual(parseBookmarks(documentWith([anchor('https://figma.com/', 'Figma', inner)])), [{ title: 'Figma', url: 'https://figma.com/', folder: 'Work / Design' }]);
});

test('limits results to 500 entries and titles to 80 characters', () => {
  const result = parseBookmarks(documentWith(Array.from({ length: 600 }, () => anchor('https://example.com/', 'x'.repeat(100)))));
  assert.equal(result.length, 500);
  assert.equal(result[0].title.length, 80);
});

test('bookmark query and fragment backslashes persist without resetting the workspace', () => {
  const urls = ['https://example.com/?q=a\\b', 'https://example.com/#a\\b', 'https://example.com/café?q=hello world#界\\end', 'https://example.com/a%5Cb'];
  const bookmarks = parseBookmarks(documentWith(urls.map(url => anchor(url, 'Saved'))));
  assert.deepEqual(bookmarks.map(bookmark => bookmark.url), urls.map(url => new URL(url).href));
  const state = initialState();
  state.dark = true;
  state.tabs = bookmarks.map((bookmark, index) => ({ ...state.tabs[0], ...bookmark, id: `bookmark-${index}` }));
  state.activeTabId = state.tabs[0].id;
  assert.ok(isValidState(state));
  const values = new Map([[STORAGE_KEY, JSON.stringify(state)]]);
  assert.deepEqual(loadState({ getItem: key => values.get(key) ?? null }), state);
});

test('bookmarks reject raw path or authority backslashes and malformed hrefs', () => {
  const urls = ['https://example.com\\path', 'https://example.com/a\\b?q=safe', 'https://example.com\\@evil.test/', 'https:///example.com', 'https://example.com/\ud800', 'https://example.com/?q=\udc00', 'https://example.com/\npath', undefined, 42, {}];
  assert.deepEqual(parseBookmarks(documentWith(urls.map(url => anchor(url)))), []);
});

test('bookmark limits apply to canonical hrefs including Unicode expansion', () => {
  for (const prefix of ['https://example.com/', 'https://example.com/?q=', 'https://example.com/#']) {
    const exact = prefix + 'a'.repeat(16000 - prefix.length);
    const unicode = prefix + '界'.repeat(1800);
    const bookmarks = parseBookmarks(documentWith([anchor(exact), anchor(exact + 'a'), anchor(unicode)]));
    assert.equal(bookmarks.length, 1);
    assert.equal(bookmarks[0].url, exact);
  }
  const unicode = 'https://example.com/' + 'é'.repeat(2663) + 'aa';
  const bookmarks = parseBookmarks(documentWith([anchor(unicode), anchor(unicode + 'a')]));
  assert.equal(bookmarks.length, 1);
  assert.equal(bookmarks[0].url.length, 16000);
});
