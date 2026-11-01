const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cove', Object.freeze({
  isPrivate: process.argv.includes('--cove-private'),
  openPrivateWindow: () => ipcRenderer.invoke('cove:open-private-window'),
  getSitePermissions: tabId => ipcRenderer.invoke('cove:get-site-permissions', tabId),
  setSitePermission: request => ipcRenderer.invoke('cove:set-site-permission', request),
  clearSitePermissions: request => ipcRenderer.invoke('cove:clear-site-permissions', request),
  syncTabs: tabs => ipcRenderer.invoke('cove:sync-tabs', tabs),
  setLayout: layout => ipcRenderer.invoke('cove:layout', layout),
  navigate: target => ipcRenderer.invoke('cove:navigate', target),
  back: tabId => ipcRenderer.invoke('cove:back', tabId),
  forward: tabId => ipcRenderer.invoke('cove:forward', tabId),
  reload: tabId => ipcRenderer.invoke('cove:reload', tabId),
  stop: tabId => ipcRenderer.invoke('cove:stop', tabId),
  hardReload: tabId => ipcRenderer.invoke('cove:hard-reload', tabId),
  printPage: tabId => ipcRenderer.invoke('cove:print-page', tabId),
  savePdf: tabId => ipcRenderer.invoke('cove:save-pdf', tabId),
  openDevTools: tabId => ipcRenderer.invoke('cove:open-devtools', tabId),
  findInPage: ({ tabId, text, forward = true }) => ipcRenderer.invoke('cove:find-in-page', { tabId, text, forward }),
  stopFind: tabId => ipcRenderer.invoke('cove:stop-find', tabId),
  setZoom: target => ipcRenderer.invoke('cove:set-zoom', target),
  setMuted: target => ipcRenderer.invoke('cove:set-muted', target),
  getDownloads: () => ipcRenderer.invoke('cove:get-downloads'),
  getTabResources: () => ipcRenderer.invoke('cove:get-tab-resources'),
  sleepTab: tabId => ipcRenderer.invoke('cove:sleep-tab', tabId),
  clearSpaceData: request => ipcRenderer.invoke('cove:clear-space-data', request),
  cancelDownload: id => ipcRenderer.invoke('cove:cancel-download', id),
  showDownload: id => ipcRenderer.invoke('cove:show-download', id),
  onTabUpdate: callback => {
    const listener = (_event, update) => callback(update);
    ipcRenderer.on('cove:tab-update', listener);
    return () => ipcRenderer.removeListener('cove:tab-update', listener);
  }
}));
