import { test, expect } from '@playwright/test';

async function tabTo(page, control) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.keyboard.press('Tab');
    if (await control.evaluate((element) => element === document.activeElement)) return;
  }
  await expect(control).toBeFocused();
}

test('reduced motion never starts animations when spaces or split view change', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');

  const samples = await page.evaluate(async () => {
    const runningCount = () => document.getAnimations().filter((animation) => animation.playState === 'running').length;
    const counts = [runningCount()];
    for (const label of ['Work space', 'Toggle split view', 'Personal space', 'Toggle split view']) {
      document.querySelector(`button[aria-label="${label}"]`).click();
      counts.push(runningCount());
      await new Promise(requestAnimationFrame);
      counts.push(runningCount());
    }
    return counts;
  });

  expect(samples).toEqual(samples.map(() => 0));
  await expect(page.locator('.browser-preview')).toHaveAttribute('data-space', 'personal');
  await expect(page.locator('.browser-preview')).toHaveAttribute('data-split', 'false');
  await expect(page.locator('.split-page')).toBeHidden();
});

test('switching dynamically to reduced motion cancels running animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('./');
  await page.locator('.browser-preview').scrollIntoViewIfNeeded();

  const runningBefore = await page.evaluate(() => {
    document.querySelector('button[aria-label="Work space"]').click();
    document.querySelector('button[aria-label="Toggle split view"]').click();
    return document.getAnimations().filter((animation) => animation.playState === 'running').length;
  });
  expect(runningBefore).toBeGreaterThan(0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0);
  await expect(page.locator('.browser-preview')).toHaveAttribute('data-space', 'work');
  await expect(page.locator('.browser-preview')).toHaveAttribute('data-split', 'true');
  await expect(page.locator('.split-page')).toBeVisible();
});

test('rapid space and split changes preserve the final content and hidden state', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('./');

  for (const finalSplit of [true, false]) {
    await page.evaluate(async (enabled) => {
      const click = (label) => document.querySelector(`button[aria-label="${label}"]`).click();
      for (let attempt = 0; attempt < 8; attempt += 1) {
        click('Work space');
        click('Toggle split view');
        click('Personal space');
        click('Toggle split view');
      }
      click('Work space');
      const split = document.querySelector('button[aria-label="Toggle split view"]');
      if ((split.getAttribute('aria-pressed') === 'true') !== enabled) split.click();
      await Promise.allSettled(document.getAnimations().map((animation) => animation.finished));
    }, finalSplit);

    const preview = page.locator('.browser-preview');
    await expect(preview).toHaveAttribute('data-space', 'work');
    await expect(preview).toHaveAttribute('data-split', String(finalSplit));
    await expect(page.getByRole('button', { name: 'Work space', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Personal space', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'Toggle split view', exact: true })).toHaveAttribute('aria-pressed', String(finalSplit));
    await expect(preview.getByRole('heading', { name: 'Good ideas start with space.' })).toBeVisible();
    await expect(preview).toContainText('Room for good ideas');
    await expect(preview).toContainText('A clear head. A fresh perspective.');
    await expect(preview).not.toContainText(/A little space\s*for you\./);
    await expect(page.locator('.split-page')).toHaveJSProperty('hidden', !finalSplit);
    if (finalSplit) await expect(page.locator('.split-page')).toBeVisible();
    else await expect(page.locator('.split-page')).toBeHidden();
  }
});

test('Tab reaches preview controls and Enter and Space activate them', async ({ page }) => {
  await page.goto('./');
  const personal = page.getByRole('button', { name: 'Personal space', exact: true });
  const work = page.getByRole('button', { name: 'Work space', exact: true });
  const split = page.getByRole('button', { name: 'Toggle split view', exact: true });

  await tabTo(page, personal);
  await expect(personal).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(work).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(work).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.browser-preview')).toHaveAttribute('data-space', 'work');
  await page.keyboard.press('Tab');
  await expect(split).toBeFocused();
  await page.keyboard.press('Space');
  await expect(split).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.split-page')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(split).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.split-page')).toBeHidden();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(personal).toBeFocused();
  await page.keyboard.press('Space');
  await expect(personal).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.browser-preview')).toHaveAttribute('data-space', 'personal');
});

test('larger preview controls stay synchronized with the illustrated sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('./');
  const controls = page.getByRole('group', { name: 'Try the illustrated workspace' });
  const work = controls.getByRole('button', { name: 'Show Work workspace' });
  await work.click();
  await expect(work).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Work space', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await controls.getByRole('button', { name: 'Preview split view' }).click();
  await expect(page.locator('.split-page')).toBeVisible();
  await page.getByRole('button', { name: 'Toggle split view', exact: true }).click();
  await expect(controls.getByRole('button', { name: 'Preview split view' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Personal space', exact: true }).click();
  await expect(controls.getByRole('button', { name: 'Show Personal workspace' })).toHaveAttribute('aria-pressed', 'true');
  expect(await work.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false, reducedMotion: 'no-preference' });

  test('hero, build instructions and FAQ remain readable without initial opacity hiding', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Make yourself at home.' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Make yourself at home.' })).toContainText('npm run desktop');
    await expect(page.getByRole('heading', { name: 'Good questions.' })).toBeVisible();
    await page.getByText('Is this a fork of Arc?', { exact: false }).click();
    await expect(page.getByText(/No\. Cove is an independent implementation/)).toBeVisible();

    const transparentContent = await page.locator('main').evaluate((main) => {
      return Array.from(main.querySelectorAll('*')).filter((element) => {
        if (!element.textContent.trim() || element.getClientRects().length === 0) return false;
        if (getComputedStyle(element).visibility !== 'visible') return false;
        for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
          if (Number(getComputedStyle(ancestor).opacity) === 0) return true;
        }
        return false;
      }).map((element) => element.textContent.trim().slice(0, 100));
    });
    expect(transparentContent).toEqual([]);
  });
});
