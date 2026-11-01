const { pathToFileURL } = require('node:url');

function isWebUrl(value) {
  if (typeof value !== 'string' || value.length > 16000) return false;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

function validId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
}

function clampZoom(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid zoom factor.');
  return Math.max(0.5, Math.min(2, value));
}

function shortcutCommand(input) {
  if (!input || input.type !== 'keyDown' || (input.meta && input.control) || !(input.meta || input.control)) return null;
  const key = String(input.key).toLowerCase();
  if (input.alt) return key === 'i' && !input.shift ? 'devtools' : null;
  if (key === 'tab' && input.control && !input.meta) return input.shift ? 'previous-tab' : 'next-tab';
  if (key === 't') return input.shift ? 'restore-tab' : 'new-tab';
  if (key === 'n' && input.shift) return 'private-window';
  if (key === 's' && input.shift) return 'sidebar';
  if (key === 'd' && input.shift) return 'split';
  if (key === 'r' && input.shift) return 'hard-reload';
  if (key === '+' || key === '=') return 'zoom-in';
  if (key === '-' || key === '_') return 'zoom-out';
  if (input.shift) return null;
  const commands = { l: 'address', k: 'command', w: 'close-tab', ',': 'settings', f: 'find', y: 'history', j: 'downloads', r: 'reload', p: 'print', '0': 'zoom-reset' };
  return Object.hasOwn(commands, key) ? commands[key] : null;
}

function rendererLocation(devUrl, indexPath) {
  if (!devUrl) return pathToFileURL(indexPath).href;
  const url = new URL(devUrl);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) throw new Error('COVE_DEV_URL must be an HTTP loopback URL.');
  return url.href;
}

function isShellUrl(value, expected) {
  try {
    const actual = new URL(value);
    const shell = new URL(expected);
    if (actual.protocol !== shell.protocol) return false;
    return actual.protocol === 'file:' ? actual.pathname === shell.pathname && shell.protocol === 'file:' : actual.origin === shell.origin;
  } catch { return false; }
}

function clampBounds(pane, windowBounds) {
  if (!pane || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(pane[key]))) return null;
  const x = Math.max(0, Math.min(windowBounds.width, Math.round(pane.x)));
  const y = Math.max(0, Math.min(windowBounds.height, Math.round(pane.y)));
  const width = Math.max(0, Math.min(windowBounds.width - x, Math.round(pane.width)));
  const height = Math.max(0, Math.min(windowBounds.height - y, Math.round(pane.height)));
  return width && height ? { x, y, width, height } : null;
}

module.exports = { isWebUrl, validId, rendererLocation, isShellUrl, clampBounds, clampZoom, shortcutCommand };
