import { canonicalHttpUrl } from './model.js';

function inertBookmarkHtml(html) {
  return html.replace(/<(script|style|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').replace(/<!--[\s\S]*?-->|<![^>]*>|<\/?([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, (tag, name) => {
    const lower = name?.toLowerCase();
    if (!['a', 'dl', 'dt', 'h3'].includes(lower)) return '';
    if (tag.startsWith('</')) return `</${lower}>`;
    if (lower !== 'a') return `<${lower}>`;
    const match = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(tag);
    const href = match ? match[1] ?? match[2] ?? match[3] : '';
    return `<a href="${href.replace(/"/g, '&quot;')}">`;
  });
}

export function parseBookmarks(html, Parser = globalThis.DOMParser) {
  const document = typeof html === 'string' ? (Parser ? new Parser().parseFromString(inertBookmarkHtml(html), 'text/html') : null) : html;
  if (!document || typeof document.querySelectorAll !== 'function') return [];
  const bookmarks = [];
  for (const anchor of document.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href');
    const canonical = canonicalHttpUrl(href);
    if (!canonical) continue;
    const parsed = new URL(canonical);
    const bookmark = { title: (anchor.textContent || parsed.hostname).trim().slice(0, 80) || parsed.hostname, url: parsed.href };
    const folders = [];
    for (let parent = anchor.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName?.toLowerCase() !== 'dl') continue;
      const sibling = parent.previousElementSibling;
      const heading = sibling?.tagName?.toLowerCase() === 'h3' ? sibling : sibling?.querySelector?.('h3');
      const name = heading?.textContent?.trim().slice(0, 80);
      if (name) folders.unshift(name);
    }
    if (folders.length) bookmark.folder = folders.join(' / ');
    bookmarks.push(bookmark);
    if (bookmarks.length === 500) break;
  }
  return bookmarks;
}
