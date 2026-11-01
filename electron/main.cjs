const { app, BrowserWindow, WebContentsView, ipcMain, Menu, session, shell, dialog } = require('electron');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { mkdtempSync } = require('node:fs');
const fs = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { launchPrivate } = require('./private.cjs');
const { createPermissionController } = require('./permissions.cjs');
const { createSiteDataController } = require('./site-data.cjs');
const { isWebUrl, validId, rendererLocation, isShellUrl, clampBounds, clampZoom, shortcutCommand } = require('./policy.cjs');

const privateMode = process.env.COVE_PRIVATE === '1';
app.setName(privateMode ? 'Cove Private' : 'Cove');
if (process.env.COVE_USER_DATA && path.isAbsolute(process.env.COVE_USER_DATA)) app.setPath('userData', process.env.COVE_USER_DATA);
else if (privateMode) app.setPath('userData', mkdtempSync(path.join(tmpdir(), 'cove-private-')));

const HOME = 'cove://newtab';
const shellUrl = rendererLocation(process.env.COVE_DEV_URL, path.join(__dirname, '../dist/index.html'));
const tabs = new Map();
const sleepingTabs = new Map();
const knownSpaces = new Set();
let selectedIds = new Set();
let desiredTabs = new Map();
const securedSessions = new Set();
const downloads = new Map();
const permissions = createPermissionController();
let mainWindow;
let attached = new Set();
let pageOutputPending = false;

const siteData = createSiteDataController({
  getSession: spaceId => session.fromPartition(`${privateMode ? '' : 'persist:'}cove-${spaceId}`),
  canClear: spaceId => {
    if (!knownSpaces.has(spaceId)) return { ok: false, reason: 'Unknown Cove space.' };
    if (pageOutputPending) return { ok: false, reason: 'Page output is in progress.' };
    if ([...downloads.values()].some(entry => !entry.done && entry.spaceId === spaceId)) return { ok: false, reason: 'A download is active in this space.' };
    return true;
  },
  beforeClear: spaceId => {
    for (const [id, entry] of tabs) if (entry.spaceId === spaceId) {
      sleepingTabs.set(id, { spaceId, muted: entry.view.webContents.isAudioMuted(), zoom: entry.view.webContents.getZoomFactor() });
      destroyTab(id);
    }
  },
  afterClear: (spaceId, result) => emit({ type: 'space-data-cleared', spaceId, ok: result.ok, ...(result.partial ? { partial: true } : {}) })
});

function emit(update) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('cove:tab-update', update);
}

function downloadRecords() {
  return [...downloads.values()].map(({ record }) => ({ ...record }));
}

function emitDownloads() {
  emit({ type: 'downloads', downloads: downloadRecords() });
}

function trackDownload(event, item, spaceId) {
  if (siteData.isClearing(spaceId)) { event.preventDefault(); return; }
  if (downloads.size >= 100) {
    const oldest = [...downloads.values()].find(entry => entry.done);
    if (!oldest) { event.preventDefault(); return; }
    downloads.delete(oldest.record.id);
  }
  const record = { id: randomUUID(), filename: path.basename(item.getFilename()), totalBytes: item.getTotalBytes(), receivedBytes: item.getReceivedBytes(), state: 'progressing', startedAt: Date.now() };
  const entry = { record, item, spaceId, done: false, savePath: null };
  downloads.set(record.id, entry);
  item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('downloads'), record.filename) });
  item.on('updated', (_event, state) => {
    if (entry.done) return;
    Object.assign(record, { totalBytes: item.getTotalBytes(), receivedBytes: item.getReceivedBytes(), state: state === 'interrupted' ? 'interrupted' : 'progressing' });
    emitDownloads();
  });
  item.once('done', (_event, state) => {
    entry.done = true;
    Object.assign(record, { totalBytes: item.getTotalBytes(), receivedBytes: item.getReceivedBytes(), state: ['completed', 'cancelled', 'interrupted'].includes(state) ? state : 'interrupted' });
    if (record.state === 'completed') entry.savePath = item.getSavePath();
    entry.item = null;
    emitDownloads();
  });
  emitDownloads();
}

