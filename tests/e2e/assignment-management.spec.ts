import { expect, test } from '@playwright/test';

test('new assignments start with an explicitly separate, empty rubric and can be deleted', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByLabel('DEVOIR EN COURS')).toHaveValue('Devoir de biologie');
  await page.getByRole('button', { name: 'Nouveau devoir' }).click();

  await expect(page.getByLabel('DEVOIR EN COURS')).toHaveValue('Nouveau devoir');
  await expect(page.getByRole('heading', { name: 'Préparer le barème de correction' })).toBeVisible();
  await expect(page.getByLabel('Nom du barème (distinct du devoir)')).toHaveValue('Barème à définir');
  await expect(page.getByRole('status').filter({ hasText: 'Le barème n’est pas encore défini' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuer vers la copie' })).toBeDisabled();

  page.on('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Les corrections déjà archivées seront conservées');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Supprimer le devoir Nouveau devoir' }).click();

  await expect(page.getByLabel('DEVOIR EN COURS')).toHaveValue('Devoir de biologie');
  await expect(page.getByRole('button', { name: 'Supprimer le devoir Devoir de biologie' })).toBeDisabled();
});

test('the assignment list scrolls instead of growing without bound', async ({ page }) => {
  await page.goto('/');

  for (let index = 0; index < 6; index += 1) {
    await page.getByRole('button', { name: /Nouveau devoir/ }).click();
  }

  const list = page.locator('.sidebar-assignment-items');
  await expect(list.locator('.sidebar-assignment-row')).toHaveCount(7);
  await expect.poll(() => list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
});
