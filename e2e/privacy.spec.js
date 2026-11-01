import { test, expect } from '@playwright/test';
import { initialState, STORAGE_KEY } from '../src/model.js';

async function mockDesktop(page, { privateMode = false, failSave = false } = {}) {
  await page.addInitScript(({ privateMode, failSave }) => {
    let listener;
    let permissions = { geolocation: false, notifications: false, media: false };
    window.testRequests = [];
    const response = () => ({ origin: 'https://example.com', eligible: true, permissions: { ...permissions } });
    window.cove = {
      isPrivate: privateMode,
      syncTabs: async () => {}, setLayout: async () => {}, stopFind: async () => {},
      getDownloads: async () => [],
      onTabUpdate: callback => { listener = callback; return () => {}; },
      getSitePermissions: async () => response(),
      setSitePermission: async request => {
        window.testRequests.push(request);
        if (failSave) { failSave = false; throw new Error('Site changed.'); }
        permissions[request.permission] = request.allowed;
        return response();
      },
      clearSitePermissions: async request => { window.testRequests.push(request); permissions = { geolocation: false, notifications: false, media: false }; return response(); },
      openPrivateWindow: async () => { window.privateWindowRequested = true; }
    };
    window.testNativeEvent = event => listener?.(event);
  }, { privateMode, failSave });
}

test('site controls require explicit grants and bind changes to the displayed origin', async ({ page }) => {
  await mockDesktop(page);
  const state = initialState();
  state.tabs[0].url = 'https://example.com/';
  await page.addInitScript(({ state, key }) => localStorage.setItem(key, JSON.stringify(state)), { state, key: STORAGE_KEY });
  await page.goto('/');
  await page.getByRole('button', { name: 'Site permissions', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'site-permissions' });
  const location = dialog.getByRole('switch', { name: 'Location', exact: true });
  await expect(location).not.toBeChecked();
  await location.check();
  await expect(location).toBeChecked();
  expect(await page.evaluate(() => window.testRequests[0])).toEqual({ tabId: 'welcome', origin: 'https://example.com', permission: 'geolocation', allowed: true });
  await dialog.getByRole('button', { name: 'Reset site permissions' }).click();
  await expect(location).not.toBeChecked();
  expect(await page.evaluate(() => window.testRequests.at(-1))).toEqual({ tabId: 'welcome', origin: 'https://example.com' });
});

test('site control failures do not show a grant and can be retried', async ({ page }) => {
  await mockDesktop(page, { failSave: true });
  const state = initialState();
  state.tabs[0].url = 'https://example.com/';
  await page.addInitScript(({ state, key }) => localStorage.setItem(key, JSON.stringify(state)), { state, key: STORAGE_KEY });
  await page.goto('/');
  await page.getByRole('button', { name: 'Site permissions', exact: true }).click();
  const location = page.getByRole('switch', { name: 'Location', exact: true });
  await location.click();
  await expect(page.getByRole('alert')).toContainText('Couldn’t save');
  await expect(location).not.toBeChecked();
  await expect(location).toBeDisabled();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(location).toBeEnabled();
  await location.check();
  await expect(location).toBeChecked();
});

test('private chrome never loads or overwrites the saved workspace, note, or history', async ({ page }) => {
  await mockDesktop(page, { privateMode: true });
  await page.addInitScript(key => { localStorage.setItem(key, 'normal-workspace-sentinel'); localStorage.setItem('cove.note.v1', 'Normal note'); }, STORAGE_KEY);
  await page.goto('/');
  await expect(page.getByText('Private window.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('A passing thought')).toHaveValue('');
  await page.getByLabel('A passing thought').fill('Private thought');
  await page.evaluate(() => window.testNativeEvent({ type: 'navigation', id: 'welcome', spaceId: 'personal', url: 'https://private.example/', title: 'Private visit', visitedAt: Date.now() }));
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toContainText('Private visit');
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe('normal-workspace-sentinel');
  expect(await page.evaluate(() => localStorage.getItem('cove.note.v1'))).toBe('Normal note');
});

test('private-window shortcut uses the native launcher', async ({ page }) => {
  await mockDesktop(page);
  await page.goto('/');
  await page.keyboard.press('Control+Shift+N');
  await expect.poll(() => page.evaluate(() => window.privateWindowRequested)).toBe(true);
});
