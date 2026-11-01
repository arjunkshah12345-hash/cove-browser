import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const server = createServer((_request, response) => {
  response.setHeader('content-type', 'text/html');
  response.end('<title>Session fixture</title><h1>Session fixture</h1>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = `http://127.0.0.1:${server.address().port}`;
const normalData = await mkdtemp(path.join(tmpdir(), 'cove-normal-check-'));
const privateData = await mkdtemp(path.join(tmpdir(), 'cove-private-check-'));
const applications = new Set();

async function launch(privateMode, userData) {
  const env = { ...process.env, COVE_USER_DATA: userData, COVE_PRIVATE: privateMode ? '1' : '0', COVE_DEV_URL: '' };
  delete env.ELECTRON_RUN_AS_NODE;
  const application = await electron.launch({ ...(process.env.COVE_TEST_EXECUTABLE ? { executablePath: process.env.COVE_TEST_EXECUTABLE, args: [] } : { args: ['.'] }), env, timeout: 30000 });
  applications.add(application);
  const page = await application.firstWindow();
  await page.locator('.home-search').waitFor();
  return { application, page };
}

async function openFixture({ application, page }) {
  await page.locator('.home-search').click();
  await page.getByRole('combobox', { name: 'Search or enter URL' }).fill(address);
  const guestPromise = application.context().waitForEvent('page');
  await page.keyboard.press('Enter');
  const guest = await guestPromise;
  await guest.getByRole('heading', { name: 'Session fixture' }).waitFor();
  return guest;
}

try {
  const normal = await launch(false, normalData);
  await normal.page.getByLabel('A passing thought').fill('Normal saved note');
  const normalGuest = await openFixture(normal);
  await normalGuest.evaluate(() => { document.cookie = 'sessionKind=normal; SameSite=Lax'; localStorage.setItem('site-secret', 'normal'); });
  const normalWorkspace = await normal.page.evaluate(() => localStorage.getItem('cove.workspace.v1'));
  const first = await launch(true, privateData);
  assert.equal(await first.page.evaluate(() => window.cove.isPrivate), true);
  await first.page.getByText('Private window.', { exact: true }).waitFor();
  await expect(first.page.getByLabel('A passing thought')).toHaveValue('');
  await first.page.getByLabel('A passing thought').fill('Private unsaved note');
  const privateGuest = await openFixture(first);
  assert.equal(await privateGuest.evaluate(() => document.cookie), '');
  assert.equal(await privateGuest.evaluate(() => localStorage.getItem('site-secret')), null);
  await privateGuest.evaluate(() => { document.cookie = 'sessionKind=private; SameSite=Lax'; localStorage.setItem('site-secret', 'private'); });
  assert.match(await normalGuest.evaluate(() => document.cookie), /sessionKind=normal/);
  assert.equal(await normalGuest.evaluate(() => localStorage.getItem('site-secret')), 'normal');
  const privatePersistent = await first.application.evaluate(({ session }) => ({ shell: session.fromPartition('cove-private-shell').isPersistent(), guest: session.fromPartition('cove-personal').isPersistent() }));
  assert.deepEqual(privatePersistent, { shell: false, guest: false });
  assert.deepEqual(await first.page.evaluate(() => ({ workspace: localStorage.getItem('cove.workspace.v1'), note: localStorage.getItem('cove.note.v1') })), { workspace: null, note: null });
  const privateTabId = await first.page.locator('.browser-pane').getAttribute('data-tab-id');
  await first.page.getByRole('button', { name: 'Site permissions', exact: true }).click();
  const location = first.page.getByRole('switch', { name: 'Location', exact: true });
  await expect(location).toBeEnabled();
  await expect(location).not.toBeChecked();
  assert.equal(await privateGuest.evaluate(async () => (await navigator.permissions.query({ name: 'geolocation' })).state), 'denied');
  await location.click();
  await expect(location).toBeChecked();
  await expect.poll(() => privateGuest.evaluate(async () => (await navigator.permissions.query({ name: 'geolocation' })).state)).toBe('granted');
  await first.page.getByRole('button', { name: 'Reset site permissions' }).click();
  await expect(location).not.toBeChecked();
  await expect.poll(() => privateGuest.evaluate(async () => (await navigator.permissions.query({ name: 'geolocation' })).state)).toBe('denied');
  await first.page.getByRole('button', { name: 'Close dialog' }).click();
  assert.equal(await first.page.evaluate(async tabId => {
    try { await window.cove.setSitePermission({ tabId, origin: 'https://wrong.example', permission: 'geolocation', allowed: true }); return false; } catch { return true; }
  }, privateTabId), true);
  await first.page.getByRole('button', { name: 'Settings', exact: true }).click();
  await first.page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(first.page.getByRole('dialog')).not.toContainText('Session fixture');
  await first.application.close();
  applications.delete(first.application);
  const second = await launch(true, privateData);
  await expect(second.page.getByLabel('A passing thought')).toHaveValue('');
  const secondGuest = await openFixture(second);
  assert.equal(await secondGuest.evaluate(() => document.cookie), '');
  assert.equal(await secondGuest.evaluate(() => localStorage.getItem('site-secret')), null);
  assert.equal(await normal.page.evaluate(() => localStorage.getItem('cove.workspace.v1')), normalWorkspace);
  assert.equal(await normal.page.evaluate(() => localStorage.getItem('cove.note.v1')), 'Normal saved note');
  console.log('Privacy smoke: separate normal/private sessions, memory-only partitions, no private workspace/note/history, cookie/storage restart isolation, explicit grant/reset and stale-origin rejection PASS');
} finally {
  for (const application of applications) await application.close();
  await new Promise(resolve => server.close(resolve));
}
