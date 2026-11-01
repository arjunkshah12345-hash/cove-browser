const { app, BrowserWindow, session, webContents } = require('electron');
const assert = require('node:assert/strict');
require('../electron/main.cjs');

async function until(read, description) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const value = await read();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error(`Timed out: ${description}`);
}

app.whenReady().then(async () => {
  const window = await until(() => BrowserWindow.getAllWindows()[0], 'shell window');
  await until(() => !window.webContents.isLoading(), 'shell load');
  const shell = async source => {
    try { return await window.webContents.executeJavaScript(source); }
    catch (error) { throw new Error(`Shell fixture failed: ${source.slice(0, 240)}`, { cause: error }); }
  };
  await until(() => shell('Boolean(document.querySelector(".home-search, .browser-pane"))'), 'shell UI');
  await new Promise(resolve => setTimeout(resolve, 150));
  const invoke = (method, payload) => shell(`window.cove[${JSON.stringify(method)}](${JSON.stringify(payload)})`);
  const resources = () => invoke('getTabResources');
  const select = async id => {
    const state = await shell('JSON.parse(localStorage.getItem("cove.workspace.v1"))');
    const tab = state.tabs.find(tab => tab.id === id);
    await shell(`Array.from(document.querySelectorAll('.space-dots button')).find(button => button.getAttribute('aria-label') === ${JSON.stringify(`Switch to ${state.spaces.find(space => space.id === tab.spaceId).name}`)})?.click()`);
    await shell(`Array.from(document.querySelectorAll('.tab-main')).find(button => button.title === ${JSON.stringify(tab.title)})?.click()`);
    await until(async () => (await resources()).find(tab => tab.id === id)?.visible, 'selected tab visible');
    await until(async () => (await resources()).find(tab => tab.id === id)?.loading === false, 'selected tab loaded');
  };
  const origin = process.env.COVE_RESOURCE_ORIGIN;
  const normalSession = session.fromPartition('persist:cove-work');
  if (process.env.COVE_RESOURCE_PHASE === 'restart') {
    const cookies = await normalSession.cookies.get({ url: origin });
    assert.equal(cookies.find(cookie => cookie.name === 'persistent-login')?.value, 'remembered', 'persistent cookies survive application restart');
    await select('resource-work');
    const guest = webContents.getAllWebContents().find(contents => contents.getURL() === `${origin}/work`);
    assert.equal(await guest.executeJavaScript('localStorage.getItem("persistent-site-data")'), 'remembered', 'site storage survives restart');
    console.log('Native restart smoke passed: persistent cookies, site localStorage and workspace survive application restart.');
    return;
  }
  const { initialState, STORAGE_KEY } = await import('../src/model.js');
  const state = initialState();
  state.tabs = [
    { id: 'resource-left', title: 'Resource left', customTitle: true, url: `${origin}/left`, spaceId: 'personal', pinned: false },
    { id: 'resource-right', title: 'Resource right', customTitle: true, url: `${origin}/right`, spaceId: 'personal', pinned: false },
    { id: 'resource-work', title: 'Resource work', customTitle: true, url: `${origin}/work`, spaceId: 'work', pinned: false }
  ];
  state.activeTabId = 'resource-left';
  const loaded = new Promise(resolve => window.webContents.once('did-finish-load', resolve));
  await shell(`localStorage.setItem(${JSON.stringify(STORAGE_KEY)},${JSON.stringify(JSON.stringify(state))}); location.reload()`);
  await loaded;
  await until(async () => (await resources()).find(tab => tab.id === 'resource-left')?.loading === false, 'left loaded');
  await invoke('setZoom', { tabId: 'resource-left', factor: 1.3 });
  await invoke('setMuted', { tabId: 'resource-left', muted: true });
  await select('resource-right');
  await until(async () => (await resources()).find(tab => tab.id === 'resource-left')?.canSleep, 'inactive tab can sleep');
  assert.equal((await invoke('sleepTab', 'resource-left')).ok, true);
  assert.equal((await resources()).find(tab => tab.id === 'resource-left').sleeping, true);
  await shell('Array.from(document.querySelectorAll("button")).find(button => button.getAttribute("aria-label") === "Settings")?.click()');
  await until(() => shell('Boolean(document.querySelector("[role=dialog]"))'), 'settings open');
  assert.equal((await invoke('sleepTab', 'resource-right')).ok, false, 'modal-hidden selected tab is protected');
  await shell(`document.querySelector('button[aria-label="Close dialog"]').click()`);
  await select('resource-left');
  const left = webContents.getAllWebContents().find(contents => contents.getURL() === `${origin}/left`);
  await until(() => Math.abs(left.getZoomFactor() - 1.3) < 0.01, 'wake restores zoom');
  assert.equal(left.isAudioMuted(), true);
  await left.executeJavaScript('localStorage.setItem("reset-site-data", "personal")');
  const personal = session.fromPartition('persist:cove-personal');
  await personal.cookies.set({ url: origin, name: 'scope', value: 'personal' });
  await normalSession.cookies.set({ url: origin, name: 'scope', value: 'work' });
  assert.equal((await invoke('clearSpaceData', { spaceId: 'personal', confirmed: false })).ok, false);
  assert.equal((await invoke('clearSpaceData', { spaceId: 'unknown', confirmed: true })).ok, false);
  await select('resource-work');
  assert.equal((await invoke('clearSpaceData', { spaceId: 'personal', confirmed: true })).ok, true);
  assert.equal((await personal.cookies.get({ url: origin })).length, 0);
  assert.equal((await normalSession.cookies.get({ url: origin })).find(cookie => cookie.name === 'scope')?.value, 'work');
  assert.equal((await resources()).find(tab => tab.id === 'resource-work').loaded, true);
  assert.equal((await resources()).find(tab => tab.id === 'resource-left').loaded, false);
  await select('resource-left');
  const reset = webContents.getAllWebContents().find(contents => contents.getURL() === `${origin}/left`);
  assert.equal(await reset.executeJavaScript('localStorage.getItem("reset-site-data")'), null);
  assert.equal((await shell('JSON.parse(localStorage.getItem("cove.workspace.v1"))')).tabs.length, 3);
  await select('resource-work');
  await normalSession.cookies.set({ url: origin, name: 'persistent-login', value: 'remembered', expirationDate: Date.now() / 1000 + 3600 });
  const work = webContents.getAllWebContents().find(contents => contents.getURL() === `${origin}/work`);
  await work.executeJavaScript('localStorage.setItem("persistent-site-data", "remembered")');
  normalSession.flushStorageData();
  await normalSession.cookies.flushStore();
  console.log('Native resource smoke passed: actual sleep/wake, selection protection, mute/zoom, isolated cookie/storage reset and preserved workspace.');
}).then(() => app.quit()).catch(error => { console.error(error); app.exit(1); });
