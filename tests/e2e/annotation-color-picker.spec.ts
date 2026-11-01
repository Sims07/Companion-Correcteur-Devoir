import { expect, test } from '@playwright/test';

test('teacher can sample an annotation color from the original image and inspect the before/after result', async ({ page }) => {
  await page.goto('/');
  await page.locator('#copy-files').setInputFiles({
    name: 'annotation-color.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNkWLaMgYGBiYGBgYGBAQAPFAFQlJHgBAAAAABJRU5ErkJggg==', 'base64'),
  });

  await page.getByText('Couleur des annotations', { exact: true }).click();
  const originalPreview = page.getByRole('button', { name: 'Agrandir l’image avant et choisir une couleur' });
  await expect(originalPreview).toBeVisible();
  await originalPreview.click();

  const beforeViewer = page.getByRole('dialog', { name: 'Visualiseur de l’image avant traitement' });
  await expect(beforeViewer).toBeVisible();
  await beforeViewer.getByRole('button', { name: 'Zoomer', exact: true }).click();
  await expect(beforeViewer.getByText('125 %')).toBeVisible();

  const image = beforeViewer.locator('.annotation-ink-sample-image');
  const bounds = await image.boundingBox();
  if (!bounds) throw new Error('L’image originale doit être visible dans la visionneuse.');
  await image.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  await expect(page.getByText('Couleur sélectionnée : #00A6A6')).toBeVisible();
  await expect(beforeViewer.getByRole('status')).toContainText('Couleur active : #00A6A6');
  await expect(beforeViewer.locator('.annotation-ink-picked-swatch')).toHaveCSS('background-color', 'rgb(0, 166, 166)');
  await beforeViewer.getByRole('button', { name: 'Terminer la sélection' }).click();

  await page.getByRole('button', { name: 'Prévisualiser le retrait' }).click();
  await expect(page.getByRole('button', { name: 'Agrandir l’image après retrait' })).toBeVisible();
  await page.getByRole('button', { name: 'Agrandir l’image après retrait' }).click();
  const afterViewer = page.getByRole('dialog', { name: 'Visualiseur de l’image après traitement' });
  await expect(afterViewer).toBeVisible();
  await expect(afterViewer.getByText('Vérifiez que les réponses de l’étudiant sont intactes.')).toBeVisible();
  await afterViewer.getByRole('button', { name: 'Fermer le visualiseur' }).click();
});
