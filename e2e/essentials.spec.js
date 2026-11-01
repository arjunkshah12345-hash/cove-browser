import { test, expect } from '@playwright/test';
import { initialState, STORAGE_KEY } from '../src/model.js';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('folder rename and confirmed removal keep pinned and archived tabs', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Manage folders', exact: true }).click();
  await page.getByLabel('Folder name', { exact: true }).fill('Weekend ideas');
  await page.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Folders in this space' })).toContainText('Weekend ideas');
  await page.getByRole('button', { name: 'Delete folder', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Folders in this space' })).toContainText('Weekend ideas');
  await page.getByRole('button', { name: 'Delete folder', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm delete folder', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Folders in this space' })).not.toContainText('Weekend ideas');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await expect(page.locator('.tab-main').filter({ hasText: 'Are.na' })).toHaveCount(1);
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('cove.workspace.v1')));
  expect(state.folders.some(folder => folder.id === 'inspiration')).toBe(false);
  expect(state.tabs.find(tab => tab.id === 'arena')).toMatchObject({ pinned: true, title: 'Are.na' });
  expect(state.tabs.find(tab => tab.id === 'arena').folderId).toBeUndefined();
});

test('search-provider choice persists and controls command and address searches', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Search engine', { exact: true }).selectOption('brave');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await page.locator('.home-search').click();
  await expect(page.getByRole('dialog')).toContainText('Search with Brave Search');
  await page.getByRole('combobox', { name: 'Search or enter URL' }).fill('quiet corners');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('cove.workspace.v1'));
    return state.tabs.find(tab => tab.id === state.activeTabId)?.url;
  })).toBe('https://search.brave.com/search?q=quiet%20corners');
  await page.keyboard.press('Control+l');
  await page.getByRole('combobox', { name: 'Search or enter URL' }).fill('other corners');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('cove.workspace.v1'));
    return state.tabs.find(tab => tab.id === state.activeTabId)?.url;
  })).toBe('https://search.brave.com/search?q=other%20corners');
});