function secureSession(partition, spaceId) {
  if (securedSessions.has(partition)) return;
  const target = session.fromPartition(partition);
  permissions.install(target, spaceId);
  target.setDisplayMediaRequestHandler((_request, callback) => callback({}));
  target.on('will-download', (event, item) => trackDownload(event, item, spaceId));
  securedSessions.add(partition);
}

function status(id, extra = {}) {
  const entry = tabs.get(id);
  if (!entry || entry.view.webContents.isDestroyed()) return;
  const contents = entry.view.webContents;
  emit({ id, audible: contents.isCurrentlyAudible(), muted: contents.isAudioMuted(), zoom: contents.getZoomFactor(), canGoBack: contents.navigationHistory.canGoBack(), canGoForward: contents.navigationHistory.canGoForward(), ...extra });
}

function shortcut(event, input, id) {
  const command = shortcutCommand(input);
  if (command) { event.preventDefault(); emit({ type: 'shortcut', command, ...(id ? { id } : {}) }); }
}

function menuShortcut(command) {
  const id = [...attached].find(id => {
    const contents = tabs.get(id)?.view.webContents;
    return contents && !contents.isDestroyed() && contents.isFocused();
  });
  emit({ type: 'shortcut', command, ...(id ? { id } : {}) });
}

function destroyTab(id) {
  const entry = tabs.get(id);
  if (!entry) return;
  if (attached.has(id) && mainWindow && !mainWindow.isDestroyed()) mainWindow.contentView.removeChildView(entry.view);
  attached.delete(id);
  if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close({ waitForBeforeUnload: false });
  tabs.delete(id);
}

function createTab(tab) {
  const partition = `${privateMode ? '' : 'persist:'}cove-${tab.spaceId}`;
  secureSession(partition, tab.spaceId);
  const view = new WebContentsView({ webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, allowRunningInsecureContent: false, safeDialogs: true, navigateOnDragDrop: false } });
  const entry = { view, spaceId: tab.spaceId, requestedUrl: tab.url, findText: null, findRequestId: null, mediaProtected: permissions.get(tab.spaceId, tab.url).permissions.media };
  tabs.set(tab.id, entry);
  const contents = view.webContents;
  contents.setZoomMode('manual');
  const saved = sleepingTabs.get(tab.id);
  if (saved?.spaceId === tab.spaceId) {
    contents.setAudioMuted(saved.muted);
    contents.setZoomFactor(saved.zoom);
    contents.once('did-finish-load', () => {
      if (!contents.isDestroyed()) { contents.setZoomFactor(saved.zoom); status(tab.id); }
    });
  }
  sleepingTabs.delete(tab.id);
  const openLink = url => { if (isWebUrl(url)) emit({ type: 'new-tab', url, spaceId: entry.spaceId }); };
  contents.setWindowOpenHandler(({ url }) => { openLink(url); return { action: 'deny' }; });
  contents.on('context-menu', (_event, params) => {
    const template = [];
    if (isWebUrl(params.linkURL)) template.push({ label: 'Open Link in New Tab', click: () => openLink(params.linkURL) }, { type: 'separator' });
    const action = method => () => { if (!contents.isDestroyed()) contents[method](); };
    template.push({ label: 'Copy', enabled: !!params.editFlags?.canCopy, click: action('copy') }, { label: 'Paste', enabled: !!params.isEditable && !!params.editFlags?.canPaste, click: action('paste') }, { label: 'Select All', enabled: !!params.editFlags?.canSelectAll, click: action('selectAll') });
    template.push({ type: 'separator' }, { label: 'Inspect Element', click: () => {
      if (tabs.get(tab.id) !== entry || contents.isDestroyed()) return;
      contents.openDevTools({ mode: 'detach' });
      contents.inspectElement(params.x, params.y);
    } });
    Menu.buildFromTemplate(template).popup({ window: mainWindow });
  });
  const guard = (event, url) => { if (!isWebUrl(url)) { event.preventDefault(); status(tab.id, { error: 'This address is not supported. Only HTTP and HTTPS are allowed.' }); } };
  contents.on('will-navigate', guard);
  contents.on('will-redirect', guard);
  contents.on('will-frame-navigate', event => { if (!isWebUrl(event.url) && !['about:blank', 'about:srcdoc'].includes(event.url)) event.preventDefault(); });
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.on('page-title-updated', (_event, title) => status(tab.id, { title }));
  const navigated = (_event, url) => { if (isWebUrl(url)) { entry.requestedUrl = url; status(tab.id, { url, error: '' }); } };
  contents.on('did-navigate', (_event, url) => {
    entry.findText = null;
    entry.findRequestId = null;
    entry.mediaProtected = permissions.get(entry.spaceId, url).permissions.media;
    navigated(null, url);
    if (isWebUrl(url)) emit({ type: 'navigation', id: tab.id, spaceId: entry.spaceId, url, title: contents.getTitle(), visitedAt: Date.now() });
  });
  contents.on('did-navigate-in-page', (_event, url, isMainFrame) => { if (isMainFrame) navigated(null, url); });
  contents.on('did-start-loading', () => status(tab.id, { loading: true, error: '' }));
  contents.on('did-stop-loading', () => status(tab.id, { loading: false }));
  contents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => { if (isMainFrame && code !== -3) status(tab.id, { loading: false, error: description }); });
  contents.on('render-process-gone', () => status(tab.id, { error: 'This page stopped responding. Reload to try again.', loading: false }));
  contents.on('audio-state-changed', () => status(tab.id));
  contents.on('zoom-changed', (_event, direction) => {
    contents.setZoomFactor(clampZoom(contents.getZoomFactor() + (direction === 'in' ? 0.1 : -0.1)));
    status(tab.id);
  });
  contents.on('found-in-page', (_event, result) => {
    if (result.requestId === entry.findRequestId) emit({ type: 'find-result', id: tab.id, matches: result.matches, activeMatchOrdinal: result.activeMatchOrdinal });
  });
  contents.on('focus', () => emit({ type: 'focus-tab', id: tab.id }));
  contents.on('before-input-event', (event, input) => shortcut(event, input, tab.id));
  contents.loadURL(tab.url).catch(() => {});
  status(tab.id, { sleeping: false });
  return entry;
}

