import { expect, test } from '@playwright/test';

test('scientific page routing is automatic and is no longer configured per assignment', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Définir le devoir/ }).click();
  await expect(page.getByRole('checkbox', { name: /Ce devoir comporte des schémas scientifiques à évaluer/ })).toHaveCount(0);
});


test('a rubric criterion can be explicitly routed to scientific diagram Vision analysis', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Définir le devoir/ }).click();
  const diagramCheckbox = page.getByRole('checkbox', { name: /Analyse de schéma scientifique/ }).first();
  await expect(diagramCheckbox).toBeVisible();
  await diagramCheckbox.check();
  await expect(diagramCheckbox).toBeChecked();
  await diagramCheckbox.uncheck();
  await expect(diagramCheckbox).not.toBeChecked();
});
