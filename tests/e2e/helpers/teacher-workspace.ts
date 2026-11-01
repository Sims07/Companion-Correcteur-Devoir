import { expect, type Page } from '@playwright/test';

/** Enter the selected assignment workspace from the assignment-first landing page. */
export async function openActiveAssignment(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Mes devoirs' })).toBeVisible();
  await page.getByRole('button', { name: /Reprendre le devoir/ }).click();
  await expect(page.locator('.teacher-sidebar')).toBeVisible();
}
