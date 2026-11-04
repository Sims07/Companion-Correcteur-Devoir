import { expect, test } from '@playwright/test';
import { openActiveAssignment } from './helpers/teacher-workspace';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxioAAAAASUVORK5CYII=', 'base64');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('companion-correcteur:auto-background-correction:v1', 'false');
    localStorage.setItem('companion-correcteur:ollama-configuration:v1', JSON.stringify({
      endpoint: 'http://localhost:11434', visionModel: 'vision:4b', analysisModel: 'analysis:4b',
    }));
  });
  await page.reload();
  await openActiveAssignment(page);
});

test('the only overview intake handles one multipage copy without splitting its photos', async ({ page }) => {
  const addButton = page.locator('.copy-overview-heading').getByRole('button', { name: /Ajouter des copies/ });
  await expect(addButton).toHaveAttribute('aria-expanded', 'false');
  await addButton.click();
  await expect(addButton).toHaveCount(0);
  const panel = page.locator('#teacher-copy-intake');
  await expect(panel).toBeVisible();
  await panel.getByRole('radio', { name: /Plusieurs fichiers pour une copie/ }).check();
  await panel.getByLabel('Nom de l’étudiant (facultatif)').fill('Étudiant exemple');
  await panel.locator('#teacher-copy-intake-files').setInputFiles([
    { name: 'page-1.png', mimeType: 'image/png', buffer: png },
    { name: 'page-2.png', mimeType: 'image/png', buffer: png },
  ]);
  const card = page.locator('.copy-overview-grid .correction-series-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText('Étudiant exemple');
  await expect(card).toContainText('2 page(s)');
  await expect(page.getByRole('button', { name: /En attente/ })).toContainText('1');
  await panel.getByRole('button', { name: 'Fermer' }).click();
  await expect(panel).toHaveCount(0);
  await expect(card).toHaveCount(1);
});

test('multiple files become separate copies and the active follow-up summarizes the workload', async ({ page }) => {
  await page.locator('.copy-overview-heading').getByRole('button', { name: /Ajouter des copies/ }).click();
  await expect(page.getByRole('radio', { name: /Un fichier par copie/ })).toBeChecked();
  await page.locator('#teacher-copy-intake-files').setInputFiles([
    { name: 'etudiant-1.png', mimeType: 'image/png', buffer: png },
    { name: 'etudiant-2.png', mimeType: 'image/png', buffer: png },
  ]);
  await expect(page.locator('.copy-overview-grid .correction-series-card')).toHaveCount(2);
  const summary = page.getByLabel('État des corrections');
  await expect(summary).toContainText('À vérifier');
  await expect(summary).toContainText('Corrigées');
  await expect(page.getByRole('button', { name: /En attente/ })).toContainText('2');
  await expect(page.locator('.teacher-copy-pages-details')).toBeVisible();
  await page.locator('.teacher-copy-pages-details summary').click();
  await expect(page.locator('.batch-copy-page-preview')).toHaveCount(2);
});
