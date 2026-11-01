import { test, expect } from '@playwright/test';

async function checkSpaceControls(page) {
  const preview = page.locator('.browser-preview');
  const personal = page.getByRole('button', { name: 'Personal space', exact: true });
  const work = page.getByRole('button', { name: 'Work space', exact: true });

  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute('data-space', 'personal');
  await expect(personal).toHaveAttribute('aria-pressed', 'true');
  await expect(work).toHaveAttribute('aria-pressed', 'false');

  await work.click();
  await expect(preview).toHaveAttribute('data-space', 'work');
  await expect(work).toHaveAttribute('aria-pressed', 'true');
  await expect(personal).toHaveAttribute('aria-pressed', 'false');

  await personal.click();
  await expect(preview).toHaveAttribute('data-space', 'personal');
  await expect(personal).toHaveAttribute('aria-pressed', 'true');
  await expect(work).toHaveAttribute('aria-pressed', 'false');
}

async function checkSplitControl(page) {
  const preview = page.locator('.browser-preview');
  const split = page.getByRole('button', { name: 'Toggle split view', exact: true });

  await expect(split).toHaveAttribute('aria-pressed', 'false');
  await split.click();
  await expect(split).toHaveAttribute('aria-pressed', 'true');
  await expect(preview).toHaveAttribute('data-split', 'true');

  await split.click();
  await expect(split).toHaveAttribute('aria-pressed', 'false');
  await expect(preview).toHaveAttribute('data-split', 'false');
}

test('workspace illustration switches between personal and work spaces', async ({ page }) => {
  await page.goto('./');
  await checkSpaceControls(page);
});

test('workspace illustration toggles split view on and off', async ({ page }) => {
  await page.goto('./');
  await checkSplitControl(page);
});

test('workspace remains an explicitly labeled interactive preview without embedded pages', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('body')).toContainText(/interactive.*preview/i);
  await expect(page.locator('iframe')).toHaveCount(0);

  await checkSpaceControls(page);
  await checkSplitControl(page);

  await expect(page.locator('body')).toContainText(/interactive.*preview/i);
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('320px mobile preview stays within the viewport and its buttons work', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('./');
  await page.evaluate(() => document.fonts.ready);

  const expectNoOverflow = async () => {
    expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= window.innerWidth)).toBe(true);
  };

  await expectNoOverflow();
  await checkSpaceControls(page);
  await checkSplitControl(page);
  await expectNoOverflow();
});
