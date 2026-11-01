import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('home is local-first, fits the desktop window, and keeps notes after reload', async ({ page }) => {
  const externalRequests = [];
  page.on('request', request => { if (!request.url().startsWith('http://127.0.0.1:5173/')) externalRequests.push(request.url()); });
  await expect(page.getByRole('heading', { name: /A little space/ })).toBeVisible();
  await page.getByRole('textbox', { name: 'A passing thought' }).fill('Build a browser that belongs to us.');
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => externalRequests).toEqual([]);
  await expect(page.getByRole('textbox', { name: 'A passing thought' })).toHaveValue('Build a browser that belongs to us.');
  const surface = page.locator('.pane-surface');
  expect(await surface.evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThan(3);
});

test('command bar opens URLs, pins tabs, closes and restores them', async ({ page }) => {
  await page.getByRole('button', { name: 'New tab', exact: false }).first().click();
  await page.getByRole('combobox', { name: 'Search or enter URL' }).fill('example.com');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'example.com' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open website' })).toHaveAttribute('href', 'https://example.com/');
  await page.getByRole('button', { name: 'More options for example.com' }).click();
  await page.getByRole('button', { name: 'Pin tab', exact: true }).click();
  await expect(page.locator('.pinned-tabs')).toContainText('example.com');
  await page.getByRole('button', { name: 'More options for example.com' }).click();
  await page.getByRole('button', { name: 'Close tab', exact: true }).click();
  await page.locator('.archive-button').click();
  await page.getByRole('dialog').getByRole('button', { name: /example.com/ }).click();
  await expect(page.getByRole('heading', { name: 'example.com' })).toBeVisible();
});

test('spaces isolate tabs, new spaces and folders persist', async ({ page }) => {
  await page.getByRole('button', { name: 'New space', exact: true }).click();
  await page.getByLabel('Space name').fill('Side projects');
  await page.getByRole('button', { name: 'Create space', exact: true }).click();
  await expect(page.locator('.space-label')).toHaveText('Side projects');
  await expect(page.locator('.pinned-tabs .tab-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'New folder', exact: true }).click({ force: true });
  await page.getByLabel('Folder name').fill('Browser ideas');
  await page.getByRole('button', { name: 'Create folder', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Browser ideas', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('.space-label')).toHaveText('Side projects');
  await page.getByRole('button', { name: 'Switch to Personal' }).click();
  await expect(page.locator('.pinned-tabs')).toContainText('A little space for you');
});

test('theme, dark mode, split view and sidebar controls work', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'lavender theme' }).click();
  await page.getByRole('button', { name: 'Evening mode' }).click();
  await expect(page.locator('.app')).toHaveClass(/theme-lavender dark/);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await expect(page.locator('.app')).toHaveClass(/theme-lavender dark/);
  await page.getByRole('button', { name: /Split view/ }).click();
  await expect(page.locator('.browser-pane')).toHaveCount(2);
  await page.getByRole('button', { name: 'Exit split view' }).click();
  await expect(page.locator('.browser-pane')).toHaveCount(1);
  await page.getByRole('button', { name: /Toggle sidebar/ }).click();
  await expect(page.locator('.app')).toHaveClass(/sidebar-hidden/);
  await page.getByRole('button', { name: 'Show sidebar' }).click();
  await expect(page.locator('.app')).not.toHaveClass(/sidebar-hidden/);
});

test('unsafe schemes never become tabs', async ({ page }) => {
  await page.getByRole('button', { name: /Where would you like to go/ }).click();
  await page.getByRole('combobox', { name: 'Search or enter URL' }).fill('javascript:alert(1)');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('only web addresses');
  await expect(page.locator('.tab-row')).toHaveCount(3);
});

test('mobile keeps navigation accessible without document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: /Where would you like to go/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole('button', { name: /Toggle sidebar/ }).click();
  await expect(page.getByRole('button', { name: 'Show sidebar' })).toBeVisible();
});
