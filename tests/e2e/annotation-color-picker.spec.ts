import { expect, test } from '@playwright/test';
import { openActiveAssignment } from './helpers/teacher-workspace';

test('teacher can sample an annotation color from the original image and inspect the before/after result', async ({ page }) => {
  await page.goto('/');
  await openActiveAssignment(page);
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


test('the browser preview removes faint scanned contours while preserving pencil strokes', async ({ page }) => {
  await page.goto('/');
  await openActiveAssignment(page);
  // Entirely synthetic pixels. Real private student copies are never test fixtures.
  const source = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 24;
    canvas.height = 24;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D unavailable');
    context.fillStyle = '#fefefe';
    context.fillRect(0, 0, 24, 24);
    context.fillStyle = '#232323'; // Student's grayscale drawing
    context.fillRect(3, 4, 1, 16);
    context.fillStyle = '#fffcca'; // Unrelated paper detail (different hue)
    context.fillRect(19, 1, 1, 3);
    context.fillStyle = '#fffdfa'; // Very faint annotation edge
    context.fillRect(7, 7, 10, 10);
    context.fillStyle = '#fef5ee'; // Pale orange annotation outline
    context.fillRect(8, 8, 8, 8);
    context.fillStyle = '#f07850'; // Color used by the teacher
    context.fillRect(9, 9, 6, 6);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#copy-files').setInputFiles({
    name: 'synthetic-annotation-fringe.png',
    mimeType: 'image/png',
    buffer: Buffer.from(source, 'base64'),
  });
  await page.getByText('Couleur des annotations', { exact: true }).click();
  await page.getByRole('button', { name: 'Agrandir l’image avant et choisir une couleur' }).click();
  const before = page.getByRole('dialog', { name: 'Visualiseur de l’image avant traitement' });
  const image = before.locator('.annotation-ink-sample-image');
  const bounds = await image.boundingBox();
  if (!bounds) throw new Error('Image source inaccessible');
  await image.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
  await expect(page.getByText('Couleur sélectionnée : #F07850')).toBeVisible();
  await before.getByRole('button', { name: 'Terminer la sélection' }).click();

  await page.getByRole('button', { name: 'Prévisualiser le retrait' }).click();
  await page.getByRole('button', { name: 'Agrandir l’image après retrait' }).click();
  const after = page.getByRole('dialog', { name: 'Visualiseur de l’image après traitement' });
  const preview = after.getByRole('img', { name: 'Image après retrait agrandie' });
  await expect(preview).toBeVisible();
  await expect.poll(async () => preview.evaluate((img: HTMLImageElement) => {
    if (!img.complete || !img.naturalWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const read = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3);
    return { core: read(12, 12), outline: read(8, 12), fringe: read(7, 12), pencil: read(3, 12), detail: read(19, 2) };
  })).toEqual({
    core: [254, 254, 254],
    outline: [254, 254, 254],
    fringe: [254, 254, 254],
    pencil: [35, 35, 35],
    detail: [255, 252, 202],
  });
});
