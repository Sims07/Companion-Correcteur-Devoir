import { expect, test } from '@playwright/test';
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



test('teacher can rotate each batch page manually before starting the series', async ({ page }) => {
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
  const chooser = page.getByRole('region', { name: 'Choisir le mode de correction' });
  await chooser.getByRole('button', { name: /Correction en série/ }).click();
  const series = page.getByRole('region', { name: 'Session de correction en série' });
  await series.getByLabel('Démarrer automatiquement la correction').uncheck();
  const imageBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 4;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D unavailable');
    context.fillStyle = '#174f78';
    context.fillRect(0, 0, 4, 4);
    context.fillStyle = '#e4a23a';
    context.fillRect(4, 0, 4, 4);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await series.locator('#series-copy-files').setInputFiles({
    name: 'schema-cellule.png',
    mimeType: 'image/png',
    buffer: Buffer.from(imageBase64, 'base64'),
  });

  const preview = series.getByRole('img', { name: 'Page 1 de schema-cellule.png' });
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight])).toEqual([8, 4]);
  await series.getByRole('button', { name: 'Tourner la page 1 de schema-cellule.png à droite de 90 degrés' }).click();

  await expect(series.getByText(/Page 1 · tournée de 90°/)).toBeVisible();
  await expect.poll(() => preview.evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight])).toEqual([4, 8]);
});
