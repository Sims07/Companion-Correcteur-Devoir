import { expect, test } from '@playwright/test';

test('reads both ends of the inversion pair and abstains on the headless link without a model', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' }).getByRole('button', { name: 'Tests', exact: true }).click();
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: /Schémas scientifiques/ }).click();
  await page.getByRole('tab', { name: /Graphe des relations/ }).click();
  await page.getByText('Détecter le sens des flèches sans modèle IA').click();
  const synthetic = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 180; canvas.height = 90;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 180, 90);
    ctx.fillStyle = 'black'; ctx.fillRect(20, 43, 100, 4);
    ctx.beginPath(); ctx.moveTo(140, 45); ctx.lineTo(116, 33); ctx.lineTo(116, 57); ctx.fill();
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await page.getByLabel('Essayer une image').setInputFiles({
    name: 'fleche.png', mimeType: 'image/png', buffer: Buffer.from(synthetic, 'base64'),
  });
  const caption = page.locator('figcaption').filter({ hasText: 'fleche.png' });
  await expect(caption).toContainText('vers la droite');
  const image = page.getByRole('img', { name: 'Pointes repérées sur fleche.png' });
  const clockwise = page.getByRole('button', { name: 'Tourner l’image à droite de 90 degrés' });
  await page.getByRole('button', { name: 'Tourner l’image à gauche de 90 degrés' }).click();
  await expect(caption).toContainText('vers le haut');
  await expect(image).toHaveJSProperty('naturalWidth', 90);
  await expect(image).toHaveJSProperty('naturalHeight', 180);
  for (const direction of ['la droite', 'le bas', 'la gauche']) {
    await clockwise.click();
    await expect(caption).toContainText('vers ' + direction);
  }
  await page.getByRole('button', { name: 'Tester les six schémas en local' }).click();
  await expect(clockwise).toHaveCount(0);
  await expect(page.locator('figcaption').filter({ hasText: /^S[0-5] —/ })).toHaveText([
    'S0 — 1 vers la droite, 2 vers la droite',
    'S1 — 1 vers la gauche, 2 vers la droite',
    'S2 — 1 vers la droite, 2 vers le bas',
    'S3 — 1 vers la droite, 2 vers la droite',
    'S4 — 1 vers la droite, 2 vers le bas',
    'S5 — 1 vers la droite',
  ]);
});
