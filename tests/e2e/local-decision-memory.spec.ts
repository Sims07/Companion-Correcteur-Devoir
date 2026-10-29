import { expect, test } from '@playwright/test';

test('teacher decisions stay available locally after reloading the page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Règles de correction/ }).click();

  await page.getByLabel('Votre décision').fill('Pour ce barème, accepter le terme diffusion facilitée si le mécanisme est expliqué.');
  await page.getByRole('button', { name: 'Enregistrer la décision' }).click();
  await expect(page.locator('.memory-status')).toContainText('Retour enregistré');
  await expect(page.locator('.memory-entry')).toContainText('accepter le terme diffusion facilitée');

  await page.reload();
  await page.getByRole('button', { name: /Règles de correction/ }).click();
  await expect(page.locator('.memory-entry')).toContainText('accepter le terme diffusion facilitée');
});
