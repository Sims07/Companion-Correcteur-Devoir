import { expect, test } from '@playwright/test';

test('multi-model experiment is available in Diagnostic IA only', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Diagnostic IA' }).click();

  const strategy = page.getByLabel('Stratégie de comparaison');
  await expect(strategy).toBeVisible();
  await expect(strategy).toHaveValue('single');

  await strategy.selectOption('arbitrate');
  await expect(page.getByLabel('Second modèle d’analyse')).toBeVisible();
  await expect(page.getByLabel('Modèle arbitre')).toBeVisible();

  await page.getByRole('button', { name: 'Correction', exact: true }).click();
  await expect(page.getByLabel('Stratégie de comparaison')).toHaveCount(0);
});
