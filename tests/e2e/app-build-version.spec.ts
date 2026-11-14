import { expect, test } from '@playwright/test';

test('shows the app version in the header and offers reload for another published build', async ({ page }) => {
  await page.route('**/version.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ version: '99.0.0', revision: 'f'.repeat(40) }),
    });
  });
  await page.goto('/');
  const version = page.getByRole('button', { name: /Version de l’application/ });
  await expect(version).toBeVisible();
  await expect(version).toContainText('v0.3.0');
  await expect(version).toContainText('Mise à jour');
  await version.click();
  await expect(page.getByRole('status').getByText('Nouvelle version disponible.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recharger la dernière version' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(version).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('does not claim the installed version is current if the published version is unreachable', async ({ page }) => {
  await page.route('**/version.json', (route) => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: /Version de l’application/ }).click();
  await expect(page.getByRole('status').getByText(/Impossible de confirmer la dernière version/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recharger la dernière version' })).toHaveCount(0);
});
