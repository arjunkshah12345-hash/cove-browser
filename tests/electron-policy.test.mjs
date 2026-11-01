import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { isWebUrl, validId, rendererLocation, isShellUrl, clampBounds, clampZoom, shortcutCommand } = require('../electron/policy.cjs');

test('guest URL policy rejects local files, executable URLs and embedded credentials', () => {
  for (const value of ['https://example.com', 'http://127.0.0.1:8080']) assert.ok(isWebUrl(value));
  for (const value of ['file:///tmp/private', 'data:text/html,hi', 'javascript:alert(1)', 'https://u:p@example.com', 'cove://newtab', null, 'https://']) assert.equal(isWebUrl(value), false);
});
test('partition identifiers cannot escape their namespace', () => {
  assert.ok(validId('personal')); assert.ok(validId('abc-123_def'));
  for (const value of ['../secrets', 'x:y', '', null, 'x'.repeat(81)]) assert.equal(validId(value), false);
});
test('only local HTTP origins are accepted as development renderer', () => {
  assert.equal(rendererLocation(undefined, '/tmp/dist/index.html'), 'file:///tmp/dist/index.html');
  assert.equal(rendererLocation('http://127.0.0.1:5173', '/x'), 'http://127.0.0.1:5173/');
  for (const value of ['https://example.com', 'http://example.com', 'file:///tmp/x', 'http://user:pass@localhost']) assert.throws(() => rendererLocation(value, '/x'));
});
test('renderer policy does not trust opaque null origins or unrelated file paths', () => {
  const shell = 'file:///tmp/dist/index.html';
  assert.ok(isShellUrl(shell, shell));
  assert.ok(isShellUrl(`${shell}#home`, shell));
  for (const value of ['data:text/html,x', 'file:///tmp/private.html', 'https://example.com', 'cove://newtab']) assert.equal(isShellUrl(value, shell), false);
  assert.ok(isShellUrl('http://127.0.0.1:5173/', 'http://127.0.0.1:5173/'));
  assert.equal(isShellUrl('http://127.0.0.1:5174/', 'http://127.0.0.1:5173/'), false);
});
test('native bounds are finite positive integers contained in the browser window', () => {
  const viewport = { width: 1000, height: 800 };
  assert.deepEqual(clampBounds({ x: 250.3, y: 50, width: 9999, height: 900 }, viewport), { x: 250, y: 50, width: 750, height: 750 });
  assert.equal(clampBounds({ x: NaN, y: 0, width: 10, height: 10 }, viewport), null);
  assert.equal(clampBounds({ x: 1001, y: 0, width: 10, height: 10 }, viewport), null);
});

test('zoom policy clamps finite numbers and rejects coercion', () => {
  for (const [value, expected] of [[-1, 0.5], [0.5, 0.5], [1.25, 1.25], [2, 2], [100, 2]]) assert.equal(clampZoom(value), expected);
  for (const value of [NaN, Infinity, -Infinity, '1', null, undefined, {}, []]) assert.throws(() => clampZoom(value));
});

test('shortcut policy distinguishes restore and tab cycling before generic commands', () => {
  const input = { type: 'keyDown', key: 't', control: true };
  assert.equal(shortcutCommand(input), 'new-tab');
  assert.equal(shortcutCommand({ ...input, shift: true }), 'restore-tab');
  assert.equal(shortcutCommand({ ...input, key: 'n', shift: true }), 'private-window');
  assert.equal(shortcutCommand({ ...input, key: 'n' }), null);
  for (const [key, command] of [['f', 'find'], ['y', 'history'], ['j', 'downloads'], ['r', 'reload'], ['+', 'zoom-in'], ['=', 'zoom-in'], ['-', 'zoom-out'], ['0', 'zoom-reset'], ['Tab', 'next-tab']]) assert.equal(shortcutCommand({ ...input, key }), command);
  assert.equal(shortcutCommand({ ...input, key: 'Tab', shift: true }), 'previous-tab');
  assert.equal(shortcutCommand({ ...input, control: false, meta: true, key: 'F' }), 'find');
  for (const overrides of [{ type: 'keyUp' }, { alt: true }, { meta: true }, { control: false }, { key: 'constructor' }, { key: '__proto__' }, { key: 'Tab', control: false, meta: true }]) assert.equal(shortcutCommand({ ...input, ...overrides }), null);
});

