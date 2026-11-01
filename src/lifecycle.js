import { canonicalHttpUrl, closeTab, getShortcuts } from './model.js';

const HOUR = 60 * 60 * 1000;
const validTime = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function getAutoArchiveHours(state) {
  return [24, 168, 720].includes(state.autoArchiveHours) ? state.autoArchiveHours : 0;
}

export function touchTab(state, id, now = Date.now()) {
  if (!validTime(now) || !state.tabs.some(tab => tab.id === id && tab.lastActiveAt !== now)) return state;
  return { ...state, tabs: state.tabs.map(tab => tab.id === id ? { ...tab, lastActiveAt: now } : tab) };
}

export function autoArchiveTabs(state, { now, visibleIds = [] } = {}) {
  const hours = getAutoArchiveHours(state);
  if (!hours || !validTime(now)) return { state, archivedIds: [] };
  const visible = new Set(visibleIds);
  visible.add(state.activeTabId);
  const favorites = new Set(getShortcuts(state).map(shortcut => canonicalHttpUrl(shortcut.url)).filter(Boolean));
  const tabs = state.tabs.map(tab => tab.lastActiveAt === undefined || visible.has(tab.id)
    ? tab.lastActiveAt === now ? tab : { ...tab, lastActiveAt: now }
    : tab);
  let next = tabs.some((tab, index) => tab !== state.tabs[index]) ? { ...state, tabs } : state;
  const candidates = tabs.filter(tab => !visible.has(tab.id) && !tab.pinned && !tab.favorite
    && !favorites.has(canonicalHttpUrl(tab.url)) && validTime(tab.lastActiveAt)
    && tab.lastActiveAt <= now && now - tab.lastActiveAt >= hours * HOUR).slice(0, 100);
  const archivedIds = [];
  for (const tab of candidates) {
    const occupied = new Set([...next.tabs, ...next.archive].map(entry => entry.id));
    let archivedId = tab.id;
    let suffix = 1;
    while (next.archive.some(entry => entry.id === archivedId) || (archivedId !== tab.id && occupied.has(archivedId))) {
      archivedId = `${tab.id.slice(0, 65)}-auto-${suffix++}`;
    }
    const closed = closeTab({ ...next, archive: [] }, tab.id);
    const archived = { ...closed.archive[0], id: archivedId, closedAt: now };
    next = { ...closed, archive: [archived, ...next.archive].slice(0, 100) };
    archivedIds.push(tab.id);
  }
  return { state: next, archivedIds };
}

export function restoreAutoArchived(state, batch) {
  const { before, after } = batch ?? {};
  if (!before || !after || before === after) return state;
  const guarded = ['tabs', 'archive', 'spaces', 'folders', 'activeSpaceId', 'activeTabId'];
  if (!guarded.every(key => state[key] === after[key])) return state;
  return { ...state, tabs: before.tabs, archive: before.archive, activeSpaceId: before.activeSpaceId, activeTabId: before.activeTabId };
}
