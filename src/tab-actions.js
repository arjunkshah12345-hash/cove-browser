import { canonicalHttpUrl, HOME } from './model.js';

export function initializePinnedTabs(state) {
  if (!state.tabs.some(tab => tab.pinned && tab.pinnedUrl === undefined)) return state;
  return { ...state, tabs: state.tabs.map(tab => tab.pinned && tab.pinnedUrl === undefined ? { ...tab, pinnedUrl: tab.url } : tab) };
}

export function toggleTabPin(state, id) {
  const target = state.tabs.find(tab => tab.id === id);
  if (!target) return state;
  return { ...state, tabs: state.tabs.map(tab => {
    if (tab.id !== id) return tab;
    const { folderId, pinnedUrl, ...rest } = tab;
    return tab.pinned ? { ...rest, pinned: false } : { ...rest, pinned: true, pinnedUrl: tab.url };
  }) };
}

export function resetPinnedTab(state, id) {
  const target = state.tabs.find(tab => tab.id === id && tab.pinned);
  const url = target?.pinnedUrl === HOME ? HOME : canonicalHttpUrl(target?.pinnedUrl);
  if (!target || !url || target.url === url) return state;
  return { ...state, tabs: state.tabs.map(tab => tab.id === id ? { ...tab, url } : tab) };
}

export function getTabNeighbors(state, id) {
  const target = state.tabs.find(tab => tab.id === id);
  if (!target) return {};
  const group = state.tabs.filter(tab => tab.spaceId === target.spaceId && tab.pinned === target.pinned && (tab.folderId || null) === (target.folderId || null));
  const index = group.findIndex(tab => tab.id === id);
  return { previous: group[index - 1]?.id, next: group[index + 1]?.id };
}

export function shiftTab(state, id, direction) {
  if (!['up', 'down'].includes(direction)) return state;
  const neighbor = getTabNeighbors(state, id)[direction === 'up' ? 'previous' : 'next'];
  if (!neighbor) return state;
  const tabs = [...state.tabs];
  const sourceIndex = tabs.findIndex(tab => tab.id === id);
  const targetIndex = tabs.findIndex(tab => tab.id === neighbor);
  [tabs[sourceIndex], tabs[targetIndex]] = [tabs[targetIndex], tabs[sourceIndex]];
  return { ...state, tabs };
}
