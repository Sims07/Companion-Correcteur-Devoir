import { expect, test } from '@playwright/test';

test('assignment management stays collapsed until requested and supports create, switch and delete', async ({ page }) => {
  await page.goto('/');

  const currentAssignment = page.locator('.sidebar-assignment-current');
  await expect(currentAssignment).toContainText('Devoir de biologie');
  await expect(currentAssignment).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.sidebar-assignment-menu')).toHaveCount(0);

  await currentAssignment.click();
  await expect(currentAssignment).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'Nouveau devoir' })).toBeVisible();

  await page.getByRole('button', { name: 'Nouveau devoir' }).click();
  await expect(currentAssignment).toContainText('Nouveau devoir');
  await expect(currentAssignment).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('heading', { name: 'Définir le devoir' })).toBeVisible();
  await expect(page.getByLabel('Description et objectifs pédagogiques')).toBeVisible();
  await expect(page.getByLabel('Niveau scolaire / universitaire')).toBeVisible();
  await page.getByLabel('Nom du devoir', { exact: true }).fill('Contrôle de biologie');
  await page.getByLabel('Description et objectifs pédagogiques').fill('Vérifier la compréhension des notions du chapitre.');
  await page.getByLabel('Niveau scolaire / universitaire').selectOption('Université — Licence 1');
  await page.getByRole('button', { name: /Continuer vers le barème/ }).click();
  await expect(page.getByRole('heading', { name: 'Préparer le barème de correction' })).toBeVisible();
  await expect(page.getByLabel('Nom du barème (distinct du devoir)')).toHaveValue('Barème à définir');
  await expect(page.getByRole('status').filter({ hasText: 'Le barème n’est pas encore défini' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuer vers la copie' })).toBeDisabled();

  await currentAssignment.click();
  await page.getByRole('button', { name: 'Actions pour Contrôle de biologie' }).click();
  page.on('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Les corrections déjà archivées seront conservées');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click();

  await expect(currentAssignment).toContainText('Devoir de biologie');
  await currentAssignment.click();
  await page.getByRole('button', { name: 'Actions pour Devoir de biologie' }).click();
  await expect(page.getByRole('button', { name: 'Supprimer', exact: true })).toBeDisabled();
});

test('the assignment list scrolls instead of growing without bound', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sidebar-assignment-current').click();

  for (let index = 0; index < 6; index += 1) {
    await page.locator('.sidebar-new-assignment').click();
    if (index < 5) await page.locator('.sidebar-assignment-current').click();
  }

  await page.locator('.sidebar-assignment-current').click();
  const list = page.locator('.sidebar-assignment-items');
  await expect(list.locator('.sidebar-assignment-row')).toHaveCount(7);
  await expect.poll(() => list.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
});
