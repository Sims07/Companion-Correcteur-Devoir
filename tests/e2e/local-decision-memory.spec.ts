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

test('deleting a local correction uses a cancellable Atelier dialog', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Règles de correction/ }).click();
  await expect(page.locator('.memory-panel')).toHaveCSS('background-color', 'rgb(255, 253, 249)');
  await page.getByRole('button', { name: 'Supprimer cette correction' }).click();
  const dialog = page.getByRole('dialog', { name: 'Supprimer cette correction ?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS('background-color', 'rgb(255, 253, 249)');
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Supprimer cette correction' }).click();
  await dialog.getByRole('button', { name: 'Supprimer la correction' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.memory-status')).toContainText('supprimée');
});
