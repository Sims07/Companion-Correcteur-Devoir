import type { Page } from '@playwright/test';

/** Select one saved model without exposing a permanent configuration panel in the test workbench. */
export async function chooseEvaluationModel(page: Page, name?: string) {
  await page.getByRole('button', { name: 'Gérer les configurations' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gérer les configurations IA' });
  const options = dialog.getByRole('group', { name: 'Configurations à exécuter' });
  const checkbox = name
    ? options.getByRole('checkbox', { name: new RegExp(name, 'i') })
    : options.getByRole('checkbox').first();
  if (!await checkbox.isChecked()) await checkbox.check();
  await dialog.getByRole('button', { name: 'Terminer' }).click();
}