async function nativeHarness() {
  const handlers = new Map();
  const sessions = new Map();
  const views = [];
  const updates = [];
  const menus = [];
  const revealed = [];
  const dialogs = [];
  const writes = [];
  let window;
  let requestId = 0;
  class Contents extends EventEmitter {
    constructor() {
      super();
      this.mainFrame = { url: '' };
      this.zoom = 1;
      this.muted = false;
      this.audible = false;
      this.destroyed = false;
      this.navigationHistory = { canGoBack: () => false, canGoForward: () => false };
    }
    isDestroyed() { return this.destroyed; }
    isFocused() { return !!this.focused; }
    send(_channel, update) { updates.push(update); }
    getZoomFactor() { return this.zoom; }
    setZoomFactor(factor) { this.zoom = factor; }
    setZoomMode(mode) { this.zoomMode = mode; }
    isAudioMuted() { return this.muted; }
    setAudioMuted(muted) { this.muted = muted; }
    isCurrentlyAudible() { return this.audible; }
    isLoading() { return !!this.loading; }
    isBeingCaptured() { return !!this.captured; }
    isDevToolsOpened() { return !!this.devTools; }
    setWindowOpenHandler(handler) { this.openWindow = handler; }
    loadURL(url) { this.mainFrame.url = url; return Promise.resolve(); }
    getURL() { return this.mainFrame.url; }
    getTitle() { return 'Native test page'; }
    findInPage(text, options) { this.find = { text, ...options }; return ++requestId; }
    stopFindInPage(action) { this.stopped = action; }
    close() { this.destroyed = true; }
    stop() { this.stopCalls = (this.stopCalls || 0) + 1; }
    reloadIgnoringCache() { this.hardReloadCalls = (this.hardReloadCalls || 0) + 1; }
    copy() { this.editAction = 'copy'; }
    paste() { this.editAction = 'paste'; }
    selectAll() { this.editAction = 'selectAll'; }
    openDevTools(options) { this.devTools = options; }
    inspectElement(x, y) { this.inspected = { x, y }; }
    print(options, callback) { this.printOptions = options; callback(true); }
    async printToPDF(options) { this.pdfOptions = options; return Buffer.from('mock PDF'); }
  }
  const app = new EventEmitter();
  Object.assign(app, { setName() {}, getPath: () => '/tmp/cove-downloads', whenReady: () => Promise.resolve() });
  class Window extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.webContents = new Contents();
      this.contentView = { addChildView() {}, removeChildView() {} };
      window = this;
    }
    isDestroyed() { return !!this.destroyed; }
    getContentBounds() { return { width: 1440, height: 940 }; }
    loadURL(url) { return this.webContents.loadURL(url); }
  }
  class View {
    constructor(options) { this.options = options; this.webContents = new Contents(); views.push(this); }
    setBounds(bounds) { this.bounds = bounds; }
  }
  const electron = {
    app, BrowserWindow: Window, WebContentsView: View,
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    shell: { showItemInFolder: filename => revealed.push(filename) },
    dialog: { async showSaveDialog(parent, options) { dialogs.push({ parent, options }); return { canceled: false, filePath: '/tmp/chosen.pdf' }; } },
    Menu: { setApplicationMenu(menu) { electron.applicationMenu = menu; }, buildFromTemplate(template) { const menu = { template, popup() { menu.popped = true; } }; menus.push(menu); return menu; } },
    session: { fromPartition(partition) {
      if (!sessions.has(partition)) {
        const target = new EventEmitter();
        Object.assign(target, { setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, setDisplayMediaRequestHandler() {}, clears: [], async clearStorageData() { this.clears.push('storage'); }, async clearCache() { this.clears.push('cache'); }, async clearAuthCache() { this.clears.push('auth'); } });
        sessions.set(partition, target);
      }
      return sessions.get(partition);
    } }
  };
  const filename = new URL('../electron/main.cjs', import.meta.url);
  const files = { async writeFile(filename, data) { writes.push({ filename, data }); } };
  vm.runInNewContext(readFileSync(filename, 'utf8'), { require: name => name === 'electron' ? electron : name === 'node:fs/promises' ? files : require(name.startsWith('./') ? `../electron/${name.slice(2)}` : name), __dirname: path.dirname(filename.pathname), process: { platform: 'darwin', env: {} }, URL, console });
  await Promise.resolve();
  const invoke = (channel, payload, event = { sender: window.webContents, senderFrame: window.webContents.mainFrame }) => handlers.get(`cove:${channel}`)(event, payload);
  const addTab = (id = 'tab-1', spaceId = 'space-1') => {
    invoke('sync-tabs', [{ id, spaceId, url: 'https://example.com' }]);
    invoke('layout', { hidden: false, panes: [{ tabId: id, x: 0, y: 0, width: 800, height: 600 }] });
    return views.at(-1).webContents;
  };
  return { invoke, addTab, handlers, sessions, updates, menus, revealed, views, window, electron, dialogs, writes, files };
}

test('manual sleeping protects modal-hidden split selections and recreates inactive pages with preferences', async () => {
  const native = await nativeHarness();
  const list = ['one', 'two', 'three'].map(id => ({ id, spaceId: 'space-1', url: `https://${id}.example/` }));
  native.invoke('sync-tabs', list);
  const pane = tabId => ({ tabId, x: 0, y: 0, width: 600, height: 500 });
  native.invoke('layout', { hidden: false, panes: [pane('one'), pane('two')] });
  const first = native.views[0].webContents;
  first.setAudioMuted(true);
  first.setZoomFactor(1.4);
  native.invoke('layout', { hidden: true, panes: [pane('one'), pane('two')] });
  assert.equal(native.invoke('sleep-tab', 'one').ok, false);
  assert.equal(native.invoke('sleep-tab', 'two').ok, false);
  native.invoke('layout', { hidden: false, panes: [pane('three')] });
  assert.equal(native.invoke('sleep-tab', 'one').ok, true);
  assert.equal(first.destroyed, true);
  assert.equal(native.invoke('get-tab-resources').find(entry => entry.id === 'one').sleeping, true);
  native.invoke('layout', { hidden: false, panes: [pane('one')] });
  const restored = native.views.at(-1).webContents;
  restored.setZoomFactor(1);
  restored.emit('did-finish-load');
  assert.equal(restored.getZoomFactor(), 1.4);
  assert.equal(restored.isAudioMuted(), true);
  assert.equal(native.invoke('get-tab-resources').find(entry => entry.id === 'one').sleeping, false);
});

test('manual sleep rejects unsafe resource states and untrusted IPC callers', async () => {
  const native = await nativeHarness();
  const contents = native.addTab('one');
  native.invoke('sync-tabs', [{ id: 'one', spaceId: 'space-1', url: 'https://example.com' }, { id: 'two', spaceId: 'space-1', url: 'https://two.example/' }]);
  native.invoke('layout', { hidden: false, panes: [{ tabId: 'two', x: 0, y: 0, width: 500, height: 500 }] });
  for (const property of ['audible', 'loading', 'devTools', 'captured']) {
    contents[property] = true;
    assert.equal(native.invoke('sleep-tab', 'one').ok, false, property);
    contents[property] = false;
  }
  native.invoke('set-site-permission', { tabId: 'one', origin: 'https://example.com', permission: 'media', allowed: true });
  assert.equal(native.invoke('sleep-tab', 'one').ok, false, 'media permission conservatively protects capture');
  native.invoke('clear-site-permissions', { tabId: 'one', origin: 'https://example.com' });
  assert.equal(native.invoke('sleep-tab', 'one').ok, false, 'revocation does not guarantee active streams stopped');
  contents.emit('did-navigate', null, 'https://example.com');
  assert.equal(native.invoke('get-tab-resources').find(entry => entry.id === 'one').canSleep, true);
  assert.equal(native.invoke('sleep-tab', '../bad').ok, false);
  assert.throws(() => native.invoke('sleep-tab', 'one', { sender: contents, senderFrame: contents.mainFrame }), /Untrusted/);
  assert.throws(() => native.invoke('clear-space-data', { spaceId: 'space-1', confirmed: true }, { sender: contents, senderFrame: contents.mainFrame }), /Untrusted/);
});

