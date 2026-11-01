import { test, expect } from '@playwright/test';
import { initialState, STORAGE_KEY } from '../src/model.js';

async function seed(page, update = {}) {
  const state = { ...initialState(), ...update };
  await page.addInitScript(({ key, state }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(state));
  }, { key: STORAGE_KEY, state });
  await page.goto('/');
}

const savedState = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
const paneIds = page => page.locator('.browser-pane').evaluateAll(panes => panes.map(pane => pane.dataset.tabId));

test('palette ranks existing tabs and switches across spaces without duplicates', async ({ page }) => {
  await seed(page);
  await page.keyboard.press('Control+k');
  const input = page.getByRole('combobox', { name: 'Search or enter URL' });
  await input.fill('github work');
  const options = page.getByRole('listbox').getByRole('option');
  await expect(options.first()).toContainText('GitHub');
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await expect(input).toHaveAttribute('aria-activedescendant', 'palette-result-0');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await savedState(page)).activeTabId).toBe('github');
  expect((await savedState(page)).tabs).toHaveLength(4);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('palette searches favorites and history, supports keyboard commands, and keeps address editing separate', async ({ page }) => {
  await seed(page, {
    shortcuts: [{ id: 'quiet', title: 'Quiet library', url: 'https://quiet.example/' }],
    history: [{ id: 'old', title: 'Old library', url: 'https://old.example/', spaceId: 'personal', visitedAt: 10 }]
  });
  await page.keyboard.press('Control+k');
  const input = page.getByRole('combobox', { name: 'Search or enter URL' });
  await input.fill('library');
  await expect(page.getByRole('option').filter({ hasText: 'Quiet library' })).toContainText('Favorite');
  await expect(page.getByRole('option').filter({ hasText: 'Old library' })).toContainText('History');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await savedState(page)).tabs.at(-1)?.url).toBe('https://quiet.example/');
  await page.keyboard.press('Control+l');
  await input.fill('github.com');
  await expect(page.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await savedState(page)).tabs.at(-1)?.url).toBe('https://github.com/');
  await page.keyboard.press('Control+k');
  await input.fill('browsing history');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'history' })).toBeVisible();
});

test('saved split pair and ratio survive focus, swapping, space switches and reload', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: /Split view/ }).click();
  await expect.poll(() => paneIds(page)).toEqual(['welcome', 'arena']);
  const divider = page.getByRole('separator', { name: 'Resize split view' });
  await divider.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(divider).toHaveAttribute('aria-valuenow', '60');
  await page.locator('.tab-main').filter({ hasText: 'Are.na' }).click();
  await expect.poll(() => paneIds(page)).toEqual(['welcome', 'arena']);
  await page.getByRole('button', { name: 'Swap split panes' }).first().click();
  await expect.poll(() => paneIds(page)).toEqual(['arena', 'welcome']);
  await expect(divider).toHaveAttribute('aria-valuenow', '40');
  await page.getByRole('button', { name: 'Switch to Work', exact: true }).click();
  await expect(page.locator('.browser-pane')).toHaveCount(1);
  await page.getByRole('button', { name: 'Switch to Personal', exact: true }).click();
  await expect.poll(() => paneIds(page)).toEqual(['arena', 'welcome']);
  await page.reload();
  await expect.poll(() => paneIds(page)).toEqual(['arena', 'welcome']);
  await expect(page.getByRole('separator')).toHaveAttribute('aria-valuenow', '40');
});

test('selecting a third tab replaces only the primary pane and closing a member clears saved split', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: /Split view/ }).click();
  await page.locator('.tab-main').filter({ hasText: 'The Creative Independent' }).click();
  await expect.poll(() => paneIds(page)).toEqual(['read', 'arena']);
  await page.getByRole('button', { name: 'More options for Are.na' }).click();
  await page.getByRole('button', { name: 'Close tab', exact: true }).click();
  await expect(page.locator('.browser-pane')).toHaveCount(1);
  await expect.poll(async () => (await savedState(page)).splitLayouts).toEqual([]);
  await page.reload();
  await expect(page.locator('.browser-pane')).toHaveCount(1);
});

test('duplicating into a split transfers command focus to the activated duplicate', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: /Split view/ }).click();
  await page.locator('.tab-main').filter({ hasText: 'Are.na' }).click();
  await page.getByRole('button', { name: 'More options for The Creative Independent' }).click();
  await page.getByRole('button', { name: 'Duplicate tab', exact: true }).click();
  const duplicateId = (await savedState(page)).activeTabId;
  await expect(page).toHaveTitle('The Creative Independent — Cove');
  await expect.poll(() => paneIds(page)).toEqual([duplicateId, 'arena']);
  await page.keyboard.press('Control+w');
  await expect.poll(async () => (await savedState(page)).tabs.some(tab => tab.id === duplicateId)).toBe(false);
  expect((await savedState(page)).tabs.some(tab => tab.id === 'arena')).toBe(true);
});

test('split creation respects the global tab limit without breaking persistence', async ({ page }) => {
  const tabs = [initialState().tabs[0], ...Array.from({ length: 499 }, (_, index) => ({ id: `work-${index}`, title: `Work ${index}`, spaceId: 'work', url: `https://example.com/${index}`, pinned: false }))];
  await seed(page, { tabs });
  await page.getByRole('button', { name: /Split view/ }).click();
  await expect(page.getByRole('status')).toContainText('This workspace is full.');
  await expect(page.locator('.browser-pane')).toHaveCount(1);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Evening mode' }).click();
  await expect.poll(async () => (await savedState(page)).dark).toBe(true);
  expect((await savedState(page)).tabs).toHaveLength(500);
  await page.reload();
  await expect(page.locator('.browser-pane')).toHaveCount(1);
});

test('empty palette creates a fresh tab and searchable commands open settings', async ({ page }) => {
  await seed(page);
  await page.keyboard.press('Control+t');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await savedState(page)).tabs.length).toBe(5);
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Search or enter URL' }).fill('browser settings');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'A browser, your way.' })).toBeVisible();
});

test('confirmed workspace import restores the saved split pair and divider', async ({ page }) => {
  await seed(page);
  const imported = { ...initialState(), splitLayouts: [{ spaceId: 'personal', primaryId: 'read', secondaryId: 'arena', ratio: 65 }], activeTabId: 'read' };
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles({ name: 'split-workspace.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) });
  await page.getByRole('button', { name: 'Replace workspace', exact: true }).click();
  await expect.poll(() => paneIds(page)).toEqual(['read', 'arena']);
  await expect(page.getByRole('separator')).toHaveAttribute('aria-valuenow', '65');
  await page.reload();
  await expect.poll(() => paneIds(page)).toEqual(['read', 'arena']);
});

test('private split layouts remain in memory without touching normal workspace storage', async ({ page }) => {
  await page.addInitScript(key => {
    localStorage.setItem(key, 'normal-workspace-sentinel');
    window.cove = { isPrivate: true, syncTabs: async () => {}, setLayout: async () => {}, stopFind: async () => {}, getDownloads: async () => [], onTabUpdate: () => () => {} };
  }, STORAGE_KEY);
  await page.goto('/');
  await page.getByRole('button', { name: /Split view/ }).click();
  await expect(page.locator('.browser-pane')).toHaveCount(2);
  await page.getByRole('button', { name: 'Swap split panes' }).first().click();
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe('normal-workspace-sentinel');
  await page.reload();
  await expect(page.locator('.browser-pane')).toHaveCount(1);
  expect(await page.evaluate(key => localStorage.getItem(`${key}.backup`), STORAGE_KEY)).toBeNull();
});