function handle(channel, handler) {
  ipcMain.handle(channel, (event, payload) => {
    if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame || !isShellUrl(event.senderFrame.url, shellUrl)) throw new Error('Untrusted browser command.');
    return handler(payload);
  });
}

handle('cove:sync-tabs', list => {
  if (!Array.isArray(list) || list.length > 500) throw new Error('Invalid tab list.');
  const ids = new Set();
  for (const tab of list) {
    if (!tab || !validId(tab.id) || !validId(tab.spaceId) || (tab.url !== HOME && !isWebUrl(tab.url)) || ids.has(tab.id)) throw new Error('Invalid tab.');
    ids.add(tab.id);
  }
  desiredTabs = new Map(list.map(tab => [tab.id, tab]));
  for (const tab of list) knownSpaces.add(tab.spaceId);
  selectedIds = new Set([...selectedIds].filter(id => ids.has(id)));
  for (const [id, saved] of sleepingTabs) if (!ids.has(id) || desiredTabs.get(id).spaceId !== saved.spaceId || desiredTabs.get(id).url === HOME) sleepingTabs.delete(id);
  for (const id of tabs.keys()) if (!ids.has(id) || list.find(tab => tab.id === id).url === HOME) destroyTab(id);
  for (const tab of list) {
    if (tab.url === HOME || siteData.isClearing(tab.spaceId)) continue;
    let entry = tabs.get(tab.id);
    if (entry && entry.spaceId !== tab.spaceId) { destroyTab(tab.id); entry = null; }
    if (!entry) continue;
    if (entry.requestedUrl !== tab.url && entry.view.webContents.getURL() !== tab.url) {
      entry.requestedUrl = tab.url;
      entry.view.webContents.loadURL(tab.url).catch(() => {});
    }
  }
});

