import { expect, type Page } from '@playwright/test';

/** Open the selected assignment and enter the copy-import step used by correction-flow tests. */
export async function openActiveAssignment(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Mes devoirs' })).toBeVisible();
  await page.getByRole('button', { name: /Reprendre le devoir/ }).click();
  await expect(page.locator('.teacher-workspace-navigation')).toBeVisible();
  await expect(page.getByRole('tablist', { name: 'Sections du devoir' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Suivi des copies' })).toBeVisible();
  await page.locator('.copy-overview-heading').getByRole('button', { name: /Ajouter des copies/ }).click();
  await expect(page.getByRole('heading', { name: 'Ajouter des copies' })).toBeVisible();
  await page.getByRole('button', { name: 'Préparer manuellement une copie et ses pages' }).click();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toBeVisible();
}
