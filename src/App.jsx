import React, { useCallback, useEffect, useRef, useState } from 'react';
import { version } from '../package.json';
import { ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, BriefcaseBusiness, Check, ChevronDown, ChevronRight, CircleHelp, Command, Ellipsis, ExternalLink, Folder, Github, Globe2, History, House, LayoutGrid, LockKeyhole, Moon, PanelLeft, PanelsTopLeft, Pin, Plus, RotateCw, Search, Settings2, Sparkles, Sun, Trash2, X } from 'lucide-react';
import { closeTab, domain, duplicateTab, getSearchEngine, getShortcuts, HOME, initialState, isValidState, moveTab, moveTabToSpace, normalizeUrl, recordVisit, renameTab, restoreTab, SEARCH_ENGINES, uid } from './model.js';
import { BookmarkImportPanel, DownloadsPanel, FavoritesPanel, FindBar, HistoryPanel, SpacePanel } from './WorkspaceTools.jsx';
import { SiteControls } from './SiteControls.jsx';
import { FolderControls } from './FolderControls.jsx';
import LifecycleSettings from './LifecycleSettings.jsx';
import RetentionSettings from './RetentionSettings.jsx';
import ResourceSettings from './ResourceSettings.jsx';
import { applyHistoryRetention } from './retention.js';
import { autoArchiveTabs, touchTab } from './lifecycle.js';
import { loadWorkspace, recoverWorkspace, saveWorkspace } from './persistence.js';
import { getTabNeighbors, initializePinnedTabs, resetPinnedTab, shiftTab, toggleTabPin } from './tab-actions.js';
import { rankPaletteResults } from './palette.js';
import { clearSplitLayout, getSplitLayout, pruneSplitLayouts, setSplitLayout, swapSplitLayout } from './splits.js';
import './workspace-tools.css';

const desktop = Boolean(window.cove);
const privateBrowsing = window.cove?.isPrivate === true;
let privateNote = '';
const mountainImage = new URL('../public/quiet-mountains.jpg', import.meta.url).href;
const spaceIcons = { sun: Sun, briefcase: BriefcaseBusiness, sparkles: Sparkles };
const shortcuts = [
  { name: 'GitHub', url: 'https://github.com/', icon: 'github', color: 'ink' },
  { name: 'Notion', url: 'https://www.notion.so/', icon: 'N', color: 'cream' },
  { name: 'Figma', url: 'https://www.figma.com/', icon: 'figma', color: 'rose' },
  { name: 'Gmail', url: 'https://mail.google.com/', icon: 'mail', color: 'blue' }
];

function CoveMark({ size = 26 }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M6 25V14a10 10 0 0 1 20 0v11M12 25V14a4 4 0 0 1 8 0v11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>;
}

function SiteIcon({ url, title, size = 17 }) {
  if (url === HOME) return <CoveMark size={size} />;
  if (url.includes('github.com')) return <Github size={size} />;
  if (url.includes('are.na')) return <span className="arena-icon">✳</span>;
  return <span className="site-letter" style={{ fontSize: size - 5 }}>{(title || domain(url))[0]?.toUpperCase()}</span>;
}

function QuickIcon({ item }) {
  if (item.icon === 'github') return <Github size={22} />;
  if (item.icon === 'figma') return <svg width="18" height="25" viewBox="0 0 18 27" aria-hidden="true"><path d="M4.5 0a4.5 4.5 0 0 0 0 9H9V0" fill="#f16954"/><path d="M9 0h4.5a4.5 4.5 0 0 1 0 9H9" fill="#f79e92"/><path d="M4.5 9a4.5 4.5 0 0 0 0 9H9V9" fill="#a879de"/><circle cx="13.5" cy="13.5" r="4.5" fill="#61b8d1"/><path d="M0 22.5A4.5 4.5 0 0 1 4.5 18H9v4.5a4.5 4.5 0 0 1-9 0" fill="#6ab899"/></svg>;
  if (item.icon === 'mail') return <svg width="25" height="20" viewBox="0 0 25 20" fill="none" aria-hidden="true"><path d="M3 17V4l9.5 7L22 4v13" stroke="#dd6a59" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/><path d="M3 17V4" stroke="#7d9fc8" strokeWidth="4" strokeLinecap="round"/><path d="M22 4v13" stroke="#79ad88" strokeWidth="4" strokeLinecap="round"/></svg>;
  if (item.icon === 'N') return <span className="notion-icon">N</span>;
  return <Globe2 size={21}/>;
}

function IconButton({ label, children, className = '', ...props }) {
  return <button className={`icon-button ${className}`} title={label} aria-label={label} {...props}>{children}</button>;
}