handle('cove:layout', layout => {
  if (!layout || !Array.isArray(layout.panes) || layout.panes.length > 2 || typeof layout.hidden !== 'boolean') throw new Error('Invalid layout.');
  const desired = new Set();
  const bounds = mainWindow.getContentBounds();
  const zoom = mainWindow.webContents.getZoomFactor();
  const selected = layout.panes.filter(pane => pane && desiredTabs.has(pane.tabId) && clampBounds(pane, bounds)).map(pane => pane.tabId);
  if (selected.length || !layout.hidden) selectedIds = new Set(selected);
  if (!layout.hidden) for (const pane of layout.panes) {
    if (!pane || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(pane[key]))) continue;
    const tab = desiredTabs.get(pane.tabId);
    const safeBounds = clampBounds({ x: pane.x * zoom, y: pane.y * zoom, width: pane.width * zoom, height: pane.height * zoom }, bounds);
    if (!tab || tab.url === HOME || !safeBounds || siteData.isClearing(tab.spaceId)) continue;
    const entry = tabs.get(pane.tabId) || createTab(tab);
    if (!attached.has(pane.tabId)) mainWindow.contentView.addChildView(entry.view);
    entry.view.setBounds(safeBounds);
    desired.add(pane.tabId);
  }
  for (const id of attached) if (!desired.has(id) && tabs.has(id)) mainWindow.contentView.removeChildView(tabs.get(id).view);
  attached = desired;
});

function tabResource(tab) {
  const contents = tabs.get(tab.id)?.view.webContents;
  const loaded = !!contents && !contents.isDestroyed();
  const audible = loaded && contents.isCurrentlyAudible();
  const loading = loaded && contents.isLoading();
  let reason;
  if (siteData.isClearing(tab.spaceId)) reason = 'Space reset is in progress.';
  else if (selectedIds.has(tab.id)) reason = 'Tab is selected.';
  else if (!loaded) reason = sleepingTabs.has(tab.id) ? 'Tab is sleeping.' : 'Tab is not loaded.';
  else if (audible) reason = 'Tab is audible.';
  else if (loading) reason = 'Tab is loading.';
  else if (typeof contents.isBeingCaptured === 'function' && contents.isBeingCaptured()) reason = 'Tab is being captured.';
  else if (tabs.get(tab.id).mediaProtected || permissions.get(tab.spaceId, contents.getURL()).permissions.media) reason = 'Camera or microphone access was enabled. Reload after revoking access before sleeping.';
  else if (contents.isDevToolsOpened()) reason = 'Developer tools are open.';
  else if (pageOutputPending) reason = 'Page output is in progress.';
  else if ([...downloads.values()].some(entry => !entry.done && entry.spaceId === tab.spaceId)) reason = 'A download is active in this space.';
  return { id: tab.id, spaceId: tab.spaceId, loaded, visible: attached.has(tab.id), audible, loading, sleeping: sleepingTabs.has(tab.id), canSleep: !reason, ...(reason ? { reason } : {}) };
}

handle('cove:get-tab-resources', () => [...desiredTabs.values()].map(tabResource));
handle('cove:sleep-tab', id => {
  if (!validId(id) || !desiredTabs.has(id)) return { ok: false, reason: 'Unknown tab.' };
  const resource = tabResource(desiredTabs.get(id));
  if (!resource.canSleep) return { ok: false, reason: resource.reason };
  const entry = tabs.get(id);
  const contents = entry.view.webContents;
  sleepingTabs.set(id, { spaceId: entry.spaceId, muted: contents.isAudioMuted(), zoom: contents.getZoomFactor() });
  destroyTab(id);
  emit({ id, sleeping: true, loading: false, audible: false });
  return { ok: true };
});
handle('cove:clear-space-data', request => siteData.clearSpace(request));

