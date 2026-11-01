const DAY = 24 * 60 * 60 * 1000;

export function getHistoryRetentionDays(state) {
  return [1, 7, 30, 90].includes(state.historyRetentionDays) ? state.historyRetentionDays : 0;
}

export function applyHistoryRetention(state, { now } = {}) {
  const days = getHistoryRetentionDays(state);
  if (!days || !Number.isFinite(now) || now < 0 || !Array.isArray(state.history)) return state;
  const cutoff = now - days * DAY;
  const history = state.history.filter(entry => entry.visitedAt >= cutoff);
  return history.length === state.history.length ? state : { ...state, history };
}