export default function App() {
  const [loaded] = useState(() => {
    if (privateBrowsing) return { state: initialState(), recovery: { protected: false } };
    try { return loadWorkspace(window.localStorage); } catch { return loadWorkspace(null); }
  });
  const [state, setWorkspace] = useState(() => initializePinnedTabs(loaded.recovery.protected ? loaded.state : applyHistoryRetention(loaded.state, { now: Date.now() })));
  const setState = useCallback(update => setWorkspace(previous => {
    let next = pruneSplitLayouts(typeof update === 'function' ? update(previous) : update);
    const layout = getSplitLayout(next);
    if (layout && next.activeTabId && ![layout.primaryId, layout.secondaryId].includes(next.activeTabId)) {
      next = setSplitLayout(next, { ...layout, primaryId: next.activeTabId });
    }
    return next;
  }), []);
  const [recovery, setRecovery] = useState(loaded.recovery);
  const [modal, setModal] = useState(null);
  const [query, setQuery] = useState('');
  const [commandIndex, setCommandIndex] = useState(0);
  const [sidebar, setSidebar] = useState(true);
  const [focusedPaneId, setFocusedPaneId] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [menu, setMenu] = useState(null);
  const [toast, setToast] = useState('');
  const [name, setName] = useState('');
  const [folderTarget, setFolderTarget] = useState(null);
  const [tabStatus, setTabStatus] = useState({});
  const [storageError, setStorageError] = useState(false);
  const [downloads, setDownloads] = useState([]);
  const [findOpen, setFindOpen] = useState(false);
  const [findResult, setFindResult] = useState(null);
  const [renameId, setRenameId] = useState(null);
  const [importCandidate, setImportCandidate] = useState(null);
  const [archiveQuery, setArchiveQuery] = useState('');
  const [resizing, setResizing] = useState(false);
  const [engineRevision, setEngineRevision] = useState(0);
  const commandInput = useRef(null);
  const paneRefs = useRef({});
  const rootRef = useRef(null);
  const importRef = useRef(null);
  const live = useRef({});
  const activeSpace = state.spaces.find(space => space.id === state.activeSpaceId);
  const tabs = state.tabs.filter(tab => tab.spaceId === state.activeSpaceId);
  const splitLayout = getSplitLayout(state);
  const selectedTab = tabs.find(tab => tab.id === state.activeTabId);
  const activeTab = splitLayout ? tabs.find(tab => tab.id === splitLayout.primaryId) : selectedTab;
  const splitId = splitLayout?.secondaryId;
  const splitRatio = splitLayout?.ratio ?? 50;
  const splitTab = tabs.find(tab => tab.id === splitId);
  const focusedTab = [activeTab, splitTab].find(tab => tab && tab.id === focusedPaneId) || selectedTab || activeTab;
  const setSplitId = id => setState(previous => {
    if (!id) return clearSplitLayout(previous);
    const layout = getSplitLayout(previous);
    const primaryId = layout?.primaryId ?? previous.activeTabId;
    return id === primaryId ? previous : setSplitLayout(previous, { spaceId: previous.activeSpaceId, primaryId, secondaryId: id, ratio: layout?.ratio ?? 50 });
  });
  const setSplitRatio = update => setState(previous => {
    const layout = getSplitLayout(previous);
    return layout ? setSplitLayout(previous, { ...layout, ratio: typeof update === 'function' ? update(layout.ratio) : update }) : previous;
  });
  const folders = state.folders.filter(folder => folder.spaceId === state.activeSpaceId);
  const currentStatus = tabStatus[focusedTab?.id] || {};
  const notify = useCallback(message => setToast(message), []);
  const refreshEngine = useCallback(() => setEngineRevision(previous => previous + 1), []);
  const favorites = getShortcuts(state).map(item => ({ ...(shortcuts.find(shortcut => shortcut.url === item.url) || {}), ...item, name: item.title }));
  const archiveMatches = state.archive.filter(tab => `${tab.title} ${tab.url}`.toLowerCase().includes(archiveQuery.toLowerCase()));

  useEffect(() => {
    if (privateBrowsing || recovery.protected) return;
    try {
      const result = saveWorkspace(window.localStorage, state);
      setStorageError(!result.ok);
      if (result.recovery?.protected) setRecovery(result.recovery);
    } catch { setStorageError(true); }
  }, [state, recovery.protected]);
  const recover = source => {
    if (privateBrowsing) return;
    try {
      const result = recoverWorkspace(window.localStorage, source);
      if (!result.ok) { notify('Recovery could not be saved. Your original data is unchanged. Export your current workspace before retrying.'); return; }
      setState(initializePinnedTabs(result.state)); setRecovery({ protected: false }); setStorageError(false); setFocusedPaneId(null); setModal(null);
      notify('Workspace recovered. Your previous saved data is preserved.');
    } catch { notify('Local storage is unavailable. Export your workspace to keep a copy.'); }
  };
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 4000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (modal === 'command') { commandInput.current?.focus(); setCommandIndex(0); } }, [modal, query]);
  useEffect(() => {
    if (!modal) return;
    const previousFocus = document.activeElement;
    const frame = requestAnimationFrame(() => document.querySelector('[role="dialog"] input:not([hidden]), [role="dialog"] button')?.focus());
    return () => { cancelAnimationFrame(frame); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [modal]);
  useEffect(() => {
    if (!menu) return;
    const dismiss = event => { if (!event.target.closest('.tab-context, .tab-action')) setMenu(null); };
    window.addEventListener('pointerdown', dismiss);
    return () => window.removeEventListener('pointerdown', dismiss);
  }, [menu]);
  useEffect(() => { document.title = `${focusedTab?.title || 'New tab'} — Cove${privateBrowsing ? ' Private' : ''}`; }, [focusedTab?.title]);
  useEffect(() => { setFocusedPaneId(state.activeTabId); }, [state.activeTabId, state.activeSpaceId]);
  useEffect(() => {
    setFindOpen(previous => previous === focusedTab?.id ? previous : false); setFindResult(null);
    return () => { if (focusedTab?.id) window.cove?.stopFind(focusedTab.id).catch(() => {}); };
  }, [focusedTab?.id]);
  useEffect(() => { window.cove?.getDownloads().then(setDownloads).catch(() => {}); }, []);
  useEffect(() => {
    if (focusedTab?.id) setState(previous => touchTab(previous, focusedTab.id));
  }, [focusedTab?.id]);
  useEffect(() => {
    const visibleIds = [activeTab?.id, splitTab?.id].filter(Boolean);
    const refreshActivity = () => {
      const now = Date.now();
      setState(previous => visibleIds.reduce((next, id) => touchTab(next, id, now), previous));
    };
    refreshActivity();
    const timer = setInterval(refreshActivity, 60000);
    return () => { clearInterval(timer); refreshActivity(); };
  }, [activeTab?.id, splitTab?.id]);
  useEffect(() => {
    if (!state.autoArchiveHours) return;
    const sweep = () => setState(previous => autoArchiveTabs(previous, { now: Date.now(), visibleIds: [activeTab?.id, splitTab?.id].filter(Boolean) }).state);
    sweep();
    const timer = setInterval(sweep, 60000);
    return () => clearInterval(timer);
  }, [state.autoArchiveHours, activeTab?.id, splitTab?.id]);
  useEffect(() => {
    if (recovery.protected || !state.historyRetentionDays) return;
    const sweep = () => setState(previous => applyHistoryRetention(previous, { now: Date.now() }));
    sweep();
    const timer = setInterval(sweep, 60000);
    return () => clearInterval(timer);
  }, [state.historyRetentionDays, recovery.protected, setState]);

  const openCommand = (folderId = null) => { setMenu(null); setFolderTarget(folderId); setQuery(''); setModal('command'); };
  const addTab = (url = HOME, title, folderId = folderTarget, spaceId = state.activeSpaceId) => {
    if (state.tabs.length >= 500) { notify('This workspace is full. Archive a few tabs first.'); return null; }
    const id = uid();
    setState(previous => {
      if (previous.tabs.length >= 500 || !previous.spaces.some(space => space.id === spaceId)) return previous;
      const targetFolder = previous.folders.find(folder => folder.id === folderId && folder.spaceId === spaceId);
      return { ...previous, activeTabId: spaceId === previous.activeSpaceId ? id : previous.activeTabId, tabs: [...previous.tabs, { id, spaceId, title: title || (url === HOME ? 'A little space for you' : domain(url)), url, pinned: Boolean(targetFolder), ...(targetFolder ? { folderId: targetFolder.id } : {}) }] };
    });
    setModal(null); setQuery(''); setFolderTarget(null);
    if (spaceId === state.activeSpaceId) setFocusedPaneId(id);
    return id;
  };
  const navigate = input => {
    const url = normalizeUrl(input, getSearchEngine(state).id);
    if (!url) { notify('For your safety, only web addresses are supported.'); return; }
    if (modal === 'address' && focusedTab) {
      setState(previous => ({ ...previous, tabs: previous.tabs.map(tab => tab.id === focusedTab.id ? { ...tab, url, title: url === HOME ? 'A little space for you' : domain(url) } : tab) }));
      window.cove?.navigate({ tabId: focusedTab.id, url }).catch(() => notify('Could not navigate to this address.'));
      setModal(null);
    } else addTab(url);
  };
  const selectTab = id => { setFocusedPaneId(id); setState(previous => ({ ...previous, activeTabId: id })); setModal(null); setMenu(null); };
  const switchSpace = id => {
    setState(previous => ({ ...previous, activeSpaceId: id, activeTabId: getSplitLayout(previous, id)?.primaryId ?? previous.tabs.find(tab => tab.spaceId === id)?.id ?? null }));
    setFocusedPaneId(null); setMenu(null);
  };
  const removeTab = id => { setState(previous => closeTab(previous, id)); setMenu(null); };
  const togglePin = id => { setState(previous => toggleTabPin(previous, id)); setMenu(null); };
  const restore = id => {
    setState(previous => initializePinnedTabs(restoreTab(previous, id)));
    setModal(null); setFocusedPaneId(null);
  };
  const toggleSplit = () => {
    if (splitId) { setSplitId(null); return; }
    if (!activeTab) { notify('Open a tab before starting split view.'); return; }
    const other = tabs.find(tab => tab.id !== activeTab.id);
    if (other) setSplitId(other.id);
    else {
      if (state.tabs.length >= 500) { notify('This workspace is full. Archive a few tabs before adding a split.'); return; }
      const id = uid();
      setState(previous => {
        if (previous.tabs.length >= 500 || !previous.tabs.some(tab => tab.id === previous.activeTabId && tab.spaceId === previous.activeSpaceId)) return previous;
        const next = { ...previous, tabs: [...previous.tabs, { id, spaceId: previous.activeSpaceId, title: 'A little space for you', url: HOME, pinned: false }] };
        return setSplitLayout(next, { spaceId: previous.activeSpaceId, primaryId: previous.activeTabId, secondaryId: id, ratio: 50 });
      });
    }
  };
  const closeFind = () => { setFindOpen(false); setFindResult(null); if (focusedTab) window.cove?.stopFind(focusedTab.id).catch(() => {}); };
  const runCommand = (command, targetId = focusedTab?.id) => {
    const targetTab = [activeTab, splitTab].find(tab => tab && tab.id === targetId) || focusedTab;
    if (['settings', 'archive', 'favorites', 'import-bookmarks', 'folders', 'space-options', 'help', 'site-permissions'].includes(command)) { setMenu(null); setModal(command); return; }
    if (command === 'new-space' || command === 'new-folder') { setName(''); setModal(command === 'new-space' ? 'space' : 'folder'); return; }
    if (command === 'sidebar') { setSidebar(previous => !previous); setModal(null); return; }
    if (command === 'split') { toggleSplit(); setModal(null); return; }
    if (command === 'swap-panes') { setState(previous => swapSplitLayout(previous)); setModal(null); return; }
    if (['print', 'save-pdf', 'devtools'].includes(command)) {
      if (!desktop || !targetTab || targetTab.url === HOME) { notify('Open a desktop web page to use page tools.'); return; }
      const method = { print: 'printPage', 'save-pdf': 'savePdf', devtools: 'openDevTools' }[command];
      setModal(null); setMenu(null);
      window.cove[method](targetTab.id).catch(() => notify('Could not complete this page action.'));
      return;
    }
    if (command === 'private-window') { window.cove?.openPrivateWindow().then(() => notify('Opening a separate private window.')).catch(() => notify('Could not open a private window.')); }
    if (command === 'restore-tab') { if (!state.archive.length) notify('No closed tabs to restore.'); else restore(); }
    if (command === 'history' || command === 'downloads') { setMenu(null); setModal(command); }
    if (command === 'find') { if (desktop && targetTab?.url !== HOME && targetTab) { setModal(null); setFindOpen(targetTab.id); } else notify('Find in page is available on desktop web pages.'); }
    if (command === 'next-tab' || command === 'previous-tab') {
      if (tabs.length) { const index = tabs.findIndex(tab => tab.id === targetTab?.id); selectTab(tabs[(index + (command === 'next-tab' ? 1 : -1) + tabs.length) % tabs.length].id); }
    }
    if (command === 'reload' && targetTab?.url !== HOME && targetTab) window.cove?.reload(targetTab.id).catch(() => notify('Could not reload this page.'));
    if (['stop', 'hard-reload'].includes(command) && targetTab?.url !== HOME && targetTab) {
      const method = command === 'stop' ? 'stop' : 'hardReload';
      window.cove?.[method](targetTab.id).catch(() => notify('Could not update this page.'));
    }
    if (command.startsWith('zoom-') && targetTab?.url !== HOME && targetTab) {
      const factor = command === 'zoom-reset' ? 1 : Math.max(.5, Math.min(2, (tabStatus[targetTab.id]?.zoom || 1) + (command === 'zoom-in' ? .1 : -.1)));
      window.cove?.setZoom({ tabId: targetTab.id, factor }).catch(() => notify('Could not change page zoom.'));
    }
  };
  live.current = { addTab, openCommand, removeTab, activeTab: focusedTab, visibleIds: [activeTab?.id, splitTab?.id], toggleSplit, setSidebar, setModal, setQuery, restore, state, runCommand, closeFind };

  useEffect(() => {
    const handler = event => {
      if (event.key === 'Escape') { setModal(null); setMenu(null); live.current.closeFind(); return; }
      if (event.ctrlKey && event.key === 'Tab') { event.preventDefault(); live.current.runCommand(event.shiftKey ? 'previous-tab' : 'next-tab'); return; }
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      const command = key === 'p' ? 'print' : key === 'i' && event.altKey ? 'devtools' : key === 'n' && event.shiftKey ? 'private-window' : key === 't' && event.shiftKey ? 'restore-tab' : key === 'f' ? 'find' : key === 'y' ? 'history' : key === 'j' ? 'downloads' : key === 'r' ? event.shiftKey ? 'hard-reload' : 'reload' : ['=', '+'].includes(key) ? 'zoom-in' : key === '-' ? 'zoom-out' : key === '0' ? 'zoom-reset' : null;
      if (command) { event.preventDefault(); live.current.runCommand(command); return; }
      if (!['t', 'k', 'l', 'w', ',', 's', 'd'].includes(key)) return;
      if (['s', 'd'].includes(key) && !event.shiftKey) return;
      event.preventDefault();
      const current = live.current;
      if (key === 't' || key === 'k') current.openCommand();
      if (key === 'l') { setQuery(current.activeTab?.url === HOME ? '' : current.activeTab?.url || ''); setModal('address'); }
      if (key === 'w' && current.activeTab) current.removeTab(current.activeTab.id);
      if (key === ',') setModal('settings');
      if (key === 's') setSidebar(value => !value);
      if (key === 'd') current.toggleSplit();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => window.cove?.onTabUpdate(update => {
    if (update.type === 'space-data-cleared') { refreshEngine(); return; }
    if (update.type === 'focus-tab') { if (live.current.visibleIds.includes(update.id)) setFocusedPaneId(update.id); return; }
    if (update.type === 'new-tab') { const url = normalizeUrl(update.url); if (url) live.current.addTab(url, undefined, null, update.spaceId); return; }
    if (update.type === 'downloads') { setDownloads(update.downloads); return; }
    if (update.type === 'find-result') { if (update.id === live.current.activeTab?.id) setFindResult(update); return; }
    if (update.type === 'navigation') {
      if (privateBrowsing) return;
      setState(previous => recordVisit(previous, { url: update.url, title: update.title || domain(update.url), spaceId: update.spaceId, visitedAt: update.visitedAt }));
      return;
    }
    if (update.type === 'shortcut') {
      const current = live.current;
      const targetTab = current.visibleIds.includes(update.id) ? current.state.tabs.find(tab => tab.id === update.id) : current.activeTab;
      if (targetTab) setFocusedPaneId(targetTab.id);
      if (update.command === 'new-tab' || update.command === 'command') current.openCommand();
      if (update.command === 'address') { setQuery(targetTab?.url === HOME ? '' : targetTab?.url || ''); setModal('address'); }
      if (update.command === 'close-tab' && targetTab) current.removeTab(targetTab.id);
      current.runCommand(update.command, targetTab?.id);
      return;
    }
    setTabStatus(previous => ({ ...previous, [update.id]: { ...previous[update.id], ...update } }));
    if (update.title || update.url) setState(previous => {
      const tab = previous.tabs.find(item => item.id === update.id);
      return { ...previous, tabs: previous.tabs.map(item => item.id === update.id ? { ...item, ...(update.title && !item.customTitle ? { title: update.title.slice(0, 999) } : {}), ...(update.url && normalizeUrl(update.url) ? { url: update.url } : {}) } : item), ...(update.title && tab ? { history: (previous.history || []).map((entry, index) => index === 0 && entry.url === (update.url || tab.url) && entry.spaceId === tab.spaceId ? { ...entry, title: update.title.slice(0, 999) } : entry) } : {}) };
    });
  }), []);

  useEffect(() => {
    if (!desktop) return;
    let disposed = false;
    const updateLayout = async () => {
      try {
        await window.cove.syncTabs(state.tabs);
        if (disposed) return;
        const panes = [activeTab, splitTab].filter(tab => tab && tab.url !== HOME).map(tab => {
          const bounds = paneRefs.current[tab.id]?.getBoundingClientRect();
          return bounds ? { tabId: tab.id, x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) } : null;
        }).filter(Boolean);
        await window.cove.setLayout({ panes, hidden: Boolean(modal || menu || resizing) });
      } catch { if (!disposed) notify('The browsing engine could not update. Try reopening this tab.'); }
    };
    updateLayout();
    const observer = new ResizeObserver(updateLayout);
    if (rootRef.current) observer.observe(rootRef.current);
    for (const pane of Object.values(paneRefs.current)) if (pane?.isConnected) observer.observe(pane);
    window.addEventListener('resize', updateLayout);
    return () => { disposed = true; observer.disconnect(); window.removeEventListener('resize', updateLayout); };
  }, [state.tabs, activeTab?.id, splitTab?.id, sidebar, modal, menu, notify, findOpen, splitRatio, resizing, engineRevision]);

  const pageActions = desktop && focusedTab && focusedTab.url !== HOME ? [
    { command: 'print', title: 'Print page', subtitle: 'Print the focused page · ⌘ P' },
    { command: 'save-pdf', title: 'Save page as PDF', subtitle: 'Choose where to save a PDF' },
    { command: 'devtools', title: 'Page developer tools', subtitle: 'Inspect the focused page' },
    { command: 'find', title: 'Find in page', subtitle: 'Search the focused page · ⌘ F' },
    { command: 'reload', title: 'Reload page', subtitle: 'Refresh the focused page · ⌘ R' },
    { command: 'hard-reload', title: 'Hard reload page', subtitle: 'Bypass the cache · ⌘ ⇧ R' },
    { command: 'zoom-in', title: 'Zoom in', subtitle: 'Make the focused page larger' },
    { command: 'zoom-out', title: 'Zoom out', subtitle: 'Make the focused page smaller' },
    { command: 'zoom-reset', title: 'Reset page zoom', subtitle: 'Return to 100%' },
    { command: 'site-permissions', title: 'Site permissions', subtitle: 'Review access for the focused site' }
  ] : [];
  const actions = [
    { command: 'history', title: 'Browsing history', subtitle: 'Find your way back · ⌘ Y' },
    { command: 'restore-tab', title: 'Reopen closed tab', subtitle: 'Bring back your last tab · ⌘ ⇧ T' },
    { command: 'downloads', title: 'Downloads', subtitle: 'Files you’ve saved · ⌘ J' },
    { command: 'settings', title: 'Browser settings', subtitle: 'Search engine, appearance, and workspace data' },
    { command: 'archive', title: 'Tab archive', subtitle: 'Search and restore closed tabs' },
    { command: 'favorites', title: 'Manage favorites', subtitle: 'Make the sidebar yours' },
    { command: 'import-bookmarks', title: 'Import bookmarks', subtitle: 'Bring links from another browser' },
    { command: 'folders', title: 'Manage folders', subtitle: 'Rename or remove folders' },
    { command: 'space-options', title: 'Manage current space', subtitle: 'Rename or remove this space' },
    { command: 'new-space', title: 'Create new space', subtitle: 'A separate home for another part of your day' },
    { command: 'new-folder', title: 'Create new folder', subtitle: 'Keep related tabs together' },
    { command: 'sidebar', title: 'Toggle sidebar', subtitle: 'More room for your page · ⌘ ⇧ S' },
    { command: 'split', title: splitId ? 'Exit split view' : 'Start split view', subtitle: 'Two pages, side by side · ⌘ ⇧ D' },
    { command: 'help', title: 'Keyboard shortcuts and about', subtitle: 'Find your flow in Cove' },
    ...(splitId ? [{ command: 'swap-panes', title: 'Swap split panes', subtitle: 'Exchange left and right pages' }] : []),
    ...(desktop ? [{ command: 'private-window', title: 'New private window', subtitle: 'A separate, temporary session · ⌘ ⇧ N' }] : []),
    ...pageActions
  ];
  const rankedOptions = rankPaletteResults(state, query, { commands: actions.map(action => ({ id: action.command, title: action.title, description: action.subtitle, keywords: action.command.replaceAll('-', ' ') })) });
  const navigationOption = { id: 'navigate', type: 'navigate', title: query.trim() || 'New tab', subtitle: query.trim() ? `Open address or search with ${getSearchEngine(state).name}` : 'A fresh start, a little breathing room' };
  const rankedCommands = rankedOptions.map(option => ({ ...option, subtitle: option.description || `${option.type === 'tab' ? 'Switch to tab' : option.type === 'favorite' ? 'Favorite' : 'History'} · ${option.spaceId ? state.spaces.find(space => space.id === option.spaceId)?.name : domain(option.url || '')}` }));
  const commandOptions = modal === 'address' ? [navigationOption] : query.trim() ? [...rankedCommands, navigationOption] : [navigationOption, ...rankedCommands];
  const selectedCommandIndex = Math.min(commandIndex, commandOptions.length - 1);
  useEffect(() => {
    if (modal === 'command') document.getElementById(`palette-result-${selectedCommandIndex}`)?.scrollIntoView({ block: 'nearest' });
  }, [modal, selectedCommandIndex]);
  const chooseCommand = option => {
    if (!option) return;
    if (option.type === 'tab') { switchSpace(option.spaceId); selectTab(option.tabId); }
    else if (option.type === 'command') { setModal(null); runCommand(option.id); }
    else if (['history', 'favorite'].includes(option.type)) addTab(option.url, option.title);
    else navigate(query);
  };
  const createNamed = event => {
    event.preventDefault();
    const value = name.trim().slice(0, modal === 'space' ? 40 : 80);
    if (!value) return;
    if (modal === 'space' && state.spaces.length >= 30) { notify('This workspace supports up to 30 spaces.'); return; }
    if (modal === 'folder' && state.folders.length >= 200) { notify('This workspace supports up to 200 folders.'); return; }
    const id = uid();
    if (modal === 'space') {
      setState(previous => ({ ...previous, spaces: [...previous.spaces, { id, name: value, icon: 'sparkles' }], activeSpaceId: id, activeTabId: null })); setFocusedPaneId(null);
    } else setState(previous => ({ ...previous, folders: [...previous.folders, { id, spaceId: previous.activeSpaceId, name: value }] }));
    setModal(null); setName('');
  };
  const exportWorkspace = () => {
    if (privateBrowsing && !window.confirm('Export this private workspace? This saves its tab addresses to a file that remains after the window closes.')) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'cove-workspace.json'; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Workspace exported. Your tabs stay yours.');
  };
  const importWorkspace = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 2_000_000) { notify('Choose a Cove workspace under 2 MB.'); return; }
    try {
      const imported = JSON.parse(await file.text());
      if (!isValidState(imported)) throw new Error('Invalid');
      setImportCandidate(imported); setModal('confirm-import');
    } catch { notify('This is not a valid Cove workspace file. Nothing was changed.'); }
  };
  const confirmImport = () => {
    if (!importCandidate) return;
    if (!privateBrowsing) {
      if (recovery.protected) { setModal('recovery'); notify('Recover saved data before replacing this workspace.'); return; }
      try {
        const result = saveWorkspace(window.localStorage, importCandidate);
        if (!result.ok) { if (result.recovery?.protected) setRecovery(result.recovery); notify('The import could not be saved. Your current workspace has not been replaced.'); return; }
      } catch { notify('Local storage is unavailable. Your current workspace has not been replaced.'); return; }
    }
    setState(initializePinnedTabs(importCandidate)); setImportCandidate(null); setFocusedPaneId(null); setModal(null); notify('Workspace imported successfully.');
  };

  const renderTab = tab => <div key={tab.id} className={`tab-row ${activeTab?.id === tab.id ? 'active' : ''}`} onContextMenu={event => { event.preventDefault(); setMenu(tab.id); }} draggable onDragStart={event => event.dataTransfer.setData('text/cove-tab', tab.id)} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); setState(previous => moveTab(previous, event.dataTransfer.getData('text/cove-tab'), tab.id)); }}>
    <button className="tab-main" onClick={() => selectTab(tab.id)} title={tab.title}><SiteIcon url={tab.url} title={tab.title} /><span>{tab.title}</span></button>
    <button className="tab-action" title={`More options for ${tab.title}`} aria-label={`More options for ${tab.title}`} onClick={() => setMenu(menu === tab.id ? null : tab.id)}><Ellipsis size={15} /></button>
    {tabStatus[tab.id]?.audible && <span className="tab-audio" title="Playing audio">♫</span>}
    {menu === tab.id && <div className="tab-context" role="menu" aria-label={`Actions for ${tab.title}`}><button onClick={() => togglePin(tab.id)}><Pin size={14}/>{tab.pinned ? 'Unpin tab' : 'Pin tab'}</button>{tab.pinned && <button disabled={!tab.pinnedUrl || tab.url === tab.pinnedUrl} onClick={() => { setState(previous => resetPinnedTab(previous, tab.id)); setMenu(null); }}>Reset pinned tab</button>}<button disabled={!getTabNeighbors(state, tab.id).previous} onClick={() => { setState(previous => shiftTab(previous, tab.id, 'up')); setMenu(null); }}>Move tab up</button><button disabled={!getTabNeighbors(state, tab.id).next} onClick={() => { setState(previous => shiftTab(previous, tab.id, 'down')); setMenu(null); }}>Move tab down</button><button onClick={() => { setName(tab.title); setRenameId(tab.id); setModal('rename-tab'); setMenu(null); }}><BookOpen size={14}/>Rename tab</button><button onClick={() => { setState(previous => duplicateTab(previous, tab.id)); setMenu(null); }}><Plus size={14}/>Duplicate tab</button><button onClick={() => { setSplitId(tab.id === activeTab?.id ? tabs.find(item => item.id !== tab.id)?.id : tab.id); setMenu(null); }}><PanelsTopLeft size={14}/>Open in split view</button>{desktop && tab.url !== HOME && <button onClick={() => { window.cove.setMuted({ tabId: tab.id, muted: !tabStatus[tab.id]?.muted }).catch(() => notify('Open this tab before muting it.')); setMenu(null); }}><span>♫</span>{tabStatus[tab.id]?.muted ? 'Unmute tab' : 'Mute tab'}</button>}<label className="tab-move-label">Move to space<select aria-label={`Move ${tab.title} to space`} value={tab.spaceId} onChange={event => { const spaceId = event.target.value; setState(previous => moveTabToSpace(previous, tab.id, spaceId)); setMenu(null); }}>{state.spaces.map(space => <option key={space.id} value={space.id}>{space.name}</option>)}</select></label><button onClick={() => { navigator.clipboard.writeText(tab.url).then(() => notify('Link copied.')).catch(() => notify('The clipboard is unavailable.')); setMenu(null); }}><ExternalLink size={14}/>Copy link</button><button onClick={() => removeTab(tab.id)}><X size={14}/>Close tab</button></div>}
  </div>;

  const renderPane = (tab, secondary = false) => <section key={tab?.id || 'empty'} style={splitTab ? { flex: `0 0 calc(${secondary ? 100 - splitRatio : splitRatio}% - 4px)` } : undefined} onPointerDownCapture={() => { if (tab) setFocusedPaneId(tab.id); }} data-tab-id={tab?.id} className="browser-pane" aria-label={tab?.title || 'New tab'}>
    {splitTab && <div className="pane-caption"><SiteIcon url={tab?.url || HOME} title={tab?.title}/><span>{tab?.title || 'New tab'}</span><IconButton label="Swap split panes" onClick={() => setState(previous => swapSplitLayout(previous))}><ArrowLeft size={13}/><ArrowRight size={13}/></IconButton><IconButton label="Close split view" onClick={() => setSplitId(null)}><X size={13}/></IconButton></div>}
    <div className="pane-surface" ref={element => { if (tab) paneRefs.current[tab.id] = element; }}>
      {!tab || tab.url === HOME ? <Home onOpen={addTab} onSearch={openCommand} notify={notify} space={activeSpace.name} favorites={favorites} onFavorites={() => setModal('favorites')} /> : <div className="website-preview"><div className="website-orbit"><SiteIcon url={tab.url} title={tab.title} size={35}/></div><span className="eyebrow">{desktop ? 'YOUR NEXT DISCOVERY' : 'WEB PREVIEW'}</span><h1>{tab.title}</h1><p>{desktop ? (tabStatus[tab.id]?.error || 'Opening your corner of the internet…') : 'The full internet deserves a real browser engine.'}</p><div className="preview-address"><LockKeyhole size={13}/>{domain(tab.url)}</div>{!desktop && <><a className="primary-button" href={tab.url} target="_blank" rel="noopener noreferrer">Open website <ArrowUpRight size={15}/></a><p className="preview-footnote">Spaces, tabs, notes, and settings work here.<br/>Run <code>npm run desktop</code> for native browsing.</p></>}{desktop && tabStatus[tab.id]?.error && <button className="primary-button" onClick={() => window.cove.reload(tab.id)}>Try again</button>}</div>}
    </div>
  </section>;

  return <div ref={rootRef} className={`app theme-${state.theme} ${state.dark ? 'dark' : ''} ${sidebar ? '' : 'sidebar-hidden'}`}>
    <aside className="sidebar" aria-label="Browser sidebar">
      <div className="window-bar"><div className={`traffic-lights ${desktop ? 'native' : ''}`} aria-hidden="true"><i/><i/><i/></div><IconButton label="Toggle sidebar (⌘⇧S)" onClick={() => setSidebar(false)}><PanelLeft size={17}/></IconButton></div>
      <div className="brand"><CoveMark size={29}/><span>cove</span><span className="alpha-badge">{privateBrowsing ? 'private' : 'early days'}</span></div>
      <button className="sidebar-search" onClick={() => openCommand()}><Search size={15}/><span>Search anything</span><kbd>⌘ K</kbd></button>
      <div className="favorite-grid" aria-label="Favorites">{favorites.slice(0, 8).map(item => <button key={item.id} title={item.name} onClick={() => addTab(item.url, item.name)}><QuickIcon item={item}/></button>)}</div>
      <div className="space-heading"><div className="space-label"><Sun size={16}/><span>{activeSpace.name}</span></div><button title="Space options" aria-label="Space options" className="tiny-button" onClick={() => setModal('space-options')}><ChevronDown size={15}/></button></div>
      <div className="tab-scroll">
        <div className="pinned-tabs">{tabs.filter(tab => tab.pinned && !tab.folderId).map(renderTab)}</div>
        {folders.map(folder => <div className="folder-group" key={folder.id}><div className="folder-row"><button onClick={() => setCollapsed(previous => ({ ...previous, [folder.id]: !previous[folder.id] }))} aria-expanded={!collapsed[folder.id]}>{collapsed[folder.id] ? <ChevronRight size={12}/> : <ChevronDown size={12}/>}<Folder size={16}/><span>{folder.name}</span></button><button className="tiny-button folder-add" title={`Add tab to ${folder.name}`} aria-label={`Add tab to ${folder.name}`} onClick={() => openCommand(folder.id)}><Plus size={14}/></button></div>{!collapsed[folder.id] && <div className="folder-tabs">{tabs.filter(tab => tab.folderId === folder.id).map(renderTab)}<button className="folder-hint" onClick={() => openCommand(folder.id)}><Plus size={12}/>Add a link</button></div>}</div>)}
        <div className="sidebar-divider"/>
        <div className="today-heading"><span>Today</span><IconButton label="Archive today's unpinned tabs" onClick={() => { const ids = tabs.filter(tab => !tab.pinned).map(tab => tab.id); setState(previous => ids.reduce(closeTab, previous)); notify(ids.length ? `${ids.length} tabs moved to your archive.` : 'All clear. A little breathing room.'); }}><History size={14}/></IconButton></div>
        {tabs.filter(tab => !tab.pinned).map(renderTab)}
        <button className="new-tab" onClick={() => openCommand()}><Plus size={17}/><span>New tab</span><kbd>⌘ T</kbd></button>
        <button className="new-folder" onClick={() => { setName(''); setModal('folder'); }}><Folder size={14}/>New folder</button>
      </div>
      <div className="sidebar-bottom"><button className="archive-button" onClick={() => setModal('archive')}><History size={15}/><span>Archive</span><span className="archive-count">{state.archive.length || ''}</span></button><div className="space-switcher"><div className="space-dots">{state.spaces.map(space => { const Icon = spaceIcons[space.icon] || Sparkles; return <button key={space.id} className={space.id === activeSpace.id ? 'selected' : ''} title={space.name} aria-label={`Switch to ${space.name}`} aria-pressed={space.id === activeSpace.id} onClick={() => switchSpace(space.id)}><Icon size={16}/></button>; })}<button title="New space" aria-label="New space" onClick={() => { setName(''); setModal('space'); }}><Plus size={15}/></button></div><IconButton label="Settings" onClick={() => setModal('settings')}><Settings2 size={16}/></IconButton></div><div className="sidebar-signature"><span className="online-dot"/>A browser that belongs to you.</div></div>
    </aside>
    <main className="main-shell">
      <header className="toolbar"><div className="toolbar-left">{!sidebar && <IconButton label="Show sidebar" onClick={() => setSidebar(true)}><PanelLeft size={17}/></IconButton>}<IconButton label="Back" disabled={!desktop || !currentStatus.canGoBack} onClick={() => window.cove.back(focusedTab.id)}><ArrowLeft size={16}/></IconButton><IconButton label="Forward" disabled={!desktop || !currentStatus.canGoForward} onClick={() => window.cove.forward(focusedTab.id)}><ArrowRight size={16}/></IconButton><IconButton label={currentStatus.loading ? "Stop loading" : "Reload"} disabled={!desktop || !focusedTab || focusedTab.url === HOME} onClick={() => runCommand(currentStatus.loading ? 'stop' : 'reload')}>{currentStatus.loading ? <X size={14}/> : <RotateCw size={14}/>}</IconButton><IconButton label="Home" onClick={() => { const home = tabs.find(tab => tab.url === HOME); home ? selectTab(home.id) : addTab(); }}><House size={16}/></IconButton></div>
        <button className="address-bar" onClick={() => { setQuery(focusedTab?.url === HOME ? '' : focusedTab?.url || ''); setModal('address'); }}>{focusedTab?.url && focusedTab.url !== HOME ? <LockKeyhole size={12}/> : <CoveMark size={14}/>}<span>{focusedTab?.url && focusedTab.url !== HOME ? domain(focusedTab.url) : 'New tab'}</span>{currentStatus.loading && <span className="loading-dot"/>}</button>
        <div className="toolbar-right">{desktop && <IconButton label="Site permissions" disabled={!focusedTab || focusedTab.url === HOME} onClick={() => setModal('site-permissions')}><LockKeyhole size={15}/></IconButton>}{desktop && focusedTab?.url !== HOME && focusedTab && currentStatus.zoom && Math.abs(currentStatus.zoom - 1) > .01 && <button className="zoom-indicator" title="Reset page zoom" onClick={() => runCommand('zoom-reset')}>{Math.round(currentStatus.zoom * 100)}%</button>}<IconButton label="Downloads" className={downloads.some(item => item.state === 'progressing') ? 'download-active' : ''} onClick={() => setModal('downloads')}><ArrowDownToLine size={16}/></IconButton><IconButton label={splitId ? 'Exit split view' : 'Split view (⌘⇧D)'} className={splitId ? 'is-active' : ''} onClick={toggleSplit}><PanelsTopLeft size={17}/></IconButton><IconButton label="Browser settings" onClick={() => setModal('settings')}><Ellipsis size={19}/></IconButton></div>
      </header>
      {privateBrowsing && <div className="private-banner" role="status"><LockKeyhole size={13}/><span><strong>Private window.</strong> Tabs, notes, and site data stay in this session. Downloads remain on your device. This does not hide you from websites or your network.</span></div>}
      {findOpen && focusedTab && <FindBar key={focusedTab.id} tabId={focusedTab.id} result={findResult} notify={notify} onClose={closeFind}/>}
      <div className={`content-window ${splitTab ? 'is-split' : ''} ${resizing ? 'is-resizing' : ''}`}>{renderPane(activeTab)}{splitTab && <><div className="split-handle" role="separator" aria-label="Resize split view" aria-orientation="vertical" aria-valuemin={25} aria-valuemax={75} aria-valuenow={Math.round(splitRatio)} tabIndex={0} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); setSplitRatio(previous => Math.max(25, Math.min(75, previous + (event.key === 'ArrowRight' ? 5 : -5)))); } }} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setResizing(true); }} onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const bounds = event.currentTarget.parentElement.getBoundingClientRect(); setSplitRatio(Math.max(25, Math.min(75, (event.clientX - bounds.left) / bounds.width * 100))); }} onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setResizing(false); }} onLostPointerCapture={() => setResizing(false)}><span/></div>{renderPane(splitTab, true)}</>}</div>
      <footer className="frame-footer"><span><span className="status-dot"/>{recovery.protected ? 'Saved data protected — recovery needed' : storageError ? 'Storage full — export your workspace' : privateBrowsing ? 'Private session. Nothing added to history.' : 'Local-first. Quiet by design.'}</span>{recovery.protected && <button onClick={() => setModal('recovery')}>Recover workspace</button>}<button onClick={() => setModal('help')}>Made for a more human internet <ArrowUpRight size={10}/></button></footer>
    </main>
    {modal && <div className={`modal-backdrop ${modal === 'command' || modal === 'address' ? 'command-backdrop' : ''}`} onMouseDown={event => { if (event.target === event.currentTarget) setModal(null); }}>
      <section className={`modal ${modal === 'command' || modal === 'address' ? 'command-modal' : ''} ${['history', 'downloads', 'favorites', 'import-bookmarks', 'site-permissions', 'folders'].includes(modal) ? 'tools-modal' : ''}`} role="dialog" aria-modal="true" aria-label={modal === 'command' ? 'Search or open a tab' : modal === 'address' ? 'Navigate to address' : modal === 'space' ? 'Create space' : modal === 'folder' ? 'Create folder' : modal} onKeyDown={event => { if (event.key !== 'Tab') return; const elements = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not([hidden]), select, textarea, a[href]')].filter(element => element.getClientRects().length); const first = elements[0]; const last = elements.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }}>
        {(modal === 'command' || modal === 'address') ? <><form className="command-input" onSubmit={event => { event.preventDefault(); modal === 'address' ? navigate(query) : chooseCommand(commandOptions[selectedCommandIndex] || commandOptions[0]); }}><Search size={21}/><input ref={commandInput} autoFocus role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="palette-results" aria-activedescendant={`palette-result-${selectedCommandIndex}`} aria-label="Search or enter URL" placeholder="Search, enter a URL, or find a tab…" value={query} onChange={event => { setQuery(event.target.value); setCommandIndex(0); }} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setCommandIndex(previous => (Math.min(previous, commandOptions.length - 1) + (event.key === 'ArrowDown' ? 1 : -1) + commandOptions.length) % commandOptions.length); } }}/><button type="button" onClick={() => setModal(null)} className="escape-key">esc</button></form><div className="command-results" id="palette-results" role="listbox" aria-label="Tabs, favorites, history and commands"><span className="command-section">{query ? 'A new direction' : 'Where to next?'}</span>{(modal === 'address' ? commandOptions.slice(0, 1) : commandOptions).map((option, index) => <button id={`palette-result-${index}`} role="option" aria-selected={selectedCommandIndex === index} key={`${option.type}-${option.id}`} className={`command-result ${selectedCommandIndex === index ? 'highlighted' : ''}`} onMouseEnter={() => setCommandIndex(index)} onClick={() => modal === 'address' ? navigate(query) : chooseCommand(option)}>{option.url ? <SiteIcon url={option.url} title={option.title}/> : option.type === 'command' ? <Command size={20}/> : <Globe2 size={20}/>}<span><strong>{option.title}</strong><small>{option.subtitle}</small></span><span className="enter-key">↵</span></button>)}</div><div className="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> to explore</span><span><kbd>↵</kbd> to open</span><span>Search with {getSearchEngine(state).name}</span></div></> : <>
          <div className="modal-heading"><CoveMark size={24}/><IconButton label="Close dialog" onClick={() => setModal(null)}><X size={19}/></IconButton></div>
          {modal === 'confirm-import' && importCandidate && <><span className="eyebrow">REPLACE THIS WORKSPACE?</span><h2>Bring your workspace over.</h2><p>This replaces your current spaces, tabs, archive, favorites, and history with {importCandidate.spaces.length} spaces and {importCandidate.tabs.length} tabs from the file. Website cookies and local notes are not replaced.</p><p>{privateBrowsing ? "This import stays in this private session only." : "A recent valid snapshot is backed up locally, but that backup rotates with later changes. Export your current workspace first for a durable copy."}</p><button className="setting-row" onClick={exportWorkspace}>Export current workspace first</button><button className="primary-button" onClick={confirmImport}>Replace workspace</button><button className="setting-row" onClick={() => { setImportCandidate(null); setModal('settings'); }}>Keep current workspace</button></>}
          {modal === 'history' && <HistoryPanel state={state} setState={setState} onOpen={addTab}/>}
          {modal === 'recovery' && <><span className="eyebrow">YOUR DATA COMES FIRST</span><h2>Recover your workspace.</h2><p>Your saved workspace could not be safely loaded. You are viewing a temporary preview. Changes are not saved until you choose a recovery action. Recovering replaces this preview, so export any changes you want to keep first.</p><p>The unreadable saved data is preserved before replacement. If preservation fails, nothing is replaced.</p><button className="setting-row" onClick={exportWorkspace}>Export current preview</button><button className="setting-row" disabled={!recovery.backupAvailable} onClick={() => recover('backup')}>Restore last valid backup</button><button className="setting-row" onClick={() => recover('default')}>Start fresh and preserve saved data</button><p>Local storage backups are not crashproof or a substitute for exported files.</p></>}
          {modal === 'downloads' && <DownloadsPanel downloads={downloads} notify={notify}/>}
          {modal === 'favorites' && <FavoritesPanel state={state} setState={setState} notify={notify}/>}
          {modal === 'site-permissions' && <SiteControls key={focusedTab?.id} tabId={focusedTab?.id} notify={notify}/>}
          {modal === 'folders' && <FolderControls key={state.activeSpaceId} state={state} setState={setState} notify={notify}/>}
          {modal === 'settings' && desktop && <button className="setting-row" onClick={() => runCommand('private-window')}><span><LockKeyhole size={17}/>New private window</span><kbd>⌘ ⇧ N</kbd></button>}
          {modal === 'settings' && desktop && focusedTab?.url !== HOME && <div className="settings-library"><button onClick={() => runCommand('print')}>Print page</button><button onClick={() => runCommand('save-pdf')}>Save page as PDF</button><button onClick={() => runCommand('devtools')}>Page developer tools</button></div>}
          {modal === 'space-options' && <SpacePanel state={state} setState={setState} onClose={() => setModal(null)}/>}
          {modal === 'import-bookmarks' && <BookmarkImportPanel state={state} setState={setState} notify={notify} onClose={() => setModal(null)}/>}
          {modal === 'rename-tab' && <form onSubmit={event => { event.preventDefault(); setState(previous => { const renamed = renameTab(previous, renameId, name); return { ...renamed, tabs: renamed.tabs.map(tab => tab.id === renameId ? { ...tab, customTitle: true } : tab) }; }); setModal(null); }}><span className="eyebrow">MAKE IT MEAN SOMETHING</span><h2>A name you’ll remember.</h2><label className="field-label">Tab name<input className="text-field" aria-label="Tab name" maxLength={80} value={name} onChange={event => setName(event.target.value)}/></label><button className="primary-button" disabled={!name.trim()}>Save tab name<Check size={15}/></button></form>}
          {modal === 'settings' && <div className="settings-library"><button onClick={() => setModal('history')}><History size={16}/><span>History</span></button><button onClick={() => setModal('favorites')}><Pin size={16}/><span>Favorites</span></button><button onClick={() => setModal('import-bookmarks')}><ArrowDownToLine size={16}/><span>Import bookmarks</span></button><button onClick={() => setModal('folders')}><Folder size={16}/><span>Manage folders</span></button></div>}
          {(modal === 'space' || modal === 'folder') && <form onSubmit={createNamed}><span className="eyebrow">A LITTLE ORGANIZATION</span><h2>{modal === 'space' ? 'Make a little space.' : 'Room for your ideas.'}</h2><p>{modal === 'space' ? 'A separate corner for a different part of your day.' : 'Keep the links that belong together, together.'}</p><label className="field-label" htmlFor="new-name">{modal === 'space' ? 'Space name' : 'Folder name'}</label><input id="new-name" autoFocus className="text-field" maxLength={modal === 'space' ? 40 : 80} placeholder={modal === 'space' ? 'e.g. Side projects' : 'e.g. Weekend reading'} value={name} onChange={event => setName(event.target.value)}/><button className="primary-button" type="submit" disabled={!name.trim()}>Create {modal}<Plus size={15}/></button></form>}
          {modal === 'settings' && <><span className="eyebrow">MAKE YOURSELF AT HOME</span><h2>A browser, your way.</h2><p>Small details. A space that feels like you.</p><div className="setting-label">Your color palette</div><div className="theme-options">{['sage', 'sand', 'lavender'].map(theme => <button key={theme} className={`theme-swatch ${theme} ${state.theme === theme ? 'chosen' : ''}`} aria-label={`${theme} theme`} aria-pressed={state.theme === theme} onClick={() => setState(previous => ({ ...previous, theme }))}>{state.theme === theme && <Check size={16}/>}<span>{theme}</span></button>)}</div><button className="setting-row" onClick={() => setState(previous => ({ ...previous, dark: !previous.dark }))}><span><Moon size={17}/>Evening mode</span><span className={`toggle ${state.dark ? 'on' : ''}`} role="switch" aria-checked={state.dark} aria-label="Evening mode"><i/></span></button><label className="setting-row search-engine-setting"><span><Search size={17}/>Search engine</span><select aria-label="Search engine" value={getSearchEngine(state).id} onChange={event => { const searchEngine = event.target.value; setState(previous => ({ ...previous, searchEngine })); }}>{SEARCH_ENGINES.map(engine => <option key={engine.id} value={engine.id}>{engine.name}</option>)}</select></label><LifecycleSettings state={state} setState={setState}/><RetentionSettings state={state} setState={setState} notify={notify}/><ResourceSettings state={state} notify={notify} onDataCleared={refreshEngine}/><div className="setting-label">Your data stays yours</div><button className="setting-row" onClick={exportWorkspace}><span><ArrowDownToLine size={17}/>Export workspace</span><ArrowUpRight size={15}/></button><button className="setting-row" onClick={() => importRef.current.click()}><span><LayoutGrid size={17}/>Import Cove workspace</span><ArrowUpRight size={15}/></button><input type="file" accept="application/json,.json" ref={importRef} hidden onChange={importWorkspace}/><button className="setting-row" onClick={() => setModal('help')}><span><CircleHelp size={17}/>Keyboard shortcuts & about</span><ArrowUpRight size={15}/></button><div className="settings-note"><LockKeyhole size={13}/>No accounts. No telemetry. No one looking over your shoulder.</div></>}
          {modal === 'archive' && <><span className="eyebrow">NOT LOST, JUST TUCKED AWAY</span><h2>Your archive.</h2><p>A second chance for that tab you closed.</p><label className="tools-search"><Search size={16}/><input aria-label="Search archived tabs" placeholder="Search title or address…" value={archiveQuery} onChange={event => setArchiveQuery(event.target.value)}/></label><div className="archive-list">{state.archive.length > 0 && !archiveMatches.length && <p role="status">No archived tabs match this search.</p>}{state.archive.length ? archiveMatches.map((tab, index) => <button key={`${tab.id}-${index}`} onClick={() => restore(tab.id)}><SiteIcon url={tab.url} title={tab.title}/><span><strong>{tab.title}</strong><small>{domain(tab.url)}</small></span><History size={16}/></button>) : <div className="empty-archive"><History size={29}/><h3>A clean slate.</h3><p>Closed tabs will be waiting here when you need them.</p></div>}</div></>}
          {modal === 'help' && <><span className="eyebrow">LESS FRICTION, MORE FLOW</span><h2>Meet your new shortcuts.</h2><div className="shortcut-list">{[['Find anything / new tab', '⌘ K / ⌘ T'], ['Go to an address', '⌘ L'], ['Close current tab', '⌘ W'], ['Reopen closed tab', '⌘ ⇧ T'], ['New private window', '⌘ ⇧ N'], ['Find in page', '⌘ F'], ['History / Downloads', '⌘ Y / ⌘ J'], ['Print page', '⌘ P'], ['Hard reload', '⌘ ⇧ R'], ['Page developer tools', '⌘ ⌥ I'], ['Toggle sidebar', '⌘ ⇧ S'], ['Toggle split view', '⌘ ⇧ D'], ['Settings', '⌘ ,']].map(([label, key]) => <div key={label}><span>{label}</span><kbd>{key}</kbd></div>)}</div><p className="about-note">Cove {version} · MIT licensed · Independent and open source.<br/>Use Ctrl instead of ⌘ on Windows and Linux. Native desktop browsing uses Chromium. This web preview never embeds third-party sites.</p></>}
        </>}
      </section>
    </div>}
    {toast && <div className="toast" role="status"><Check size={15}/>{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={14}/></button></div>}
  </div>;
}

