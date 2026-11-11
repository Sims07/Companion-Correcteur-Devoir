import { expect, test } from '@playwright/test';

test('teacher correction rules never overlay model evaluation or network diagnostics', async ({ page }) => {
  await page.goto('/');
  const floatingRules = page.locator('.memory-fab');

  // The correction assistant remains accessible in the teacher workspace.
  await expect(floatingRules).toBeVisible();
  await floatingRules.click();
  await expect(page.getByRole('complementary', { name: 'Règles de correction' })).toBeVisible();

  // Keyboard navigation remains possible even while the teacher panel is open.
  await page.getByRole('button', { name: 'Évaluer les modèles' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Évaluer les modèles' })).toBeVisible();
  await expect(floatingRules).toBeHidden();
  await expect(page.locator('.memory-panel')).toBeHidden();

  // Navigating between evaluation and diagnostics must not restore an overlay.
  await page.getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('button', { name: 'Suivi & diagnostic' }).click();
  await expect(floatingRules).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(floatingRules).toBeHidden();
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.getByRole('button', { name: 'Correction', exact: true }).click();
  await expect(floatingRules).toBeVisible();
  await floatingRules.click();
  await expect(page.locator('.memory-panel')).toBeHidden();
});
