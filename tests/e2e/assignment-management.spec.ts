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
  await expect(page.locator('.assignment-details-collapsible')).toBeVisible();
  await page.locator('.assignment-details-collapsible > summary').click();
  await expect(page.getByLabel('Description et objectifs pédagogiques')).toBeVisible();
  await expect(page.getByLabel('Niveau scolaire / universitaire')).toBeVisible();
  await page.getByLabel('Nom du devoir', { exact: true }).fill('Contrôle de biologie');
  await page.getByLabel('Description et objectifs pédagogiques').fill('Vérifier la compréhension des notions du chapitre.');
  await page.getByLabel('Niveau scolaire / universitaire').selectOption('Université — Licence 1');
  await expect(page.getByRole('heading', { name: 'Préparer le barème de correction' })).toBeVisible();
  await expect(page.getByLabel('Nom du barème (distinct du devoir)')).toHaveValue('Barème à définir');
  await expect(page.getByRole('status').filter({ hasText: 'Le barème n’est pas encore défini' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuer vers les copies' })).toBeDisabled();

  await currentAssignment.click();
  await page.locator('.sidebar-assignment-actions summary[aria-label="Actions pour Contrôle de biologie"]').click();
  page.on('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Les corrections déjà archivées seront conservées');
    await dialog.accept();
  });
  await page.getByRole('button', { name: 'Supprimer', exact: true }).click();

  await expect(currentAssignment).toContainText('Devoir de biologie');
  await page.locator('.sidebar-assignment-actions summary[aria-label="Actions pour Devoir de biologie"]').click();
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


test('the full-width assignment library searches, filters and opens assignments', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Tous mes devoirs/ }).click();
  await expect(page.getByRole('heading', { name: 'Mes devoirs' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Créer un devoir/ })).toBeVisible();
  await expect(page.locator('.assignment-overview-card')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Rechercher un devoir' }).fill('introuvable');
  await expect(page.getByText('Aucun devoir trouvé')).toBeVisible();
  await page.getByRole('button', { name: 'Effacer les filtres' }).click();
  await expect(page.locator('.assignment-overview-card')).toHaveCount(1);
  await page.getByRole('button', { name: /Reprendre le devoir/ }).click();
  await expect(page.locator('.teacher-sidebar')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mes devoirs' })).toHaveCount(0);
});

test('the assignment library keeps 20 assignments discoverable in a responsive card grid', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Tous mes devoirs/ }).click();
  for (let index = 0; index < 19; index += 1) {
    await page.getByRole('button', { name: /Créer un devoir/ }).click();
    await page.getByRole('button', { name: /Tous mes devoirs/ }).click();
  }
  await expect(page.locator('.assignment-overview-card')).toHaveCount(20);
  await page.getByRole('searchbox', { name: 'Rechercher un devoir' }).fill('Nouveau devoir');
  await expect(page.locator('.assignment-overview-card')).toHaveCount(19);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.assignments-card-grid')).toBeVisible();
  await expect(page.locator('.assignment-overview-card').first()).toBeVisible();
});
