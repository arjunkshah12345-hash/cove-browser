import { test, expect } from '@playwright/test';
import { initialState, STORAGE_KEY } from '../src/model.js';

async function setup(page, { native = false, partial = false, retention = false } = {}) {
  const state = initialState();
  state.history = [
    { id: 'old', title: 'Old visit', url: 'https://old.example/', spaceId: 'personal', visitedAt: Date.now() - 10 * 86400000 },
    { id: 'recent', title: 'Recent visit', url: 'https://recent.example/', spaceId: 'personal', visitedAt: Date.now() }
  ];
  if (retention) state.historyRetentionDays = 7;
  await page.addInitScript(({ key, state, native, partial }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state));
    if (!native) return;
    let tabs = state.tabs;
    let sleeping = false;
    window.resourceCalls = [];
    window.cove = {
      syncTabs: async value => { tabs = value; }, setLayout: async () => {}, stopFind: async () => {},
      getDownloads: async () => [], onTabUpdate: () => () => {},
      getTabResources: async () => tabs.map(tab => ({ id: tab.id, spaceId: tab.spaceId, loaded: !(tab.id === 'arena' && sleeping), visible: false, audible: false, loading: false, sleeping: tab.id === 'arena' && sleeping, canSleep: !sleeping })),
      sleepTab: async id => { window.resourceCalls.push({ sleep: id }); sleeping = true; return { ok: true }; },
      clearSpaceData: async request => { window.resourceCalls.push(request); return partial ? { ok: false, partial: true, reason: 'Cache failed.' } : { ok: true }; }
    };
  }, { key: STORAGE_KEY, state, native, partial });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
}

test('history retention previews irreversible removal, supports cancel, then persists confirmed choice', async ({ page }) => {
  await setup(page);
  const select = page.getByLabel('Keep browsing history', { exact: true });
  await select.selectOption('7');
  await expect(page.getByText(/immediately removes 1 saved visit/)).toBeVisible();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).history.length, STORAGE_KEY)).toBe(2);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(select).toHaveValue('0');
  await select.selectOption('7');
  await page.getByRole('button', { name: 'Confirm history retention', exact: true }).click();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).historyRetentionDays, STORAGE_KEY)).toBe(7);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).history.map(entry => entry.id), STORAGE_KEY)).toEqual(['recent']);
  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(select).toHaveValue('7');
});

test('saved retention is applied on startup without removing tabs', async ({ page }) => {
  await setup(page, { retention: true });
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).history.length, STORAGE_KEY)).toBe(1);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).tabs.length, STORAGE_KEY)).toBe(4);
});

test('web preview labels native resource and site-data controls unavailable', async ({ page }) => {
  await setup(page);
  await expect(page.getByText(/Live tab resources and tab sleeping are desktop-only/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review site data reset' })).toBeDisabled();
});

test('sleep requires confirmation and protects selected panes despite native eligibility', async ({ page }) => {
  await setup(page, { native: true });
  await expect(page.getByRole('button', { name: 'Sleep A little space for you' })).toBeDisabled();
  await page.getByRole('button', { name: 'Sleep Are.na', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Confirm tab sleep' })).toContainText('Unsaved forms will be lost');
  expect(await page.evaluate(() => window.resourceCalls)).toEqual([]);
  await page.getByRole('button', { name: 'Confirm sleep', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.resourceCalls)).toEqual([{ sleep: 'arena' }]);
  await expect(page.getByRole('button', { name: 'Sleep Are.na', exact: true })).toBeDisabled();
});

for (const partial of [false, true]) test(`space reset is explicit, scoped and reports ${partial ? 'partial failure' : 'success'}`, async ({ page }) => {
  await setup(page, { native: true, partial });
  await page.getByLabel('Space to reset').selectOption('personal');
  await page.getByRole('button', { name: 'Review site data reset' }).click();
  await expect(page.getByRole('group', { name: 'Confirm space reset' })).toContainText('permission grants are preserved');
  expect(await page.evaluate(() => window.resourceCalls)).toEqual([]);
  await page.getByRole('button', { name: 'Reset “Personal” site data', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.resourceCalls)).toEqual([{ spaceId: 'personal', confirmed: true }]);
  await expect(page.locator('.resource-settings [role="status"]')).toContainText(partial ? 'only partially reset' : 'was reset');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).history.length, STORAGE_KEY)).toBe(2);
});
