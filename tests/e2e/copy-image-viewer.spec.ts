import { expect, test } from '@playwright/test';
import { openActiveAssignment } from './helpers/teacher-workspace';
import { openActiveAssignment } from './helpers/teacher-workspace';

test('teacher can open an imported copy page in a fullscreen viewer and zoom it', async ({ page }) => {
  await page.goto('/');
  await openActiveAssignment(page);
  await page.locator('#copy-files').setInputFiles({
    name: 'page-1.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pXcAAAAASUVORK5CYII=', 'base64'),
  });
  const thumbnail = page.getByRole('button', { name: 'Agrandir la page 1' });
  await expect(thumbnail).toBeVisible();
  await thumbnail.click();
  const viewer = page.getByRole('dialog', { name: 'Visualiseur de la page 1' });
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText('100 %')).toBeVisible();
  await viewer.getByRole('button', { name: 'Zoomer', exact: true }).click();
  await expect(viewer.getByText('125 %')).toBeVisible();
  await viewer.getByRole('button', { name: 'Fermer le visualiseur' }).click();
  await expect(viewer).toHaveCount(0);
});


test('teacher can rotate each batch page manually before or during processing', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('companion-correcteur:auto-background-correction:v1', 'false');
    localStorage.setItem('companion-correcteur:ollama-configuration:v1', JSON.stringify({
      endpoint: 'https://ai.example',
      apiCompatible: true,
      apiKey: 'test-token',
      visionModel: 'vision-model',
      analysisModel: 'analysis-model',
    }));
  });
  await page.reload();
  await openActiveAssignment(page);
  await page.getByRole('button', { name: /Correction en série/ }).click();
  await page.locator('#background-copy-files').setInputFiles({
    name: 'schema-cellule.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pXcAAAAASUVORK5CYII=', 'base64'),
  });

  const preview = page.getByRole('img', { name: 'Aperçu de la page 1 de schema-cellule.png' });
  await expect(preview).toBeVisible();
  const originalSource = await preview.getAttribute('src');
  await page.getByRole('button', { name: 'Tourner la page 1 de schema-cellule.png à droite de 90 degrés' }).click();

  await expect(page.getByText('Page 1 · tournée de 90°')).toBeVisible();
  await expect.poll(() => preview.getAttribute('src')).not.toBe(originalSource);
  await expect(page.getByText('La transcription et les évaluations précédentes ont été invalidées')).toBeVisible();
});
