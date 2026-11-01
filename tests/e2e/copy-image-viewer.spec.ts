import { expect, test } from '@playwright/test';

test('teacher can open an imported copy page in a fullscreen viewer and zoom it', async ({ page }) => {
  await page.goto('/');
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