test('favorites can be added, edited, reordered, removed and persisted', async ({ page }) => {
  await page.getByRole('button', { name: 'Manage favorites', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Favorite name').fill('My corner');
  await dialog.getByLabel('Favorite address').fill('example.com');
  await dialog.getByRole('button', { name: 'Add favorite' }).click();
  await expect(dialog.getByRole('button', { name: 'Edit favorite My corner' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Edit favorite My corner' }).click();
  await dialog.getByLabel('Favorite name').fill('Reading corner');
  await dialog.getByRole('button', { name: 'Save favorite' }).click();
  await dialog.getByRole('button', { name: 'Move Reading corner up' }).click();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await expect(page.locator('.favorite-grid').getByRole('button', { name: 'Reading corner', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Manage favorites', exact: true }).click();
  await dialog.getByRole('button', { name: 'Remove favorite Reading corner' }).click();
  await expect(dialog.getByRole('button', { name: 'Edit favorite Reading corner' })).toHaveCount(0);
});

test('renaming, duplicating, moving and reopening a tab preserve workspace invariants', async ({ page }) => {
  await page.getByRole('button', { name: 'More options for A little space for you' }).click();
  await page.getByRole('button', { name: 'Rename tab', exact: true }).click();
  await page.getByRole('textbox', { name: 'Tab name' }).fill('My desk');
  await page.getByRole('button', { name: 'Save tab name' }).click();
  await expect(page.locator('.tab-main').filter({ hasText: 'My desk' })).toHaveCount(1);
  await page.getByRole('button', { name: 'More options for My desk' }).click();
  await page.getByRole('button', { name: 'Duplicate tab', exact: true }).click();
  await expect(page.locator('.tab-main').filter({ hasText: 'My desk' })).toHaveCount(2);
  await page.getByRole('button', { name: 'More options for My desk' }).last().click();
  await page.getByLabel('Move My desk to space').selectOption('work');
  await expect(page.locator('.tab-main').filter({ hasText: 'My desk' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Switch to Work' }).click();
  await page.getByRole('button', { name: 'More options for My desk' }).click();
  await page.getByRole('button', { name: 'Close tab', exact: true }).click();
  await page.keyboard.press('Control+Shift+T');
  await expect(page.locator('.tab-main').filter({ hasText: 'My desk' })).toHaveCount(1);
  await expect.poll(() => page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key));
    return state.tabs.find(tab => tab.id === state.activeTabId)?.spaceId === state.activeSpaceId;
  }, STORAGE_KEY)).toBe(true);
});

test('spaces can be renamed and removed without replacing other spaces', async ({ page }) => {
  await page.getByRole('button', { name: 'Space options', exact: true }).click();
  await page.getByLabel('Rename space').fill('At home');
  await page.getByRole('button', { name: 'Save space', exact: true }).click();
  await page.reload();
  await expect(page.locator('.space-label')).toHaveText('At home');
  await page.getByRole('button', { name: 'Space options', exact: true }).click();
  await page.getByRole('button', { name: 'Remove this space', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('website data is not erased');
  await page.getByRole('button', { name: 'Remove space', exact: true }).click();
  await expect(page.locator('.space-label')).toHaveText('Work');
  await expect(page.getByRole('button', { name: 'Switch to Studio' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch to At home' })).toHaveCount(0);
});

test('HTML import previews safe bookmarks, preserves folders and ignores duplicates', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Import bookmarks', exact: true }).click();
  await page.getByRole('dialog').locator('input[type="file"]').setInputFiles({ name: 'bookmarks.html', mimeType: 'text/html', buffer: Buffer.from('<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><DT><H3>Design shelf</H3><DL><DT><A HREF="https://example.com/design">Design notes</A><DT><A HREF="https://example.com/design">Duplicate</A><DT><A HREF="javascript:alert(1)">Unsafe</A><DT><A HREF="https://user:password@example.com/">Credentials</A><DT><A HREF="https://example.org/">A second corner</A></DL></DL><script>window.importRan=true</script><img src="https://not-requested.invalid/pixel">') });
  await expect(page.getByRole('dialog')).toContainText('2 new bookmarks found');
  await expect(page.locator('.tab-row')).toHaveCount(3);
  await page.getByRole('button', { name: 'Import 2 bookmarks' }).click();
  await expect(page.getByRole('button', { name: 'Design shelf', exact: true })).toBeVisible();
  await expect(page.locator('.tab-main').filter({ hasText: 'Design notes' })).toBeVisible();
  await expect(page.locator('.tab-row')).toHaveCount(5);
  expect(await page.evaluate(() => window.importRan)).toBeUndefined();
  await page.reload();
  await expect(page.locator('.tab-main').filter({ hasText: 'Design notes' })).toBeVisible();
});

test('browsing history is searchable, selectively removable and explicitly clearable', async ({ page }) => {
  const state = initialState();
  state.history = [
    { id: 'visit-1', title: 'A design notebook', url: 'https://example.com/design', spaceId: 'personal', visitedAt: Date.now() },
    { id: 'visit-2', title: 'A code notebook', url: 'https://example.org/code', spaceId: 'work', visitedAt: Date.now() - 86400000 }
  ];
  await page.evaluate(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: STORAGE_KEY, state });
  await page.reload();
  await page.keyboard.press('Control+y');
  const dialog = page.getByRole('dialog', { name: 'history' });
  await expect(dialog).toContainText('A design notebook');
  await dialog.getByLabel('Search browsing history').fill('code');
  await expect(dialog).not.toContainText('A design notebook');
  await dialog.getByRole('button', { name: 'Remove history entry A code notebook' }).click();
  await expect(dialog).toContainText('No matching pages');
  await dialog.getByLabel('Search browsing history').fill('');
  await dialog.getByRole('button', { name: 'Clear history', exact: true }).click();
  await expect(dialog).toContainText('Clear all saved browsing history?');
  await dialog.getByRole('button', { name: 'Clear history', exact: true }).click();
  await expect(dialog).toContainText('A fresh trail');
});

test('command palette exposes actions and split divider is keyboard accessible', async ({ page }) => {
  await page.getByRole('button', { name: /Where would you like to go/ }).click();
  await page.getByRole('combobox', { name: 'Search or enter URL' }).fill('favorites');
  await page.getByRole('option', { name: /Manage favorites Make the sidebar yours/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Keep your favorites close');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: /Split view/ }).click();
  const divider = page.getByRole('separator', { name: 'Resize split view' });
  await divider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(divider).toHaveAttribute('aria-valuenow', '55');
  const firstWidth = await page.locator('.browser-pane').first().evaluate(element => element.getBoundingClientRect().width);
  const secondWidth = await page.locator('.browser-pane').last().evaluate(element => element.getBoundingClientRect().width);
  expect(firstWidth).toBeGreaterThan(secondWidth);
});
