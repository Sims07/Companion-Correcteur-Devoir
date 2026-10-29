import { expect, test } from '@playwright/test';

test('multi-model experiment is available in Diagnostic IA only', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Diagnostic IA' }).click();

  const strategy = page.getByLabel('Stratégie de comparaison');
  await expect(strategy).toBeVisible();
  await expect(strategy).toHaveValue('single');

  await strategy.selectOption('arbitrate');
  await expect(page.getByLabel('Second modèle d’analyse')).toBeVisible();
  await expect(page.getByLabel('Modèle arbitre')).toBeVisible();

  await page.getByRole('button', { name: 'Correction', exact: true }).click();
  await expect(page.getByLabel('Stratégie de comparaison')).toHaveCount(0);
});

test('diagnostic presents a guided journey and a useful empty results state', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Diagnostic IA' }).click();

  await expect(page.getByRole('navigation', { name: 'Parcours d’évaluation des modèles' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Préparer l’expérience/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Analyser les résultats/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Comparer dans le temps/ })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Aucun résultat pour le moment' })).toBeVisible();
  await expect(page.getByText(/comparez les modèles dès maintenant et ajoutez une référence plus tard/i)).toBeVisible();

  await page.getByRole('button', { name: /Analyser les résultats/ }).click();
  await expect(page.getByRole('heading', { name: 'Résultats de l’expérience multi-modèles' })).toBeInViewport();

  await page.getByRole('button', { name: /Préparer l’expérience/ }).click();
  await expect(page.getByRole('heading', { name: 'Préparer le barème' })).toBeInViewport();
});
