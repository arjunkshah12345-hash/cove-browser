import { test, expect } from '@playwright/test';

test('launch site renders without errors or third-party network dependencies', async ({ page }) => {
  const errors = [];
  const external = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:4174') external.push(request.url());
  });
  await page.goto('./');
  await expect(page).toHaveTitle(/Cove/);
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);
  await page.evaluate(() => document.fonts.ready);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test('local styles, scripts and font assets resolve at a Pages project subpath', async ({ page, request }) => {
  await page.goto('./');
  const assets = await page.locator('link[rel="stylesheet"], script[src]').evaluateAll((elements) => elements.map((element) => element.href || element.src));
  for (const asset of [...assets, 'http://127.0.0.1:4174/cove-browser/assets/dm-sans.woff2', 'http://127.0.0.1:4174/cove-browser/assets/instrument-serif.woff2']) {
    const response = await request.get(asset);
    expect(response.status(), asset).toBe(200);
    expect(response.headers()['content-type'], asset).not.toContain('text/html');
  }
});

test('alpha disclosures and real source build path stay visible', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('link', { name: /build the alpha/i }).first()).toHaveAttribute('href', '#build');
  await expect(page.locator('#build')).toContainText('npm ci');
  await expect(page.locator('#build')).toContainText('npm run desktop');
  await expect(page.locator('body')).toContainText(/unsigned/i);
  await expect(page.locator('body')).toContainText(/sensitive browsing/i);
  await expect(page.locator('body')).toContainText(/automatic updates/i);
  await expect(page.locator('a[download]')).toHaveCount(0);
});

test('all in-page navigation targets exist', async ({ page }) => {
  await page.goto('./');
  const missing = await page.locator('a[href^="#"]').evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href')).filter((href) => href.length < 2 || !document.getElementById(decodeURIComponent(href.slice(1)))));
  expect(missing).toEqual([]);
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
  await expect(page.locator(':focus')).toHaveJSProperty('tagName', 'A');
});

test('mobile layout avoids horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await expect(page.locator('h1')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('reduced-motion rendering retains build navigation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await page.getByRole('link', { name: /build the alpha/i }).first().click();
  await expect(page.locator('#build')).toBeInViewport();
});

test('build commands copy to the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');
  await page.getByRole('button', { name: 'Copy commands' }).click();
  await expect(page.getByRole('status')).toContainText('Build commands copied.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('npm run desktop');
});

test('clipboard denial leaves selectable commands and accessible feedback', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('Permission denied'); } } });
  });
  await page.goto('./');
  const button = page.getByRole('button', { name: 'Copy commands' });
  await button.click();
  await expect(page.getByRole('status')).toContainText('Select the commands above');
  await expect(button).toBeEnabled();
  await expect(page.locator('#build-commands')).toContainText('npm ci');
});
