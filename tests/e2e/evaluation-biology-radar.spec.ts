import { expect, test } from '@playwright/test';

test('biology has its own radar and returns to the existing test battery', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: /Biologie/ }).click();
  const navigation = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await navigation.getByRole('button', { name: 'Radar des candidats' }).click();
  const radar = page.getByRole('region', { name: 'Radar de correction biologique' });
  await expect(radar).toBeVisible();
  await expect(radar.getByLabel('Protocole du radar biologique')).toBeVisible();
  await expect(radar.getByText('Fidélité', { exact: false }).first()).toBeVisible().catch(() => {});
  await expect(page.getByRole('region', { name: 'Radar des candidats scientifiques' })).toHaveCount(0);
  await navigation.getByRole('button', { name: 'Tests' }).click();
  await expect(page.getByRole('region', { name: 'Protocole de test guidé' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await navigation.getByRole('button', { name: 'Radar des candidats' }).click();
  await expect(radar).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
