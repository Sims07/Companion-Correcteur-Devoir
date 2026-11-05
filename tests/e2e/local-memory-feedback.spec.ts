import { expect, test } from '@playwright/test';

test('local rules show neutral information and successful saves in distinct semantic styles', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Règles de correction/ }).click();
  const panel = page.locator('.memory-panel');

  await panel.getByRole('button', { name: /Nouvelle correction/ }).click();
  const info = panel.getByRole('status').filter({ hasText: 'Nouvelle correction : les retours précédents' });
  await expect(info).toHaveCSS('border-left-color', 'rgb(110, 102, 95)');

  await panel.getByLabel('Votre décision').fill('Accepter la réponse si les étapes du mécanisme sont justes.');
  await panel.getByRole('button', { name: 'Enregistrer la décision' }).click();
  const success = panel.getByRole('status').filter({ hasText: 'Retour enregistré pour cette correction.' });
  await expect(success).toHaveCSS('border-left-color', 'rgb(39, 98, 58)');
  await expect(success).toHaveCSS('color', 'rgb(43, 43, 49)');
  await expect(panel.locator('.memory-checkbox input')).toHaveCSS('accent-color', 'rgb(161, 77, 55)');
});