test('space reset requires known namespace and confirmation, removes only its native guests and data', async () => {
  const native = await nativeHarness();
  native.invoke('sync-tabs', [{ id: 'one', spaceId: 'space-1', url: 'https://one.example/' }, { id: 'two', spaceId: 'space-2', url: 'https://two.example/' }]);
  const pane = tabId => ({ tabId, x: 0, y: 0, width: 500, height: 500 });
  native.invoke('layout', { hidden: false, panes: [pane('one'), pane('two')] });
  const count = native.sessions.size;
  assert.equal((await native.invoke('clear-space-data', { spaceId: 'arbitrary', confirmed: true })).ok, false);
  assert.equal((await native.invoke('clear-space-data', { spaceId: 'space-1', confirmed: false })).ok, false);
  assert.equal(native.sessions.size, count);
  const pending = native.invoke('clear-space-data', { spaceId: 'space-1', confirmed: true });
  native.invoke('layout', { hidden: false, panes: [pane('one'), pane('two')] });
  assert.equal(native.views.length, 2, 'reset blocks recreation while clearing');
  assert.equal((await pending).ok, true);
  assert.equal(native.views[0].webContents.destroyed, true);
  assert.equal(native.views[1].webContents.destroyed, false);
  assert.deepEqual(native.sessions.get('persist:cove-space-1').clears, ['storage', 'cache', 'auth']);
  assert.deepEqual(native.sessions.get('persist:cove-space-2').clears, []);
  assert.equal(native.updates.some(event => event.type === 'space-data-cleared' && event.spaceId === 'space-1' && event.ok), true);
});

