function validSplitLayout(state, layout) {
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) return false;
  const { spaceId, primaryId, secondaryId, ratio } = layout;
  return typeof spaceId === 'string' && typeof primaryId === 'string' && typeof secondaryId === 'string'
    && primaryId !== secondaryId && Number.isFinite(ratio) && ratio >= 25 && ratio <= 75
    && state.spaces.some(space => space.id === spaceId)
    && state.tabs.some(tab => tab.id === primaryId && tab.spaceId === spaceId)
    && state.tabs.some(tab => tab.id === secondaryId && tab.spaceId === spaceId);
}

export function getSplitLayout(state, spaceId = state.activeSpaceId) {
  if (!Array.isArray(state.splitLayouts)) return null;
  return state.splitLayouts.find(layout => layout?.spaceId === spaceId && validSplitLayout(state, layout)) ?? null;
}

export function setSplitLayout(state, { spaceId, primaryId, secondaryId, ratio = 50 }) {
  const layout = { spaceId, primaryId, secondaryId, ratio };
  if (!validSplitLayout(state, layout)) return state;
  const layouts = Array.isArray(state.splitLayouts) ? state.splitLayouts : [];
  const matching = layouts.filter(entry => entry?.spaceId === spaceId);
  if (matching.length === 1 && matching[0].primaryId === primaryId
    && matching[0].secondaryId === secondaryId && matching[0].ratio === ratio) return state;
  let replaced = false;
  const splitLayouts = layouts.flatMap(entry => {
    if (entry?.spaceId !== spaceId) return [entry];
    if (replaced) return [];
    replaced = true;
    return [layout];
  });
  if (!replaced) splitLayouts.push(layout);
  return { ...state, splitLayouts };
}

export function clearSplitLayout(state, spaceId = state.activeSpaceId) {
  if (!Array.isArray(state.splitLayouts)) return state;
  const splitLayouts = state.splitLayouts.filter(layout => layout?.spaceId !== spaceId);
  return splitLayouts.length === state.splitLayouts.length ? state : { ...state, splitLayouts };
}

export function pruneSplitLayouts(state) {
  if (state.splitLayouts === undefined) return state;
  if (!Array.isArray(state.splitLayouts)) return { ...state, splitLayouts: [] };
  const seen = new Set();
  const splitLayouts = state.splitLayouts.filter(layout => {
    if (!validSplitLayout(state, layout) || seen.has(layout.spaceId)) return false;
    seen.add(layout.spaceId);
    return true;
  });
  return splitLayouts.length === state.splitLayouts.length ? state : { ...state, splitLayouts };
}

export function swapSplitLayout(state, spaceId = state.activeSpaceId) {
  const layout = getSplitLayout(state, spaceId);
  if (!layout) return state;
  return setSplitLayout(state, {
    spaceId, primaryId: layout.secondaryId, secondaryId: layout.primaryId, ratio: 100 - layout.ratio
  });
}
