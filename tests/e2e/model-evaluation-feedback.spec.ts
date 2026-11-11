import { expect, test } from '@playwright/test';

test('profile feedback uses information, warning and success instead of the brand red', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('button', { name: 'Gérer les configurations' }).click();
  await page.getByRole('dialog', { name: 'Gérer les configurations IA' })
    .getByRole('button', { name: /Nouvelle configuration/ }).click();

  const info = page.getByRole('status').filter({ hasText: 'Nouvelle configuration : renseignez' });
  await expect(info).toBeVisible();
  await expect(info).toHaveCSS('border-left-color', 'rgb(110, 102, 95)');

  await page.getByRole('button', { name: 'Enregistrer la configuration' }).click();
  const warning = page.getByRole('status').filter({ hasText: 'Donnez un nom' });
  await expect(warning).toBeVisible();
  await expect(warning).toHaveCSS('border-left-color', 'rgb(145, 85, 31)');

  await page.getByRole('textbox', { name: 'Nom de la configuration' }).fill('Test palette B');
  await page.getByRole('button', { name: 'Enregistrer la configuration' }).click();
  const success = page.getByRole('status').filter({ hasText: 'Profil « Test palette B » enregistré' });
  await expect(success).toBeVisible();
  await expect(success).toHaveCSS('border-left-color', 'rgb(39, 98, 58)');
  await expect(success).toHaveCSS('color', 'rgb(43, 43, 49)');

  await expect(page.locator('.evaluation-thinking-option').first()).toHaveCSS('background-color', 'rgb(251, 248, 242)');
  await expect(page.locator('.evaluation-thinking-option input').first()).toHaveCSS('accent-color', 'rgb(161, 77, 55)');
});
