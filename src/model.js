import { pruneSplitLayouts } from './splits.js';

export const HOME = 'cove://newtab';
export const STORAGE_KEY = 'cove.workspace.v1';
export const uid = () => crypto.randomUUID();
export const SEARCH_ENGINES = Object.freeze([
  Object.freeze({ id: 'duckduckgo', name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' }),
  Object.freeze({ id: 'google', name: 'Google', url: 'https://www.google.com/search?q=' }),
  Object.freeze({ id: 'bing', name: 'Bing', url: 'https://www.bing.com/search?q=' }),
  Object.freeze({ id: 'brave', name: 'Brave Search', url: 'https://search.brave.com/search?q=' })
]);
export const getSearchEngine = state => SEARCH_ENGINES.find(engine => engine.id === state.searchEngine) ?? SEARCH_ENGINES[0];
export const DEFAULT_SHORTCUTS = Object.freeze([
  Object.freeze({ id: 'github', title: 'GitHub', url: 'https://github.com/' }),
  Object.freeze({ id: 'notion', title: 'Notion', url: 'https://www.notion.so/' }),
  Object.freeze({ id: 'figma', title: 'Figma', url: 'https://www.figma.com/' }),
  Object.freeze({ id: 'gmail', title: 'Gmail', url: 'https://mail.google.com/' })
]);

const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
const validTitle = title => typeof title === 'string' && title.length < 1000;
const validTimestamp = timestamp => Number.isFinite(timestamp) && timestamp >= 0;
export function canonicalHttpUrl(value) {
  if (typeof value !== 'string' || value.length > 16000 || !value.isWellFormed() || /[\u0000-\u001f\u007f]/.test(value) || value.split(/[?#]/, 1)[0].includes('\\') || !/^https?:\/\/[^/?#]+/i.test(value)) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.href.length <= 16000 ? url.href : null;
  } catch { return null; }
}
const validHttpUrl = value => typeof value === 'string' && !/\s/.test(value) && canonicalHttpUrl(value) !== null;

export const getHistory = state => state.history ?? [];
export const getShortcuts = state => state.shortcuts ?? DEFAULT_SHORTCUTS;

export function normalizeUrl(input, searchEngine = 'duckduckgo') {
  if (typeof input !== 'string' || !input.isWellFormed()) return null;
  const value = input.trim();
  if (value.length > 16000 || value.split(/[?#]/, 1)[0].includes('\\')) return null;
  if (!value || value === HOME) return HOME;
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^https?:/i.test(value) && !/^[\w.-]+:\d+(\/|$)/.test(value)) return null;
  if (/^https?:\/\//i.test(value)) {
    return canonicalHttpUrl(value);
  }
  if (/^(localhost|[\w-]+(?:\.[\w-]+)+)(:\d+)?([/?#].*)?$/.test(value)) {
    return canonicalHttpUrl(`${value.startsWith('localhost') ? 'http' : 'https'}://${value}`);
  }
  const engine = SEARCH_ENGINES.find(candidate => candidate.id === searchEngine) ?? SEARCH_ENGINES[0];
  return canonicalHttpUrl(`${engine.url}${encodeURIComponent(value)}`);
}

export function domain(url) {
  if (url === HOME) return 'Your little corner of the internet';
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

export function initialState() {
  return {
    version: 1, activeSpaceId: 'personal', activeTabId: 'welcome', theme: 'sage', dark: false, searchEngine: 'duckduckgo',
    spaces: [{ id: 'personal', name: 'Personal', icon: 'sun' }, { id: 'work', name: 'Work', icon: 'briefcase' }, { id: 'studio', name: 'Studio', icon: 'sparkles' }],
    folders: [{ id: 'inspiration', spaceId: 'personal', name: 'Ideas & inspiration' }, { id: 'reading', spaceId: 'personal', name: 'Reading list' }],
    tabs: [
      { id: 'welcome', spaceId: 'personal', title: 'A little space for you', url: HOME, pinned: true },
      { id: 'arena', spaceId: 'personal', title: 'Are.na', url: 'https://www.are.na/', pinned: true, folderId: 'inspiration' },
      { id: 'read', spaceId: 'personal', title: 'The Creative Independent', url: 'https://thecreativeindependent.com/', pinned: true, folderId: 'reading' },
      { id: 'github', spaceId: 'work', title: 'GitHub', url: 'https://github.com/', pinned: true }
    ], archive: [], history: [], shortcuts: DEFAULT_SHORTCUTS.map(shortcut => ({ ...shortcut }))
  };
}

export function isValidState(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.spaces) || !value.spaces.length || value.spaces.length > 30 || !Array.isArray(value.tabs) || value.tabs.length > 500 || !Array.isArray(value.folders) || !Array.isArray(value.archive)) return false;
  if (!value.spaces.every(space => space && validId(space.id)) || !value.tabs.every(tab => tab && validId(tab.id)) || !value.folders.every(folder => folder && validId(folder.id)) || value.folders.length > 200) return false;
  const spaceIds = new Set(value.spaces.map(space => space.id));
  const tabIds = new Set(value.tabs.map(tab => tab.id));
  const folderIds = new Set(value.folders.map(folder => folder.id));
  if (spaceIds.size !== value.spaces.length || tabIds.size !== value.tabs.length || folderIds.size !== value.folders.length) return false;
  const validTab = tab => tab && validId(tab.id) && spaceIds.has(tab.spaceId) && typeof tab.pinned === 'boolean' && (tab.pinnedUrl === undefined || tab.pinnedUrl === HOME || validHttpUrl(tab.pinnedUrl)) && (tab.lastActiveAt === undefined || validTimestamp(tab.lastActiveAt)) && (!tab.folderId || value.folders.some(folder => folder.id === tab.folderId && folder.spaceId === tab.spaceId)) && validTitle(tab.title) && (tab.url === HOME || validHttpUrl(tab.url));
  const validEntries = (entries, limit, validate) => Array.isArray(entries) && entries.length <= limit && entries.every(entry => entry && validId(entry.id) && validate(entry)) && new Set(entries.map(entry => entry.id)).size === entries.length;
  if (value.history !== undefined && !validEntries(value.history, 1000, entry => validHttpUrl(entry.url) && validTitle(entry.title) && spaceIds.has(entry.spaceId) && validTimestamp(entry.visitedAt))) return false;
  if (value.shortcuts !== undefined && !validEntries(value.shortcuts, 12, entry => validHttpUrl(entry.url) && validTitle(entry.title))) return false;
  if (value.searchEngine !== undefined && !SEARCH_ENGINES.some(engine => engine.id === value.searchEngine)) return false;
  if (value.autoArchiveHours !== undefined && ![0, 24, 168, 720].includes(value.autoArchiveHours)) return false;
  if (value.historyRetentionDays !== undefined && ![0, 1, 7, 30, 90].includes(value.historyRetentionDays)) return false;
  if (value.splitLayouts !== undefined) {
    if (!Array.isArray(value.splitLayouts) || value.splitLayouts.length > value.spaces.length) return false;
    const layoutSpaces = new Set();
    for (const layout of value.splitLayouts) {
      if (!layout || !spaceIds.has(layout.spaceId) || layoutSpaces.has(layout.spaceId) || layout.primaryId === layout.secondaryId || !Number.isFinite(layout.ratio) || layout.ratio < 25 || layout.ratio > 75) return false;
      if (![layout.primaryId, layout.secondaryId].every(id => value.tabs.some(tab => tab.id === id && tab.spaceId === layout.spaceId))) return false;
      layoutSpaces.add(layout.spaceId);
    }
  }
  return value.spaces.every(space => validId(space.id) && typeof space.name === 'string' && space.name.length > 0 && space.name.length <= 40)
    && value.tabs.every(validTab) && value.archive.length <= 100 && value.archive.every(tab => validTab(tab) && (tab.closedAt === undefined || validTimestamp(tab.closedAt)))
    && spaceIds.has(value.activeSpaceId) && (value.activeTabId === null || value.tabs.some(tab => tab.id === value.activeTabId && tab.spaceId === value.activeSpaceId))
    && ['sage', 'sand', 'lavender'].includes(value.theme) && typeof value.dark === 'boolean'
    && value.folders.every(folder => validId(folder.id) && spaceIds.has(folder.spaceId) && typeof folder.name === 'string' && folder.name.length <= 80);
}

export function loadState(storage) {
  try { const stored = JSON.parse(storage.getItem(STORAGE_KEY)); return isValidState(stored) ? stored : initialState(); } catch { return initialState(); }
}

export function closeTab(state, id) {
  const target = state.tabs.find(tab => tab.id === id);
  if (!target) return state;
  const tabs = state.tabs.filter(tab => tab.id !== id);
  const remaining = tabs.filter(tab => tab.spaceId === state.activeSpaceId);
  const archived = { ...target, id: state.archive.some(tab => tab.id === id) ? uid() : id, closedAt: Date.now() };
  return pruneSplitLayouts({ ...state, tabs, activeTabId: state.activeTabId === id ? remaining.at(-1)?.id ?? null : state.activeTabId, archive: [archived, ...state.archive].slice(0, 100) });
}

export function restoreTab(state, id = state.archive[0]?.id) {
  const index = state.archive.findIndex(tab => tab.id === id);
  if (index < 0 || state.tabs.length >= 500) return state;
  const archived = state.archive[index];
  if (!state.spaces.some(space => space.id === archived.spaceId)) return state;
  const { closedAt, ...tab } = archived;
  if (state.tabs.some(current => current.id === tab.id)) tab.id = uid();
  if (!state.folders.some(folder => folder.id === tab.folderId && folder.spaceId === tab.spaceId)) delete tab.folderId;
  return { ...state, tabs: [...state.tabs, tab], archive: state.archive.filter((entry, entryIndex) => entryIndex !== index), activeSpaceId: tab.spaceId, activeTabId: tab.id };
}

export function duplicateTab(state, id) {
  const target = state.tabs.find(tab => tab.id === id);
  if (!target || state.tabs.length >= 500) return state;
  const tab = { ...target, id: uid() };
  return { ...state, tabs: [...state.tabs, tab], activeSpaceId: tab.spaceId, activeTabId: tab.id };
}

export function moveTabToSpace(state, tabId, spaceId) {
  const target = state.tabs.find(tab => tab.id === tabId);
  if (!target || target.spaceId === spaceId || !state.spaces.some(space => space.id === spaceId)) return state;
  const { folderId, ...tab } = target;
  const tabs = state.tabs.map(current => current.id === tabId ? { ...tab, spaceId } : current);
  const activeTabId = state.activeTabId === tabId ? tabs.filter(current => current.spaceId === state.activeSpaceId).at(-1)?.id ?? null : state.activeTabId;
  return pruneSplitLayouts({ ...state, tabs, activeTabId });
}

export function renameTab(state, id, title) {
  if (typeof title !== 'string' || !title.trim() || !state.tabs.some(tab => tab.id === id)) return state;
  return { ...state, tabs: state.tabs.map(tab => tab.id === id ? { ...tab, title: title.trim().slice(0, 80) } : tab) };
}

export function renameSpace(state, id, name) {
  if (typeof name !== 'string' || !name.trim() || !state.spaces.some(space => space.id === id)) return state;
  return { ...state, spaces: state.spaces.map(space => space.id === id ? { ...space, name: name.trim().slice(0, 40) } : space) };
}

export function deleteSpace(state, id) {
  if (state.spaces.length <= 1 || !state.spaces.some(space => space.id === id)) return state;
  const spaces = state.spaces.filter(space => space.id !== id);
  const tabs = state.tabs.filter(tab => tab.spaceId !== id);
  const activeSpaceId = state.activeSpaceId === id ? spaces[0].id : state.activeSpaceId;
  const activeTabId = tabs.some(tab => tab.id === state.activeTabId && tab.spaceId === activeSpaceId) ? state.activeTabId : tabs.filter(tab => tab.spaceId === activeSpaceId).at(-1)?.id ?? null;
  const result = { ...state, spaces, tabs, activeSpaceId, activeTabId, archive: state.archive.filter(tab => tab.spaceId !== id), folders: state.folders.filter(folder => folder.spaceId !== id) };
  if (state.history !== undefined) result.history = state.history.filter(entry => entry.spaceId !== id);
  return pruneSplitLayouts(result);
}

export function recordVisit(state, { id = uid(), url, title, spaceId = state.activeSpaceId, visitedAt = Date.now() } = {}) {
  if (!validId(id) || !validHttpUrl(url) || !validTitle(title) || !validTimestamp(visitedAt) || !state.spaces.some(space => space.id === spaceId)) return state;
  const history = getHistory(state);
  if (history[0]?.url === url && history[0]?.spaceId === spaceId) return state;
  const entry = { id: history.some(visit => visit.id === id) ? uid() : id, url, title, spaceId, visitedAt };
  return { ...state, history: [entry, ...history].slice(0, 1000) };
}

export function moveTab(state, sourceId, targetId) {
  if (sourceId === targetId) return state;
  const source = state.tabs.find(tab => tab.id === sourceId);
  const target = state.tabs.find(tab => tab.id === targetId);
  if (!source || !target || source.spaceId !== target.spaceId) return state;
  const tabs = state.tabs.filter(tab => tab.id !== sourceId);
  tabs.splice(tabs.findIndex(tab => tab.id === targetId), 0, { ...source, pinned: target.pinned, folderId: target.folderId });
  return { ...state, tabs };
}
