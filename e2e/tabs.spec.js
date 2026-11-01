import { test, expect } from '@playwright/test';

const key = 'cove.workspace.v1';

test('tab actions reorder with keyboard-accessible buttons and pins reset their address', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(key => {
    const state = JSON.parse(localStorage.getItem(key));
    state.tabs.push(
      { id: 'alpha', title: 'Alpha', url: 'https://alpha.example/', spaceId: 'personal', pinned: false },
      { id: 'beta', title: 'Beta', url: 'https://beta.example/', spaceId: 'personal', pinned: false }
    );
    state.activeTabId = 'alpha';
    localStorage.setItem(key, JSON.stringify(state));
  }, key);
  await page.reload();
  await page.getByRole('button', { name: 'More options for Alpha' }).click();
  await page.getByRole('button', { name: 'Move tab down', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).tabs.filter(tab => ['alpha', 'beta'].includes(tab.id)).map(tab => tab.id), key)).toEqual(['beta', 'alpha']);
  await page.getByRole('button', { name: 'More options for Alpha' }).click();
  await page.getByRole('button', { name: 'Pin tab', exact: true }).click();
  await page.keyboard.press('Control+l');
  await page.getByRole('combobox', { name: 'Search or enter URL' }).fill('https://alpha.example/next');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'More options for alpha.example' }).click();
  await page.getByRole('button', { name: 'Reset pinned tab', exact: true }).click();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)).tabs.find(tab => tab.id === 'alpha').url, key)).toBe('https://alpha.example/');
});

test('archive search filters closed tabs and explains empty results', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Where would you like to go/ }).click();
  await page.getByRole('combobox', { name: 'Search or enter URL' }).fill('example.com');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'More options for example.com' }).click();
  await page.getByRole('button', { name: 'Close tab', exact: true }).click();
  await page.locator('.archive-button').click();
  await page.getByRole('textbox', { name: 'Search archived tabs' }).fill('not-in-archive');
  await expect(page.getByText('No archived tabs match this search.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Search archived tabs' }).fill('example');
  await expect(page.getByRole('dialog').getByRole('button', { name: /example.com/ })).toBeVisible();
});