test('preload exposes only named IPC methods, defaults find direction and strips event objects', async () => {
  const calls = [];
  const ipcRenderer = new EventEmitter();
  ipcRenderer.invoke = (channel, payload) => { calls.push({ channel, payload }); return Promise.resolve(); };
  let api;
  vm.runInNewContext(readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8'), { process: { argv: [] }, require: () => ({ contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } }, ipcRenderer }) });
  assert.equal(api.isPrivate, false);
  for (const [method, channel] of [['sleepTab', 'sleep-tab'], ['printPage', 'print-page'], ['savePdf', 'save-pdf'], ['openDevTools', 'open-devtools'], ['stop', 'stop'], ['hardReload', 'hard-reload']]) {
    await api[method]('one', '/tmp/renderer-controlled.pdf');
    assert.equal(calls.at(-1).channel, `cove:${channel}`);
    assert.equal(calls.at(-1).payload, 'one');
  }
  api.findInPage({ tabId: 'one', text: 'hello' });
  assert.equal(calls.at(-1).payload.forward, true);
  await api.getTabResources('ignored');
  assert.equal(calls.at(-1).channel, 'cove:get-tab-resources');
  assert.equal(calls.at(-1).payload, undefined);
  const clearRequest = { spaceId: 'space-1', confirmed: true };
  await api.clearSpaceData(clearRequest);
  assert.equal(calls.at(-1).channel, 'cove:clear-space-data');
  assert.equal(calls.at(-1).payload, clearRequest);
  for (const [method, channel, payload] of [['openPrivateWindow', 'open-private-window', undefined], ['getSitePermissions', 'get-site-permissions', 'one'], ['setSitePermission', 'set-site-permission', { tabId: 'one', origin: 'https://example.com', permission: 'geolocation', allowed: true }], ['clearSitePermissions', 'clear-site-permissions', { tabId: 'one', origin: 'https://example.com' }], ['stopFind', 'stop-find', 'one'], ['setZoom', 'set-zoom', { tabId: 'one', factor: 1 }], ['setMuted', 'set-muted', { tabId: 'one', muted: true }], ['getDownloads', 'get-downloads', undefined], ['cancelDownload', 'cancel-download', 'download'], ['showDownload', 'show-download', 'download']]) {
    await api[method](payload);
    assert.equal(calls.at(-1).channel, `cove:${channel}`);
    assert.equal(calls.at(-1).payload, payload);
  }
  let received;
  const unsubscribe = api.onTabUpdate(update => { received = update; });
  ipcRenderer.emit('cove:tab-update', { privileged: true }, { type: 'find-result' });
  assert.deepEqual(received, { type: 'find-result' });
  unsubscribe();
  assert.equal(ipcRenderer.listenerCount('cove:tab-update'), 0);
  assert.ok(Object.isFrozen(api));
});

test('preload identifies private windows only from the explicit process argument', () => {
  for (const [argv, expected] of [[['electron', '--cove-private'], true], [['electron', '--cove-private=false'], false]]) {
    let api;
    vm.runInNewContext(readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8'), { process: { argv }, require: () => ({ contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } }, ipcRenderer: {} }) });
    assert.equal(api.isPrivate, expected);
  }
});

test('site controls bind mutations to the live tab origin and validate allowances', async () => {
  const native = await nativeHarness();
  const contents = native.addTab();
  const request = { tabId: 'tab-1', origin: 'https://example.com', permission: 'geolocation', allowed: true };
  assert.equal(native.invoke('get-site-permissions', 'tab-1').permissions.geolocation, false);
  assert.equal(native.invoke('set-site-permission', request).permissions.geolocation, true);
  for (const invalid of [{ allowed: 'yes' }, { permission: 'display-capture' }, { tabId: '../bad' }, { tabId: 'missing' }]) assert.throws(() => native.invoke('set-site-permission', { ...request, ...invalid }));
  contents.mainFrame.url = 'https://elsewhere.example/path';
  assert.throws(() => native.invoke('set-site-permission', request), /page changed/);
  assert.throws(() => native.invoke('clear-site-permissions', request), /page changed/);
  assert.equal(native.invoke('get-site-permissions', 'tab-1').permissions.geolocation, false);
  contents.mainFrame.url = 'https://example.com/other';
  assert.equal(native.invoke('clear-site-permissions', request).permissions.geolocation, false);
  contents.destroyed = true;
  assert.throws(() => native.invoke('get-site-permissions', 'tab-1'), /Open a web page/);
});

test('all native IPC rejects guest frames, subframes and navigated shell frames', async () => {
  const native = await nativeHarness();
  for (const handler of native.handlers.values()) {
    for (const event of [{ sender: {}, senderFrame: native.window.webContents.mainFrame }, { sender: native.window.webContents, senderFrame: { url: native.window.webContents.mainFrame.url } }]) assert.throws(() => handler(event, null), /Untrusted/);
    const shellFrame = native.window.webContents.mainFrame;
    const originalUrl = shellFrame.url;
    shellFrame.url = 'https://evil.example';
    assert.throws(() => handler({ sender: native.window.webContents, senderFrame: shellFrame }, null), /Untrusted/);
    shellFrame.url = originalUrl;
  }
  assert.equal(native.window.options.webPreferences.sandbox, true);
  assert.equal(native.window.options.webPreferences.contextIsolation, true);
});

test('find requests, audio state and clamped zoom use guarded guest contents', async () => {
  const native = await nativeHarness();
  const contents = native.addTab();
  const firstRequest = native.invoke('find-in-page', { tabId: 'tab-1', text: 'hello', forward: true });
  assert.equal(contents.find.findNext, false);
  const secondRequest = native.invoke('find-in-page', { tabId: 'tab-1', text: 'hello', forward: false });
  assert.equal(contents.find.findNext, true);
  assert.equal(contents.find.forward, false);
  const beforeStale = native.updates.length;
  contents.emit('found-in-page', {}, { requestId: firstRequest, matches: 9, activeMatchOrdinal: 9 });
  assert.equal(native.updates.length, beforeStale);
  contents.emit('found-in-page', {}, { requestId: secondRequest, matches: 3, activeMatchOrdinal: 2 });
  assert.deepEqual({ ...native.updates.at(-1) }, { type: 'find-result', id: 'tab-1', matches: 3, activeMatchOrdinal: 2 });
  native.invoke('stop-find', 'tab-1');
  assert.equal(contents.stopped, 'clearSelection');
  assert.equal(native.updates.at(-1).matches, 0);
  assert.equal(native.invoke('set-zoom', { tabId: 'tab-1', factor: 10 }), 2);
  assert.equal(native.updates.at(-1).zoom, 2);
  assert.equal(native.invoke('set-zoom', { tabId: 'tab-1', factor: -10 }), 0.5);
  native.invoke('set-muted', { tabId: 'tab-1', muted: true });
  assert.equal(native.updates.at(-1).muted, true);
  contents.audible = true;
  contents.emit('audio-state-changed', {});
  assert.equal(native.updates.at(-1).audible, true);
  contents.emit('zoom-changed', {}, 'in');
  assert.equal(native.updates.at(-1).zoom, 0.6);
  for (const payload of [{ tabId: '../bad', text: 'hello', forward: true }, { tabId: 'tab-1', text: '', forward: true }, { tabId: 'tab-1', text: 'x'.repeat(16001), forward: true }, { tabId: 'tab-1', text: 'hello', forward: 'yes' }]) assert.throws(() => native.invoke('find-in-page', payload));
  assert.throws(() => native.invoke('set-muted', { tabId: 'tab-1', muted: 'yes' }));
  assert.throws(() => native.invoke('set-zoom', { tabId: 'tab-1', factor: NaN }));
  assert.equal(native.views[0].options.webPreferences.nodeIntegration, false);
  assert.equal(native.views[0].options.webPreferences.sandbox, true);
  assert.equal(contents.zoomMode, 'manual');
});

test('popup and context-menu tabs retain source space and reject unsafe link schemes', async () => {
  const native = await nativeHarness();
  const contents = native.addTab('background', 'original-space');
  assert.equal(contents.openWindow({ url: 'https://example.org' }).action, 'deny');
  assert.equal(native.updates.at(-1).spaceId, 'original-space');
  for (const url of ['javascript:alert(1)', 'file:///tmp/a', 'data:text/html,bad', 'https://user:pass@example.org']) {
    const before = native.updates.length;
    contents.openWindow({ url });
    assert.equal(native.updates.length, before);
    contents.emit('context-menu', {}, { linkURL: url, editFlags: {} });
    assert.equal(native.menus.at(-1).template.some(item => item.label === 'Open Link in New Tab'), false);
  }
  contents.emit('context-menu', {}, { linkURL: 'https://example.org', isEditable: true, editFlags: { canCopy: true, canPaste: true, canSelectAll: true } });
  const menu = native.menus.at(-1);
  assert.ok(menu.popped);
  menu.template.find(item => item.label === 'Open Link in New Tab').click();
  assert.equal(native.updates.at(-1).spaceId, 'original-space');
  for (const [label, expected] of [['Copy', 'copy'], ['Paste', 'paste'], ['Select All', 'selectAll']]) {
    const action = menu.template.find(item => item.label === label);
    assert.ok(action.enabled);
    action.click();
    assert.equal(contents.editAction, expected);
  }
});

test('history events come only from main-frame did-navigate, not titles or in-page changes', async () => {
  const native = await nativeHarness();
  const contents = native.addTab();
  contents.emit('page-title-updated', {}, 'New title');
  contents.emit('did-navigate-in-page', {}, 'https://example.com/#section', true);
  contents.emit('did-navigate-in-page', {}, 'https://example.com/iframe', false);
  assert.equal(native.updates.some(update => update.type === 'navigation'), false);
  contents.emit('did-navigate', {}, 'https://example.com/next');
  const navigation = native.updates.at(-1);
  assert.equal(navigation.type, 'navigation');
  assert.equal(navigation.id, 'tab-1');
  assert.equal(navigation.spaceId, 'space-1');
  assert.equal(navigation.title, 'Native test page');
  assert.equal(navigation.url, 'https://example.com/next');
  assert.ok(Number.isFinite(navigation.visitedAt));
});

test('native shortcut interception prevents menu duplication and menu zoom delegates to shell', async () => {
  const native = await nativeHarness();
  const contents = native.addTab();
  for (const sender of [contents, native.window.webContents]) {
    const before = native.updates.length;
    let prevented = 0;
    sender.emit('before-input-event', { preventDefault() { prevented++; } }, { type: 'keyDown', key: 't', meta: true, shift: true });
    assert.equal(prevented, 1);
    assert.equal(native.updates.length, before + 1);
    assert.equal(native.updates.at(-1).command, 'restore-tab');
    assert.equal(native.updates.at(-1).id, sender === contents ? 'tab-1' : undefined);
  }
  contents.focused = true;
  contents.emit('focus');
  assert.deepEqual(JSON.parse(JSON.stringify(native.updates.at(-1))), { type: 'focus-tab', id: 'tab-1' });
  let downloadsPrevented = 0;
  const beforeDownloads = native.updates.length;
  contents.emit('before-input-event', { preventDefault() { downloadsPrevented++; } }, { type: 'keyDown', key: 'j', meta: true });
  assert.equal(downloadsPrevented, 1);
  assert.equal(native.updates.length, beforeDownloads + 1);
  assert.deepEqual(JSON.parse(JSON.stringify(native.updates.at(-1))), { type: 'shortcut', command: 'downloads', id: 'tab-1' });
  const entries = native.electron.applicationMenu.template.flatMap(item => item.submenu || []);
  const accelerators = entries.filter(item => item.accelerator).map(item => item.accelerator);
  assert.equal(new Set(accelerators).size, accelerators.length);
  assert.equal(entries.some(item => ['zoomIn', 'zoomOut', 'resetZoom'].includes(item.role)), false);
  assert.equal(native.electron.applicationMenu.template.some(item => ['editMenu', 'windowMenu'].includes(item.role)), false);
  assert.equal(entries.filter(item => item.role === 'quit').length, 1);
  assert.equal(entries.find(item => item.role === 'redo').accelerator, 'CmdOrCtrl+Shift+Z');
  entries.find(item => item.label === 'Zoom In').click();
  assert.equal(native.updates.at(-1).command, 'zoom-in');
  assert.equal(native.window.webContents.zoom, 1);
});

function fakeDownload() {
  const item = new EventEmitter();
  Object.assign(item, {
    received: 0, total: 100, cancelled: false,
    getFilename: () => '../example.zip', getTotalBytes() { return this.total; }, getReceivedBytes() { return this.received; },
    getSavePath: () => '/tmp/cove-downloads/example.zip', setSaveDialogOptions(options) { this.saveOptions = options; },
    cancel() { this.cancelled = true; this.emit('done', {}, 'cancelled'); }
  });
  return item;
}

test('downloads preserve save dialogs, track lifecycle, cancel safely and only reveal completed files', async () => {
  const native = await nativeHarness();
  native.addTab();
  const target = native.sessions.get('persist:cove-space-1');
  const item = fakeDownload();
  target.emit('will-download', {}, item);
  assert.equal(item.saveOptions.defaultPath, '/tmp/cove-downloads/example.zip');
  let record = native.invoke('get-downloads')[0];
  assert.equal(record.filename, 'example.zip');
  assert.equal(record.state, 'progressing');
  assert.ok(Number.isFinite(record.startedAt));
  assert.equal(native.invoke('show-download', record.id), false);
  item.received = 50;
  item.emit('updated', {}, 'interrupted');
  assert.equal(native.updates.at(-1).type, 'downloads');
  assert.equal(native.invoke('get-downloads')[0].receivedBytes, 50);
  assert.equal(native.invoke('get-downloads')[0].state, 'interrupted');
  item.emit('updated', {}, 'progressing');
  item.received = 100;
  item.emit('done', {}, 'completed');
  assert.equal(native.invoke('show-download', record.id), true);
  assert.deepEqual(native.revealed, ['/tmp/cove-downloads/example.zip']);
  assert.equal(native.invoke('cancel-download', record.id), false);
  record.state = 'cancelled';
  assert.equal(native.invoke('get-downloads')[0].state, 'completed');
  const cancelled = fakeDownload();
  target.emit('will-download', {}, cancelled);
  record = native.invoke('get-downloads').at(-1);
  assert.equal(native.invoke('cancel-download', record.id), true);
  assert.equal(cancelled.cancelled, true);
  assert.equal(native.invoke('get-downloads').at(-1).state, 'cancelled');
  assert.equal(native.invoke('show-download', record.id), false);
  assert.throws(() => native.invoke('show-download', '/tmp/arbitrary'));
  assert.equal(native.invoke('show-download', 'unknown'), false);
});

test('download records never exceed 100 or evict in-flight native items', async () => {
  const native = await nativeHarness();
  native.addTab();
  const target = native.sessions.get('persist:cove-space-1');
  const items = Array.from({ length: 100 }, fakeDownload);
  for (const item of items) target.emit('will-download', {}, item);
  let prevented = false;
  target.emit('will-download', { preventDefault() { prevented = true; } }, fakeDownload());
  assert.ok(prevented);
  assert.equal(native.invoke('get-downloads').length, 100);
  const oldestId = native.invoke('get-downloads')[0].id;
  items[0].emit('done', {}, 'interrupted');
  target.emit('will-download', { preventDefault() { assert.fail('completed record can be evicted'); } }, fakeDownload());
  const records = native.invoke('get-downloads');
  assert.equal(records.length, 100);
  assert.equal(records.some(record => record.id === oldestId), false);
});

test('print and DevTools shortcuts recognize only intended modifier combinations', () => {
  for (const modifier of ['control', 'meta']) {
    const input = { type: 'keyDown', [modifier]: true };
    assert.equal(shortcutCommand({ ...input, key: 'p' }), 'print');
    assert.equal(shortcutCommand({ ...input, key: 'I', alt: true }), 'devtools');
    for (const overrides of [{ key: 'p', shift: true }, { key: 'p', alt: true }, { key: 'i' }, { key: 'i', alt: true, shift: true }, { key: 'i', alt: true, type: 'keyUp' }]) assert.equal(shortcutCommand({ ...input, ...overrides }), null);
  }
});

test('page actions reject invalid, unknown, home and destroyed guests without side effects', async () => {
  const native = await nativeHarness();
  const contents = native.addTab();
  for (const channel of ['print-page', 'save-pdf', 'open-devtools']) {
    for (const id of ['../page', null, {}, { tabId: 'tab-1', path: '/tmp/unsafe.pdf' }, 'missing', 'home']) assert.throws(() => native.invoke(channel, id));
  }
  contents.destroyed = true;
  for (const channel of ['print-page', 'save-pdf', 'open-devtools']) assert.throws(() => native.invoke(channel, 'tab-1'), /Open a web page/);
  assert.equal(native.dialogs.length, 0);
  assert.equal(native.writes.length, 0);
  assert.equal(contents.devTools, undefined);
  assert.equal(contents.printOptions, undefined);
});

test('DevTools and inspect-element always target the guest, including stale menu safety', async () => {
  const native = await nativeHarness();
  const contents = native.addTab();
  assert.equal(native.invoke('open-devtools', 'tab-1').success, true);
  assert.equal(contents.devTools.mode, 'detach');
  contents.emit('context-menu', {}, { x: 91, y: 123, editFlags: {} });
  const inspect = native.menus.at(-1).template.find(item => item.label === 'Inspect Element');
  inspect.click();
  assert.deepEqual(contents.inspected, { x: 91, y: 123 });
  assert.equal(native.window.webContents.devTools, undefined);
  native.invoke('sync-tabs', []);
  contents.inspected = null;
  inspect.click();
  assert.equal(contents.inspected, null);
});

test('page shortcuts and native menus emit only shell coordination with focused guest identity', async () => {
  const native = await nativeHarness();
  native.invoke('sync-tabs', ['left', 'right'].map(id => ({ id, spaceId: 'space', url: 'https://example.com' })));
  native.invoke('layout', { hidden: false, panes: ['left', 'right'].map((tabId, index) => ({ tabId, x: index * 400, y: 0, width: 400, height: 600 })) });
  const [left, right] = native.views.map(view => view.webContents);
  right.focused = true;
  const entries = native.electron.applicationMenu.template.flatMap(item => item.submenu || []);
  assert.equal(entries.some(item => item.role === 'toggleDevTools'), false);
  for (const [label, command] of [['Print…', 'print'], ['Save as PDF…', 'save-pdf'], ['Page Developer Tools', 'devtools'], ['Reload', 'reload']]) {
    entries.find(item => item.label === label).click();
    assert.deepEqual({ ...native.updates.at(-1) }, { type: 'shortcut', command, id: 'right' });
  }
  for (const contents of [left, right, native.window.webContents]) {
    for (const [key, alt, command] of [['p', false, 'print'], ['i', true, 'devtools']]) {
      let prevented = 0;
      const before = native.updates.length;
      contents.emit('before-input-event', { preventDefault() { prevented++; } }, { type: 'keyDown', meta: true, key, alt });
      assert.equal(prevented, 1);
      assert.equal(native.updates.length, before + 1);
      assert.equal(native.updates.at(-1).command, command);
      assert.equal(native.updates.at(-1).id, contents === left ? 'left' : contents === right ? 'right' : undefined);
      assert.equal(contents.devTools, undefined);
      assert.equal(contents.printOptions, undefined);
    }
  }
  right.destroyed = true;
  entries.find(item => item.label === 'Print…').click();
  assert.equal(native.updates.at(-1).id, undefined);
  assert.equal(native.dialogs.length, 0);
});

test('printing shows the native dialog and reports cancellation and real failures accurately', async () => {
  const native = await nativeHarness();
  const contents = native.addTab();
  assert.equal((await native.invoke('print-page', 'tab-1')).success, true);
  assert.equal(contents.printOptions.silent, false);
  for (const reason of ['cancelled', 'Print job canceled']) {
    contents.print = (_options, callback) => callback(false, reason);
    assert.equal((await native.invoke('print-page', 'tab-1')).cancelled, true);
  }
  contents.print = (_options, callback) => callback(false, 'Printer unavailable');
  await assert.rejects(native.invoke('print-page', 'tab-1'), /Print failed: Printer unavailable/);
  contents.print = () => { throw new Error('Native print error'); };
  await assert.rejects(native.invoke('print-page', 'tab-1'), /Native print error/);
  assert.equal(native.window.webContents.printOptions, undefined);
  assert.equal(native.writes.length, 0);
});

test('Save PDF uses a parented native dialog and awaits only the chosen-path write', async () => {
  const native = await nativeHarness();
  const contents = native.addTab();
  let finishWrite;
  native.files.writeFile = (filename, data) => {
    native.writes.push({ filename, data });
    return new Promise(resolve => { finishWrite = resolve; });
  };
  let completed = false;
  const request = native.invoke('save-pdf', 'tab-1').then(result => { completed = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(native.dialogs[0].parent, native.window);
  assert.equal(native.dialogs[0].options.defaultPath, '/tmp/cove-downloads/page.pdf');
  assert.deepEqual([...native.dialogs[0].options.filters[0].extensions], ['pdf']);
  assert.equal(contents.pdfOptions.printBackground, true);
  assert.equal(native.writes[0].filename, '/tmp/chosen.pdf');
  assert.equal(native.writes[0].data.toString(), 'mock PDF');
  assert.equal(completed, false);
  finishWrite();
  assert.equal((await request).success, true);
  assert.equal(native.revealed.length, 0);
  assert.equal(native.window.webContents.pdfOptions, undefined);
});

test('Save PDF cancellation and failed dialog/render/write never report success or open files', async () => {
  const native = await nativeHarness();
  const contents = native.addTab();
  native.electron.dialog.showSaveDialog = async () => ({ canceled: true, filePath: '/tmp/not-chosen.pdf' });
  assert.equal((await native.invoke('save-pdf', 'tab-1')).cancelled, true);
  assert.equal(contents.pdfOptions, undefined);
  assert.equal(native.writes.length, 0);
  native.electron.dialog.showSaveDialog = async () => { throw new Error('Dialog failed'); };
  await assert.rejects(native.invoke('save-pdf', 'tab-1'), /Dialog failed/);
  for (const filePath of [undefined, '', 'relative.pdf', '/tmp/invalid\0.pdf', 10]) {
    native.electron.dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    await assert.rejects(native.invoke('save-pdf', 'tab-1'), /valid PDF save location/);
  }
  native.electron.dialog.showSaveDialog = async () => ({ canceled: false, filePath: '/tmp/chosen.pdf' });
  const render = contents.printToPDF;
  contents.printToPDF = async () => { throw new Error('PDF rendering failed'); };
  await assert.rejects(native.invoke('save-pdf', 'tab-1'), /PDF rendering failed/);
  assert.equal(native.writes.length, 0);
  contents.printToPDF = render;
  native.files.writeFile = async () => { throw new Error('ENOSPC: no space left on device'); };
  await assert.rejects(native.invoke('save-pdf', 'tab-1'), /ENOSPC/);
  native.files.writeFile = async () => {};
  assert.equal((await native.invoke('save-pdf', 'tab-1')).success, true);
  assert.equal(native.revealed.length, 0);
});

test('page output serializes dialogs and rejects guests destroyed while choosing or rendering PDF', async () => {
  const native = await nativeHarness();
  const contents = native.addTab();
  let choose;
  native.electron.dialog.showSaveDialog = () => new Promise(resolve => { choose = resolve; });
  const saving = native.invoke('save-pdf', 'tab-1');
  await assert.rejects(native.invoke('save-pdf', 'tab-1'), /already in progress/);
  await assert.rejects(native.invoke('print-page', 'tab-1'), /already in progress/);
  choose({ canceled: true });
  await saving;
  let printFinished;
  contents.print = (_options, callback) => { printFinished = callback; };
  const printing = native.invoke('print-page', 'tab-1');
  await assert.rejects(native.invoke('save-pdf', 'tab-1'), /already in progress/);
  printFinished(true);
  await printing;
  const closedWhileChoosing = native.invoke('save-pdf', 'tab-1');
  contents.destroyed = true;
  choose({ canceled: false, filePath: '/tmp/chosen.pdf' });
  await assert.rejects(closedWhileChoosing, /Open a web page|page closed/);
  contents.destroyed = false;
  native.electron.dialog.showSaveDialog = async () => ({ canceled: false, filePath: '/tmp/chosen.pdf' });
  contents.printToPDF = async () => { contents.destroyed = true; return Buffer.from('mock PDF'); };
  await assert.rejects(native.invoke('save-pdf', 'tab-1'), /Open a web page|page closed/);
  assert.equal(native.writes.length, 0);
});

test('page APIs reject unauthorized senders before touching guests or opening dialogs', async () => {
  const native = await nativeHarness();
  const contents = native.addTab();
  const shell = native.window.webContents;
  for (const channel of ['print-page', 'save-pdf', 'open-devtools']) {
    for (const event of [
      { sender: contents, senderFrame: contents.mainFrame },
      { sender: shell, senderFrame: { url: shell.mainFrame.url } },
      { sender: shell, senderFrame: null }
    ]) assert.throws(() => native.invoke(channel, 'tab-1', event), /Untrusted/);
    const originalUrl = shell.mainFrame.url;
    shell.mainFrame.url = 'https://untrusted.example';
    assert.throws(() => native.invoke(channel, 'tab-1'), /Untrusted/);
    shell.mainFrame.url = originalUrl;
    native.window.destroyed = true;
    assert.throws(() => native.invoke(channel, 'tab-1'), /Untrusted/);
    native.window.destroyed = false;
  }
  assert.equal(contents.printOptions, undefined);
  assert.equal(contents.pdfOptions, undefined);
  assert.equal(contents.devTools, undefined);
  assert.equal(native.dialogs.length, 0);
  assert.equal(native.writes.length, 0);
});

test('PDF rendering and writing are sequential and both retain the concurrent request guard', async () => {
  const native = await nativeHarness();
  const contents = native.addTab();
  let finishRender;
  let finishWrite;
  contents.printToPDF = () => new Promise(resolve => { finishRender = resolve; });
  native.files.writeFile = (filename, data) => {
    native.writes.push({ filename, data });
    return new Promise(resolve => { finishWrite = resolve; });
  };
  const saving = native.invoke('save-pdf', 'tab-1');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(native.writes.length, 0);
  for (const channel of ['print-page', 'save-pdf']) await assert.rejects(native.invoke(channel, 'tab-1'), /already in progress/);
  finishRender(Buffer.from('finished PDF'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(native.writes.length, 1);
  assert.equal(native.writes[0].data.toString(), 'finished PDF');
  for (const channel of ['print-page', 'save-pdf']) await assert.rejects(native.invoke(channel, 'tab-1'), /already in progress/);
  finishWrite();
  assert.equal((await saving).success, true);
  assert.equal((await native.invoke('print-page', 'tab-1')).success, true);
  assert.equal(native.dialogs.length, 1);
});

test('PDF save rejects a replaced session guest and a closed parent before writing', async () => {
  for (const phase of ['dialog', 'render']) {
    const native = await nativeHarness();
    const contents = native.addTab();
    let finish;
    if (phase === 'dialog') native.electron.dialog.showSaveDialog = () => new Promise(resolve => { finish = resolve; });
    else contents.printToPDF = () => new Promise(resolve => { finish = resolve; });
    const saving = native.invoke('save-pdf', 'tab-1');
    await new Promise(resolve => setImmediate(resolve));
    native.invoke('sync-tabs', [{ id: 'tab-1', spaceId: 'new-space', url: 'https://example.com' }]);
    native.invoke('layout', { hidden: false, panes: [{ tabId: 'tab-1', x: 0, y: 0, width: 800, height: 600 }] });
    assert.notEqual(native.views.at(-1).webContents, contents);
    assert.equal(native.views.at(-1).options.webPreferences.partition, 'persist:cove-new-space');
    finish(phase === 'dialog' ? { canceled: false, filePath: '/tmp/chosen.pdf' } : Buffer.from('stale PDF'));
    await assert.rejects(saving, /page closed/);
    assert.equal(native.writes.length, 0);
    assert.equal((await native.invoke('print-page', 'tab-1')).success, true);
  }
  const native = await nativeHarness();
  native.addTab();
  native.electron.dialog.showSaveDialog = async () => {
    native.window.destroyed = true;
    return { canceled: false, filePath: '/tmp/chosen.pdf' };
  };
  await assert.rejects(native.invoke('save-pdf', 'tab-1'), /page closed/);
  assert.equal(native.writes.length, 0);
});

test('print errors release the output guard and stale inspect menus ignore destroyed guests', async () => {
  const native = await nativeHarness();
  const contents = native.addTab();
  for (const fail of [() => { throw new Error('Print exception'); }, (_options, callback) => callback(false, 'Printer offline')]) {
    contents.print = fail;
    await assert.rejects(native.invoke('print-page', 'tab-1'), /Print exception|Printer offline/);
    assert.equal((await native.invoke('save-pdf', 'tab-1')).success, true);
  }
  contents.emit('context-menu', {}, { x: 10, y: 20, editFlags: {} });
  const inspect = native.menus.at(-1).template.find(item => item.label === 'Inspect Element');
  contents.destroyed = true;
  inspect.click();
  assert.equal(contents.inspected, undefined);
  assert.equal(contents.devTools, undefined);
});

test('native menus never route page actions to detached guests even if marked focused', async () => {
  const native = await nativeHarness();
  const contents = native.addTab();
  contents.focused = true;
  native.invoke('layout', { hidden: true, panes: [] });
  const entries = native.electron.applicationMenu.template.flatMap(item => item.submenu || []);
  for (const [label, command] of [['Print…', 'print'], ['Save as PDF…', 'save-pdf'], ['Page Developer Tools', 'devtools']]) {
    entries.find(item => item.label === label).click();
    assert.deepEqual({ ...native.updates.at(-1) }, { type: 'shortcut', command });
  }
});

test('stop and hard reload act only on a valid live guest through trusted shell IPC', async () => {
  const native = await nativeHarness();
  const contents = native.addTab();
  const shell = native.window.webContents;
  for (const [channel, counter] of [['stop', 'stopCalls'], ['hard-reload', 'hardReloadCalls']]) {
    for (const id of [null, {}, '../bad', 'missing', 'home']) assert.throws(() => native.invoke(channel, id), /Invalid tab|Open a web page/);
    for (const event of [
      { sender: contents, senderFrame: contents.mainFrame },
      { sender: shell, senderFrame: { url: shell.mainFrame.url } }
    ]) assert.throws(() => native.invoke(channel, 'tab-1', event), /Untrusted/);
    const originalUrl = shell.mainFrame.url;
    shell.mainFrame.url = 'https://untrusted.example';
    assert.throws(() => native.invoke(channel, 'tab-1'), /Untrusted/);
    shell.mainFrame.url = originalUrl;
    contents.destroyed = true;
    assert.throws(() => native.invoke(channel, 'tab-1'), /Open a web page/);
    contents.destroyed = false;
    assert.equal(contents[counter], undefined);
    native.invoke(channel, 'tab-1');
    assert.equal(contents[counter], 1);
    assert.equal(shell[counter], undefined);
  }
});

test('hard-reload policy and native interception distinguish Shift+R without weakening modifiers', async () => {
  const native = await nativeHarness();
  const contents = native.addTab();
  for (const modifier of ['meta', 'control']) {
    const input = { type: 'keyDown', key: 'R', [modifier]: true, shift: true };
    assert.equal(shortcutCommand(input), 'hard-reload');
    assert.equal(shortcutCommand({ ...input, shift: false }), 'reload');
    for (const overrides of [{ type: 'keyUp' }, { alt: true }, { meta: true, control: true }, { meta: false, control: false }]) assert.equal(shortcutCommand({ ...input, ...overrides }), null);
    for (const sender of [contents, native.window.webContents]) {
      let prevented = 0;
      const before = native.updates.length;
      sender.emit('before-input-event', { preventDefault() { prevented++; } }, input);
      assert.equal(prevented, 1);
      assert.equal(native.updates.length, before + 1);
      assert.equal(native.updates.at(-1).command, 'hard-reload');
      assert.equal(native.updates.at(-1).id, sender === contents ? 'tab-1' : undefined);
      assert.equal(sender.hardReloadCalls, undefined);
    }
  }
});
