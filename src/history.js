const DAY = 86_400_000;
const RANGES = { last24h: DAY, last7days: 7 * DAY, last30days: 30 * DAY };

export function filterHistory(entries, { search = '', spaceId, timeRange = 'all', now = Date.now() } = {}) {
  const query = search.trim().toLowerCase();
  const duration = RANGES[timeRange];
  return (Array.isArray(entries) ? entries : [])
    .filter(entry => entry && Number.isFinite(entry.visitedAt) && !Number.isNaN(new Date(entry.visitedAt).getTime())
      && (!spaceId || entry.spaceId === spaceId)
      && (!duration || (entry.visitedAt >= now - duration && entry.visitedAt <= now))
      && `${entry.title || ''} ${entry.url || ''}`.toLowerCase().includes(query))
    .sort((first, second) => second.visitedAt - first.visitedAt);
}

export function groupHistoryByDay(entries) {
  const groups = new Map();
  for (const entry of filterHistory(entries)) {
    const date = new Date(entry.visitedAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (!groups.has(key)) groups.set(key, { key, visitedAt: entry.visitedAt, entries: [] });
    groups.get(key).entries.push(entry);
  }
  return [...groups.values()];
}
