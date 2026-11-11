import { expect, test } from '@playwright/test';
import { openActiveAssignment } from './helpers/teacher-workspace';

test('the two grading strategies coexist and the selected one persists across navigation', async ({ page }) => {
  await page.goto('/');
  await openActiveAssignment(page);
  await page.getByRole('button', { name: 'Configurer l’IA' }).click();
  const method = page.getByLabel('Méthode de correction');
  await expect(method).toHaveValue('generative');
  await method.selectOption('decision');
  await expect(method).toHaveValue('decision');
  await page.getByRole('button', { name: 'Terminé, revenir au devoir' }).click();
  await page.reload();
  await openActiveAssignment(page);
  await page.getByRole('button', { name: 'Configurer l’IA' }).click();
  await expect(page.getByLabel('Méthode de correction')).toHaveValue('decision');
  await page.getByLabel('Méthode de correction').selectOption('generative');
  await expect(page.getByLabel('Méthode de correction')).toHaveValue('generative');
});
