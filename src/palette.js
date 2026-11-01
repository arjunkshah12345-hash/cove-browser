import { canonicalHttpUrl, getHistory, getShortcuts, HOME } from './model.js';

const list = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' && value.isWellFormed() ? value.trim() : '';
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
const compareText = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const priority = { tab: 0, favorite: 1, history: 2, command: 3 };

function matchScore(title, fields, tokens, phrase) {
  if (!tokens.length) return 0;
  if (!tokens.every(token => fields.some(field => field.includes(token)))) return null;
  if (title === phrase) return 0;
  if (title.startsWith(phrase)) return 1;
  if (tokens.every(token => title.split(/\s+/u).some(word => word.startsWith(token)))) return 2;
  if (tokens.every(token => title.includes(token))) return 3;
  return 4;
}

export function rankPaletteResults(state, query, { commands = [], limit = 12, now = Date.now() } = {}) {
  const maximum = typeof limit === 'number' && Number.isFinite(limit) ? Math.min(100, Math.max(0, Math.floor(limit))) : 12;
  if (!maximum) return [];
  const workspace = state && typeof state === 'object' ? state : {};
  const phrase = text(query).toLowerCase().replace(/\s+/gu, ' ');
  const tokens = phrase ? phrase.split(' ') : [];
  const spaces = new Map(list(workspace.spaces).filter(space => space && validId(space.id)).map(space => [space.id, text(space.name)]));
  const clock = Number.isFinite(now) && now >= 0 ? now : 0;
  const timestamp = value => Number.isFinite(value) && value >= 0 ? Math.min(value, clock) : 0;
  const candidates = [];

  function add(entry, type) {
    if (!entry || typeof entry !== 'object' || !validId(entry.id)) return;
    const title = text(entry.title);
    if (!title || title.length >= 1000) return;
    if (type === 'tab' && !spaces.has(entry.spaceId)) return;
    if (type === 'history' && (!spaces.has(entry.spaceId) || !Number.isFinite(entry.visitedAt) || entry.visitedAt < 0)) return;
    const url = type === 'command' ? undefined : type === 'tab' && entry.url === HOME ? HOME : canonicalHttpUrl(entry.url);
    if (type !== 'command' && (!url || /\s/u.test(entry.url))) return;
    const description = text(entry.description);
    const keywords = typeof entry.keywords === 'string' ? entry.keywords : list(entry.keywords).map(text).join(' ');
    const fields = [title, url, spaces.get(entry.spaceId), type === 'command' ? keywords : '', description].map(value => text(value).toLowerCase());
    const score = matchScore(title.toLowerCase(), fields, tokens, phrase);
    if (score === null) return;
    const result = { id: type === 'command' ? entry.id : `${type}:${entry.id}`, type, title };
    if (url) result.url = url;
    if (type === 'tab') result.tabId = entry.id;
    if (spaces.has(entry.spaceId)) result.spaceId = entry.spaceId;
    if (description) result.description = description;
    candidates.push({ result, score, current: entry.spaceId === workspace.activeSpaceId, active: type === 'tab' && entry.id === workspace.activeTabId, recent: timestamp(type === 'history' ? entry.visitedAt : entry.lastActiveAt) });
  }

  for (const tab of list(workspace.tabs)) add(tab, 'tab');
  if (tokens.length) {
    for (const favorite of list(getShortcuts(workspace))) add(favorite, 'favorite');
    for (const visit of list(getHistory(workspace))) add(visit, 'history');
  }
  for (const command of list(commands)) add(command, 'command');

  const stableCompare = (left, right) => compareText(left.result.title.toLowerCase(), right.result.title.toLowerCase())
    || compareText(left.result.id, right.result.id)
    || compareText(left.result.url || '', right.result.url || '')
    || compareText(left.result.spaceId || '', right.result.spaceId || '')
    || compareText(left.result.description || '', right.result.description || '');
  const destinationCompare = (left, right) => priority[left.result.type] - priority[right.result.type]
    || (left.result.type === 'history' ? right.recent - left.recent : Number(right.current) - Number(left.current) || Number(right.active) - Number(left.active) || right.recent - left.recent)
    || left.score - right.score || stableCompare(left, right);
  const destinations = new Map();
  for (const candidate of candidates) {
    const key = candidate.result.type === 'command' ? candidate.result.id : candidate.result.url;
    const existing = destinations.get(key);
    if (!existing || destinationCompare(candidate, existing) < 0) destinations.set(key, candidate);
  }
  const ranked = [...destinations.values()].sort((left, right) => left.score - right.score
    || priority[left.result.type] - priority[right.result.type]
    || Number(right.current) - Number(left.current)
    || Number(right.active) - Number(left.active)
    || right.recent - left.recent
    || stableCompare(left, right));
  if (!tokens.length) {
    const usefulCommands = ranked.filter(candidate => candidate.result.type === 'command').slice(0, Math.min(3, maximum));
    const tabs = ranked.filter(candidate => candidate.result.type === 'tab').slice(0, maximum - usefulCommands.length);
    return [...tabs, ...usefulCommands].map(candidate => candidate.result);
  }
  return ranked.slice(0, maximum).map(candidate => candidate.result);
}
