import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { initialState, STORAGE_KEY } from '../src/model.js';

async function seed(page, state) {
  await page.addInitScript(({ state, key }) => localStorage.setItem(key, JSON.stringify(state)), { state, key: STORAGE_KEY });
  await page.goto('/');
}

async function openBookmarks(page) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Import bookmarks', exact: true }).click();
  return page.getByRole('dialog');
}

test('history search, space and rolling date filters compose; confirmed matching clear preserves other visits', async ({ page }) => {
  const state = initialState();
  const now = Date.now();
  state.history = [
    { id: 'old', title: 'Notebook old', url: 'https://example.com/old', spaceId: 'personal', visitedAt: now - 40 * 86400000 },
    { id: 'work', title: 'Notebook work', url: 'https://example.com/work', spaceId: 'work', visitedAt: now - 1000 },
    { id: 'new', title: 'Notebook new', url: 'https://example.com/new', spaceId: 'personal', visitedAt: now - 1000 },
    { id: 'other', title: 'Other page', url: 'https://example.com/other', spaceId: 'personal', visitedAt: now - 1000 }
  ];
  await seed(page, state);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'history' });
  await dialog.getByRole('combobox', { name: 'History space', exact: true }).selectOption('personal');
  await dialog.getByLabel('History time range').selectOption('last24h');
  await dialog.getByLabel('Search browsing history').fill('notebook');
  await expect(dialog.locator('.tools-entry')).toHaveCount(1);
  await expect(dialog).toContainText('Notebook new');
  await dialog.getByRole('button', { name: 'Clear matching entries', exact: true }).click();
  await expect(dialog).toContainText('Clear only these 1 matching history entries? Other visits will be kept.');
  await dialog.getByRole('button', { name: 'Keep it', exact: true }).click();
  await expect(dialog.locator('.tools-entry')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Clear matching entries', exact: true }).click();
  await dialog.getByRole('button', { name: 'Clear matching entries', exact: true }).click();
  await expect(dialog).toContainText('No matching pages');
  await dialog.getByLabel('Search browsing history').fill('');
  await dialog.getByRole('combobox', { name: 'History space', exact: true }).selectOption('');
  await dialog.getByLabel('History time range').selectOption('all');
  await expect(dialog.locator('.tools-entry')).toHaveCount(3);
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).history.map(entry => entry.id), STORAGE_KEY)).toEqual(['old', 'work', 'other']);
  await dialog.getByRole('combobox', { name: 'History space', exact: true }).selectOption('work');
  await dialog.getByRole('button', { name: 'Clear entire history', exact: true }).click();
  await expect(dialog).toContainText('Clear all saved browsing history?');
  await dialog.getByRole('button', { name: 'Clear history', exact: true }).click();
  await expect(dialog).toContainText('No matching pages');
  await dialog.getByRole('combobox', { name: 'History space', exact: true }).selectOption('');
  await expect(dialog).toContainText('A fresh trail');
});

test('export downloads HTML for the selected scope, revokes the Blob URL and roundtrips through parseBookmarks', async ({ page }) => {
  await seed(page, initialState());
  await page.evaluate(() => {
    const revoke = URL.revokeObjectURL.bind(URL);
    window.revokedExports = [];
    URL.revokeObjectURL = url => { window.revokedExports.push(url); revoke(url); };
  });
  const dialog = await openBookmarks(page);
  await expect(dialog).toContainText('history, notes, permission grants, cookies, and archives are excluded');
  await dialog.getByLabel('Bookmark export scope').selectOption('current');
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export bookmarks HTML' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('cove-bookmarks-current-space.html');
  const html = await readFile(await download.path(), 'utf8');
  expect(html).toContain('<H3>Personal</H3>');
  expect(html).not.toContain('<H3>Work</H3>');
  expect(html).toContain('<H3>Favorites</H3>');
  expect(html).not.toContain('cove://');
  const imported = await page.evaluate(async html => {
    const { parseBookmarks } = await import('/src/bookmarks.js');
    return parseBookmarks(html);
  }, html);
  expect(imported).toContainEqual({ title: 'Are.na', url: 'https://www.are.na/', folder: 'Personal / Ideas & inspiration' });
  expect(imported).toContainEqual({ title: 'GitHub', url: 'https://github.com/', folder: 'Favorites' });
  await expect.poll(() => page.evaluate(() => window.revokedExports.length)).toBe(1);
  await dialog.getByLabel('Bookmark export scope').selectOption('all');
  const allDownloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export bookmarks HTML' }).click();
  const allDownload = await allDownloading;
  expect(allDownload.suggestedFilename()).toBe('cove-bookmarks-all-spaces.html');
  expect(await readFile(await allDownload.path(), 'utf8')).toContain('<H3>Work</H3>');
});

test('malicious labels and URLs roundtrip as text without executing markup', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { buildBookmarkExport } = await import('/src/bookmark-export.js');
    const { parseBookmarks } = await import('/src/bookmarks.js');
    const title = '<img src=x onerror="window.exportRan=true"> & friends';
    const state = { spaces: [{ id: 's', name: 'Space <safe>' }], folders: [{ id: 'f', spaceId: 's', name: 'A & B' }], tabs: [{ spaceId: 's', folderId: 'f', title, url: 'https://example.com/?a=1&b=2' }, { spaceId: 's', folderId: 'f', title: 'Duplicate', url: 'https://example.com/?a=1&b=2' }] };
    const html = buildBookmarkExport(state);
    return { bookmarks: parseBookmarks(html), ran: !!window.exportRan, images: new DOMParser().parseFromString(html, 'text/html').images.length };
  });
  expect(result).toEqual({ bookmarks: [{ title: '<img src=x onerror="window.exportRan=true"> & friends', url: 'https://example.com/?a=1&b=2', folder: 'Space <safe> / A & B' }], ran: false, images: 0 });
});

test('private export warns that the explicitly saved file persists after closing', async ({ page }) => {
  await page.addInitScript(() => {
    window.cove = { isPrivate: true, syncTabs: async () => {}, setLayout: async () => {}, stopFind: async () => {}, getDownloads: async () => [], onTabUpdate: () => () => {} };
  });
  await page.goto('/');
  const dialog = await openBookmarks(page);
  await expect(dialog).toContainText('Private window: exporting creates an explicit persistent HTML file.');
  await expect(dialog).toContainText('It remains on disk after this private window closes.');
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export bookmarks HTML' }).click();
  expect((await downloading).suggestedFilename()).toMatch(/\.html$/);
});
