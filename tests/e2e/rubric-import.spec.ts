import { expect, test } from '@playwright/test';
import { openActiveAssignment } from './helpers/teacher-workspace';

test('teachers preview a rubric import, detect conflicts and add only selected criteria', async ({ page }) => {
 await page.goto('/'); await openActiveAssignment(page); await page.getByRole('tab', { name: 'Barème' }).click();
 const panel = page.locator('.rubric-import-panel'); await panel.locator('summary').click();
 const payload = { format: 'companion-correcteur-rubric', version: 1, rubricTitle: 'Barème partagé', criteria: [
  { id: 'knowledge', title: 'Connaissances importées', description: 'Attendus spécifiques', maxPoints: 3 },
  { id: 'cell-cycle', title: 'Cycle cellulaire', description: 'Étapes et régulation', maxPoints: 2 },
 ] };
 await panel.locator('input[type="file"]').setInputFiles({ name: 'criteres.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
 await expect(panel.getByRole('region', { name: 'Aperçu des critères à importer' })).toBeVisible();
 await expect(panel.getByText('Identifiant déjà utilisé')).toBeVisible();
 await expect(panel.getByText('Nouveau critère')).toBeVisible();
 const choices = panel.locator('.rubric-import-preview-item input[type="checkbox"]');
 await expect(choices).toHaveCount(2); await expect(choices.nth(0)).not.toBeChecked(); await expect(choices.nth(1)).toBeChecked();
 await panel.getByRole('button', { name: 'Ajouter la sélection' }).click();
 await expect(panel.getByRole('status')).toContainText('1 critère(s) ajouté(s)');
 await expect(panel.locator('.ds-status-notice--success')).toHaveCSS('border-left-color', 'rgb(39, 98, 58)');
 await expect(page.locator('.criterion-editor')).toHaveCount(4);
});

test('teachers receive a clear message for unsupported import versions', async ({ page }) => {
 await page.goto('/'); await openActiveAssignment(page); await page.getByRole('tab', { name: 'Barème' }).click();
 const panel = page.locator('.rubric-import-panel'); await panel.locator('summary').click();
 const payload = { format: 'companion-correcteur-rubric', version: 99, rubricTitle: 'Futur', criteria: [{ id: 'x', title: 'X', description: '', maxPoints: 1 }] };
 await panel.locator('input[type="file"]').setInputFiles({ name: 'futur.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
 await expect(panel.getByRole('alert')).toContainText('Version d’export non prise en charge');
});
