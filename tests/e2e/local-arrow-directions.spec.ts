import { expect, test } from '@playwright/test';

test('reads both ends of the inversion pair and abstains on the headless link without a model', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' }).getByRole('button', { name: 'Tests', exact: true }).click();
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: /Schémas scientifiques/ }).click();
  await page.getByRole('tab', { name: /Graphe des relations/ }).click();
  await page.getByText('Détecter le sens des flèches sans modèle IA').click();
  await page.getByRole('button', { name: 'Tester les six schémas en local' }).click();
  await expect(page.locator('figcaption').filter({ hasText: /^S[0-5] —/ })).toHaveText([
    'S0 — 1 vers la droite, 2 vers la droite',
    'S1 — 1 vers la gauche, 2 vers la droite',
    'S2 — 1 vers la droite, 2 vers le bas',
    'S3 — 1 vers la droite, 2 vers la droite',
    'S4 — 1 vers la droite, 2 vers le bas',
    'S5 — 1 vers la droite',
  ]);
});
