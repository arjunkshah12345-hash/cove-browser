export function renameFolder(state, id, name) {
  if (typeof name !== 'string' || !name.trim()) return state;
  const folder = state.folders.find(entry => entry.id === id);
  const trimmedName = name.trim().slice(0, 80);
  if (!folder || folder.name === trimmedName) return state;
  return { ...state, folders: state.folders.map(entry => entry.id === id ? { ...entry, name: trimmedName } : entry) };
}

export function deleteFolder(state, id) {
  if (!state.folders.some(folder => folder.id === id)) return state;
  const detach = tab => {
    if (tab.folderId !== id) return tab;
    const { folderId, ...remaining } = tab;
    return remaining;
  };
  return { ...state, folders: state.folders.filter(folder => folder.id !== id), tabs: state.tabs.map(detach), archive: state.archive.map(detach) };
}
