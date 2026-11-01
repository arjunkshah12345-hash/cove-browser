import { test, expect } from '@playwright/test';

const key = 'cove.workspace.v1';

test('corrupt saved data stays protected until explicit backup recovery', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'sand theme' }).click();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).theme, key)).toBe('sand');
  await page.evaluate(key => {
    localStorage.setItem(`${key}.backup`, localStorage.getItem(key));
    localStorage.setItem(key, '{broken workspace');
  }, key);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Recover workspace', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'lavender theme' }).click();
  await expect(page.locator('.app')).toHaveClass(/theme-lavender/);
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe('{broken workspace');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Recover workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Restore last valid backup', exact: true }).click();
  await expect(page.locator('.app')).toHaveClass(/theme-sand/);
  expect(await page.evaluate(key => localStorage.getItem(`${key}.quarantine`), key)).toBe('{broken workspace');
  await page.reload();
  await expect(page.locator('.app')).toHaveClass(/theme-sand/);
  await expect(page.getByRole('button', { name: 'Recover workspace', exact: true })).toHaveCount(0);
});

test('auto-archive is opt-in, persists, and leaves visible and pinned tabs alone', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Auto-archive inactive tabs', { exact: true })).toHaveValue('0');
  await page.getByLabel('Auto-archive inactive tabs', { exact: true }).selectOption('24');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).autoArchiveHours, key)).toBe(24);
  await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key));
    const lastActiveAt = Date.now() - 48 * 60 * 60 * 1000;
    state.tabs = state.tabs.map(tab => ({ ...tab, lastActiveAt }));
    state.tabs.push({ id: 'stale-example', spaceId: 'personal', title: 'Stale example', url: 'https://example.com/', pinned: false, lastActiveAt });
    localStorage.setItem(key, JSON.stringify(state));
  }, key);
  await page.reload();
  await expect.poll(() => page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key));
    return { active: state.tabs.some(tab => tab.id === state.activeTabId), pinned: state.tabs.some(tab => tab.id === 'arena'), stale: state.tabs.some(tab => tab.id === 'stale-example'), archived: state.archive.some(tab => tab.id === 'stale-example') };
  }, key)).toEqual({ active: true, pinned: true, stale: false, archived: true });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByLabel('Auto-archive inactive tabs', { exact: true })).toHaveValue('24');
});

test('workspace import previews replacement and cancellation preserves the current workspace', async ({ page }) => {
  await page.goto('/');
  const imported = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
  imported.theme = 'lavender';
  imported.spaces[0].name = 'Imported space';
  const file = { name: 'workspace.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported)) };
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(file);
  await expect(page.getByRole('dialog', { name: 'confirm-import' })).toContainText('replaces your current');
  await expect(page.locator('.app')).toHaveClass(/theme-sage/);
  await page.getByRole('button', { name: 'Keep current workspace' }).click();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).spaces[0].name, key)).toBe('Personal');
  await page.locator('input[type="file"][accept="application/json,.json"]').setInputFiles(file);
  await page.getByRole('button', { name: 'Replace workspace', exact: true }).click();
  await expect(page.locator('.space-label')).toContainText('Imported space');
  await page.reload();
  await expect(page.locator('.app')).toHaveClass(/theme-lavender/);
  await expect(page.locator('.space-label')).toContainText('Imported space');
});

test('fresh recovery preserves a missing-primary backup after later preference changes', async ({ page }) => {
  await page.goto('/');
  const original = await page.evaluate(key => {
    const raw = localStorage.getItem(key);
    localStorage.setItem(`${key}.backup`, raw);
    localStorage.removeItem(key);
    return raw;
  }, key);
  await page.reload();
  await page.getByRole('button', { name: 'Recover workspace', exact: true }).click();
  await page.getByRole('button', { name: 'Start fresh and preserve saved data' }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'sand theme' }).click();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(`${key}.backup.quarantine`), key)).toBe(original);
});

test('enabling auto-archive does not archive a page that was just visible while disabled', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key));
    state.tabs.push({ id: 'recently-visible', spaceId: 'personal', title: 'Recently visible', url: 'https://example.com/', pinned: false });
    state.activeTabId = 'recently-visible';
    localStorage.setItem(key, JSON.stringify(state));
  }, key);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Recently visible', exact: true })).toBeVisible();
  await page.clock.setSystemTime(Date.now() + 48 * 60 * 60 * 1000);
  await page.getByRole('button', { name: 'A little space for you', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Auto-archive inactive tabs', { exact: true }).selectOption('24');
  await expect.poll(() => page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key));
    return { enabled: state.autoArchiveHours, kept: state.tabs.some(tab => tab.id === 'recently-visible') };
  }, key)).toEqual({ enabled: 24, kept: true });
});