function Home({ onOpen, onSearch, notify, space, favorites, onFavorites }) {
  const [note, setNote] = useState(() => { if (privateBrowsing) return privateNote; try { return localStorage.getItem('cove.note.v1') || ''; } catch { return ''; } });
  const [time, setTime] = useState(new Date());
  useEffect(() => { const timer = setInterval(() => setTime(new Date()), 60_000); return () => clearInterval(timer); }, []);
  const hour = time.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return <div className="home-page">
    <div className="home-topline"><span><span className="little-sun">✳</span>{greeting}. Settle in.</span><span>{time.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}<span className="topline-dot">·</span>{time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span></div>
    <div className="home-center"><div className="home-eyebrow"><span className="small-line"/>{space.toUpperCase()} SPACE<span className="small-line"/></div><h1>A little space<br/>for <em>you.</em><span className="heading-sparkle">✳</span></h1><p className="home-subtitle">Less noise. More of what brings you here.</p><button className="home-search" onClick={() => onSearch()}><Search size={20}/><span>Where would you like to go?</span><kbd>⌘ K</kbd></button><div className="quick-links">{favorites.slice(0, 6).map(item => <button key={item.id} onClick={() => onOpen(item.url, item.name)}><span className={`quick-icon ${item.color || ''}`}><QuickIcon item={item}/><ArrowUpRight size={12} className="quick-arrow"/></span><span>{item.name}</span></button>)}<button className="add-shortcut" aria-label="Manage favorites" onClick={onFavorites}><span className="quick-icon add"><Plus size={22}/></span><span>Make it yours</span></button></div></div>
    <div className="home-bottom"><section className="scratchpad"><div className="card-heading"><span><BookOpen size={15}/>A passing thought</span><span className="handwritten">keep it here ↙</span></div><textarea aria-label="A passing thought" placeholder={'An idea, a reminder, the beginning\nof something good…'} value={note} onChange={event => { setNote(event.target.value); if (privateBrowsing) { privateNote = event.target.value; return; } try { localStorage.setItem('cove.note.v1', event.target.value); } catch { notify('Your note could not be saved. Device storage may be full.'); } }}/><div className="note-footer"><span><span className="note-dot"/>{privateBrowsing ? 'Only here until this private window closes.' : 'Just for you. Saved on this device.'}</span><span>{note.length ? `${note.length} characters` : '↵'}</span></div></section><button className="inspiration-card" onClick={() => onOpen('https://www.are.na/', 'A little inspiration')}><img src={mountainImage} alt="Quiet green mountains and forest beneath a soft morning sky"/><span className="image-shade"/><span className="image-kicker">TAKE THE SCENIC ROUTE</span><span className="image-quote">There's a whole world<br/>outside your tabs.</span><span className="image-link">Find a little inspiration <ArrowUpRight size={14}/></span><span className="image-corner"><ArrowUpRight size={19}/></span></button></div>
    <div className="home-signoff"><CoveMark size={16}/><span>Make yourself at home on the internet.</span></div>
  </div>;
}
