import { expect, test } from '@playwright/test';

test('scientific page routing is automatic and is no longer configured per assignment', async ({ page }) => {
  await page.goto('/');
  await page.locator('.teacher-step-nav .teacher-step').first().click();
  await expect(page.getByRole('checkbox', { name: /Ce devoir comporte des schémas scientifiques à évaluer/ })).toHaveCount(0);
});


test('a rubric criterion can be explicitly routed to scientific diagram Vision analysis', async ({ page }) => {
  await page.goto('/');
  await page.locator('.sidebar-assignment-current').click();
  await page.getByRole('button', { name: 'Nouveau devoir' }).click();
  await page.locator('.assignment-details-collapsible > summary').click();
  await page.getByLabel('Nom du devoir', { exact: true }).fill('Schéma de cellule');
  await page.getByLabel('Description et objectifs pédagogiques').fill('Évaluer un schéma scientifique.');
  await page.getByRole('button', { name: /Ajouter un critère/ }).click();
  const diagramCheckbox = page.getByRole('checkbox', { name: /Analyse de schéma scientifique/ }).first();
  await expect(diagramCheckbox).toBeVisible();
  await diagramCheckbox.check();
  await expect(diagramCheckbox).toBeChecked();
  await diagramCheckbox.uncheck();
  await expect(diagramCheckbox).not.toBeChecked();
});
