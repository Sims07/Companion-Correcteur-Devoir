import { expect, test } from '@playwright/test';
import { openActiveAssignment } from './helpers/teacher-workspace';
test('teachers can export a selected rubric criterion as a portable versioned JSON file', async ({ page }) => {
 await page.goto('/'); await openActiveAssignment(page); await page.getByRole('tab', { name: 'Barème' }).click();
 const summary = page.locator('.rubric-export-panel > summary'); await expect(summary).toBeVisible(); await summary.click();
 const panel = page.locator('.rubric-export-panel'); const choices = panel.locator('.rubric-export-criteria input[type="checkbox"]');
 await expect(choices).toHaveCount(3); await choices.nth(1).uncheck();
 const downloadPromise = page.waitForEvent('download'); await panel.getByRole('button', { name: 'Télécharger le JSON' }).click();
 const download = await downloadPromise; expect(download.suggestedFilename()).toMatch(/criteres\.json$/);
 await expect(panel.getByRole('status')).toContainText('2 critère(s) exporté(s)');
});
