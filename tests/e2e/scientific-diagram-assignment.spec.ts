import { expect, test } from '@playwright/test';

test('scientific diagram analysis is an explicit assignment-level option and persists locally', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Définir le devoir/ }).click();
  const option = page.getByRole('checkbox', { name: /Ce devoir comporte des schémas scientifiques à évaluer/ });
  await expect(option).not.toBeChecked();
  await option.check();
  await page.reload();
  await page.getByRole('button', { name: /Définir le devoir/ }).click();
  await expect(page.getByRole('checkbox', { name: /Ce devoir comporte des schémas scientifiques à évaluer/ })).toBeChecked();
});
