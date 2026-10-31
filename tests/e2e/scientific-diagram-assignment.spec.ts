import { expect, test } from '@playwright/test';

test('scientific page routing is automatic and is no longer configured per assignment', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Définir le devoir/ }).click();
  await expect(page.getByRole('checkbox', { name: /Ce devoir comporte des schémas scientifiques à évaluer/ })).toHaveCount(0);
});
