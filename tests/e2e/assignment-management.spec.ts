import { expect, test } from '@playwright/test';

test('the assignment library is the entry point and opens the selected teacher workspace', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Mes devoirs' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Créer un devoir/ })).toBeVisible();
  await expect(page.locator('.assignment-overview-card')).toHaveCount(1);

  await page.locator('.assignment-overview-card').getByRole('button', { name: /Reprendre le devoir/ }).click();
  await expect(page.locator('.teacher-sidebar')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mes devoirs' })).toHaveCount(0);
  await expect(page.locator('.sidebar-assignment-current')).toContainText('Devoir de biologie');

  await page.getByRole('button', { name: 'Mes devoirs' }).click();
  await expect(page.getByRole('heading', { name: 'Mes devoirs' })).toBeVisible();
});

test('teachers can create and delete an assignment from the library', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Créer un devoir/ }).click();
  await expect(page.locator('.teacher-sidebar')).toBeVisible();
  const details = page.locator('.assignment-details-collapsible');
  await expect(details).toBeVisible();
  await details.locator('summary').click();
  await page.getByLabel('Nom du devoir', { exact: true }).fill('Contrôle de biologie');
  await page.getByRole('button', { name: 'Mes devoirs' }).click();

  const card = page.locator('.assignment-overview-card').filter({ hasText: 'Contrôle de biologie' });
  await expect(card).toBeVisible();
  await card.locator('details.assignment-overview-menu summary').click();
  page.once('dialog', (dialog) => dialog.accept());
  await card.getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect(page.locator('.assignment-overview-card')).toHaveCount(1);
});

test('the assignment library keeps 20 assignments discoverable in a responsive card grid', async ({ page }) => {
  await page.goto('/');
  for (let index = 0; index < 19; index += 1) {
    await page.getByRole('button', { name: /Créer un devoir/ }).click();
    await page.getByRole('button', { name: 'Mes devoirs' }).click();
  }
  await expect(page.locator('.assignment-overview-card')).toHaveCount(20);
  await page.getByRole('searchbox', { name: 'Rechercher un devoir' }).fill('Nouveau devoir');
  await expect(page.locator('.assignment-overview-card')).toHaveCount(19);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.assignments-card-grid')).toBeVisible();
  await expect(page.locator('.assignment-overview-card').first()).toBeVisible();
});
