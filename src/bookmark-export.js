import { canonicalHttpUrl, getShortcuts } from './model.js';

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const list = value => Array.isArray(value) ? value : [];
const name = (value, fallback) => typeof value === 'string' && value.trim() ? value : fallback;

function links(entries) {
  const seen = new Set();
  return entries.flatMap(entry => {
    const url = canonicalHttpUrl(entry?.url);
    if (!url || seen.has(url)) return [];
    seen.add(url);
    return [`<DT><A HREF="${escapeHtml(url)}">${escapeHtml(name(entry.title, new URL(url).hostname))}</A>`];
  }).join('\n');
}

function folder(title, content) {
  return `<DT><H3>${escapeHtml(title)}</H3>\n<DL><p>\n${content}\n</DL><p>`;
}

export function buildBookmarkExport(state = {}, { spaceId } = {}) {
  const spaces = list(state?.spaces).filter(space => space && typeof space.id === 'string' && (!spaceId || space.id === spaceId));
  const tabs = list(state?.tabs);
  const folders = list(state?.folders);
  const content = spaces.map(space => {
    const spaceFolders = folders.filter(item => item && typeof item.id === 'string' && item.spaceId === space.id);
    const folderIds = new Set(spaceFolders.map(item => item.id));
    const spaceTabs = tabs.filter(tab => tab && tab.spaceId === space.id);
    const grouped = spaceFolders.map(item => folder(name(item.name, 'Untitled folder'), links(spaceTabs.filter(tab => tab.folderId === item.id))));
    return folder(name(space.name, 'Untitled space'), [links(spaceTabs.filter(tab => !folderIds.has(tab.folderId))), ...grouped].filter(Boolean).join('\n'));
  });
  content.push(folder('Favorites', links(list(state?.version === 1 ? getShortcuts(state) : state?.shortcuts))));
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Cove bookmarks</TITLE>\n<H1>Cove bookmarks</H1>\n<DL><p>\n${content.join('\n')}\n</DL><p>\n`;
}