handle('cove:navigate', target => {
  if (!target || !validId(target.tabId) || (target.url !== HOME && !isWebUrl(target.url))) throw new Error('Invalid address.');
  if (target.url === HOME) { destroyTab(target.tabId); return; }
  const entry = tabs.get(target.tabId);
  if (entry) { entry.requestedUrl = target.url; entry.view.webContents.loadURL(target.url).catch(() => {}); }
});
for (const action of ['back', 'forward', 'reload']) handle(`cove:${action}`, id => {
  if (!validId(id)) throw new Error('Invalid tab.');
  const contents = tabs.get(id)?.view.webContents;
  if (!contents || contents.isDestroyed()) return;
  if (action === 'back' && contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
  if (action === 'forward' && contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
  if (action === 'reload') contents.reload();
});

function tabContents(id) {
  if (!validId(id)) throw new Error('Invalid tab.');
  const contents = tabs.get(id)?.view.webContents;
  return contents && !contents.isDestroyed() ? contents : null;
}

function pageContents(id) {
  const contents = tabContents(id);
  if (!contents) throw new Error('Open a web page first.');
  return contents;
}

handle('cove:stop', id => { pageContents(id).stop(); });
handle('cove:hard-reload', id => { pageContents(id).reloadIgnoringCache(); });

async function pageOutput(action) {
  if ([...knownSpaces].some(spaceId => siteData.isClearing(spaceId))) throw new Error('A space reset is in progress.');
  if (pageOutputPending) throw new Error('A print or PDF request is already in progress.');
  pageOutputPending = true;
  try { return await action(); }
  finally { pageOutputPending = false; }
}

handle('cove:open-devtools', id => {
  pageContents(id).openDevTools({ mode: 'detach' });
  return { success: true };
});
handle('cove:print-page', id => {
  const contents = pageContents(id);
  return pageOutput(() => new Promise((resolve, reject) => {
    contents.print({ silent: false }, (success, reason) => {
      if (success) resolve({ success: true });
      else if (/cancel/i.test(reason || '')) resolve({ cancelled: true });
      else reject(new Error(`Print failed: ${reason || 'Unknown printing error.'}`));
    });
  }));
});
handle('cove:save-pdf', id => {
  const contents = pageContents(id);
  const parent = mainWindow;
  const assertLive = () => {
    if (parent.isDestroyed() || mainWindow !== parent || pageContents(id) !== contents) throw new Error('This page closed before the PDF could be saved.');
  };
  return pageOutput(async () => {
    const result = await dialog.showSaveDialog(parent, {
      title: 'Save Page as PDF',
      defaultPath: path.join(app.getPath('downloads'), 'page.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
      properties: ['showOverwriteConfirmation']
    });
    if (result.canceled) return { cancelled: true };
    if (typeof result.filePath !== 'string' || result.filePath.includes('\0') || !path.isAbsolute(result.filePath)) throw new Error('No valid PDF save location was selected.');
    assertLive();
    const data = await contents.printToPDF({ printBackground: true });
    assertLive();
    await fs.writeFile(result.filePath, data);
    return { success: true };
  });
});

handle('cove:find-in-page', target => {
  if (!target || typeof target.text !== 'string' || !target.text.length || target.text.length > 16000 || typeof target.forward !== 'boolean') throw new Error('Invalid find request.');
  const contents = tabContents(target.tabId);
  if (!contents) return null;
  const entry = tabs.get(target.tabId);
  const findNext = entry.findText === target.text;
  entry.findText = target.text;
  entry.findRequestId = contents.findInPage(target.text, { forward: target.forward, findNext });
  return entry.findRequestId;
});
handle('cove:stop-find', id => {
  const contents = tabContents(id);
  if (!contents) return;
  Object.assign(tabs.get(id), { findText: null, findRequestId: null });
  contents.stopFindInPage('clearSelection');
  emit({ type: 'find-result', id, matches: 0, activeMatchOrdinal: 0 });
});
handle('cove:set-zoom', target => {
  if (!target) throw new Error('Invalid zoom request.');
  const factor = clampZoom(target.factor);
  const contents = tabContents(target.tabId);
  if (!contents) return null;
  contents.setZoomFactor(factor);
  status(target.tabId);
  return contents.getZoomFactor();
});
handle('cove:set-muted', target => {
  if (!target || typeof target.muted !== 'boolean') throw new Error('Invalid mute request.');
  const contents = tabContents(target.tabId);
  if (!contents) return null;
  contents.setAudioMuted(target.muted);
  status(target.tabId);
  return contents.isAudioMuted();
});
handle('cove:get-downloads', downloadRecords);
handle('cove:open-private-window', async () => {
  await launchPrivate({ execPath: process.execPath, appPath: app.getAppPath(), isPackaged: app.isPackaged, env: process.env });
  return true;
});
function siteTarget(id) {
  if (!validId(id)) throw new Error('Invalid tab.');
  const entry = tabs.get(id);
  if (!entry || entry.view.webContents.isDestroyed()) throw new Error('Open a web page to manage its permissions.');
  return { spaceId: entry.spaceId, url: entry.view.webContents.getURL() };
}
handle('cove:get-site-permissions', id => {
  const target = siteTarget(id);
  return permissions.get(target.spaceId, target.url);
});
handle('cove:set-site-permission', request => {
  if (!request) throw new Error('Invalid permission request.');
  const target = siteTarget(request.tabId);
  if (request.origin !== new URL(target.url).origin) throw new Error('This page changed. Reopen site controls before changing permissions.');
  permissions.set(target.spaceId, target.url, request.permission, request.allowed);
  if (request.permission === 'media' && request.allowed === true) {
    for (const entry of tabs.values()) {
      if (entry.spaceId === target.spaceId && !entry.view.webContents.isDestroyed() && permissions.get(entry.spaceId, entry.view.webContents.getURL()).origin === request.origin) entry.mediaProtected = true;
    }
  }
  return permissions.get(target.spaceId, target.url);
});
handle('cove:clear-site-permissions', request => {
  if (!request) throw new Error('Invalid permission request.');
  const target = siteTarget(request.tabId);
  if (request.origin !== new URL(target.url).origin) throw new Error('This page changed. Reopen site controls before changing permissions.');
  permissions.clear(target.spaceId, target.url);
  return permissions.get(target.spaceId, target.url);
});
handle('cove:cancel-download', id => {
  if (!validId(id)) throw new Error('Invalid download.');
  const entry = downloads.get(id);
  if (!entry || entry.done) return false;
  entry.item.cancel();
  return true;
});
handle('cove:show-download', id => {
  if (!validId(id)) throw new Error('Invalid download.');
  const entry = downloads.get(id);
  if (!entry?.done || entry.record.state !== 'completed' || !entry.savePath || !path.isAbsolute(entry.savePath)) return false;
  shell.showItemInFolder(entry.savePath);
  return true;
});

function createWindow() {
  mainWindow = new BrowserWindow({ title: privateMode ? 'Cove Private' : 'Cove', width: 1440, height: 940, minWidth: 850, minHeight: 650, backgroundColor: '#dce7df', titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 21, y: 23 }, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), ...(privateMode ? { partition: 'cove-private-shell', additionalArguments: ['--cove-private'] } : {}), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => { if (!isShellUrl(url, shellUrl)) event.preventDefault(); });
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.webContents.on('before-input-event', shortcut);
  mainWindow.on('closed', () => { for (const id of [...tabs.keys()]) destroyTab(id); mainWindow = null; attached.clear(); selectedIds.clear(); sleepingTabs.clear(); });
  mainWindow.loadURL(shellUrl);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ label: 'Cove', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: 'File', submenu: [
      { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => menuShortcut('new-tab') },
      { label: 'New Private Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => menuShortcut('private-window') },
      { label: 'Restore Closed Tab', accelerator: 'CmdOrCtrl+Shift+T', click: () => menuShortcut('restore-tab') },
      { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => menuShortcut('close-tab') },
      { label: 'Next Tab', accelerator: 'Ctrl+Tab', click: () => menuShortcut('next-tab') },
      { label: 'Previous Tab', accelerator: 'Ctrl+Shift+Tab', click: () => menuShortcut('previous-tab') },
      { type: 'separator' },
      { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => menuShortcut('print') },
      { label: 'Save as PDF…', click: () => menuShortcut('save-pdf') },
      ...(process.platform === 'darwin' ? [] : [{ type: 'separator' }, { role: 'quit' }])
    ] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo', accelerator: 'CmdOrCtrl+Shift+Z' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [
      ...[['Find in Page', 'CmdOrCtrl+F', 'find'], ['History', 'CmdOrCtrl+Y', 'history'], ['Reload', 'CmdOrCtrl+R', 'reload'], ['Zoom In', 'CmdOrCtrl+Plus', 'zoom-in'], ['Zoom Out', 'CmdOrCtrl+-', 'zoom-out'], ['Actual Size', 'CmdOrCtrl+0', 'zoom-reset'], ['Page Developer Tools', 'CmdOrCtrl+Alt+I', 'devtools']].map(([label, accelerator, command]) => ({ label, accelerator, click: () => menuShortcut(command) })),
      { role: 'togglefullscreen' }
    ] },
    { label: 'Window', submenu: [{ role: 'minimize' }, ...(process.platform === 'darwin' ? [{ role: 'zoom' }, { role: 'front' }] : [])] }
  ]));
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (privateMode || process.platform !== 'darwin') app.quit(); });
