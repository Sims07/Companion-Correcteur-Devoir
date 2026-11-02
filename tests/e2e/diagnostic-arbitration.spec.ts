import { expect, test } from '@playwright/test';

test('evaluation presents four focused spaces and keeps launch disabled until the test copy is ready', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluation des modèles' }).click();

  const navigation = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole('button', { name: /Configuration/ })).toHaveAttribute('aria-current', 'step');
  await expect(navigation.getByRole('button', { name: /Exécution/ })).toBeVisible();
  await expect(navigation.getByRole('button', { name: /Résultats/ })).toBeVisible();
  await expect(navigation.getByRole('button', { name: /Analyse & historique/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sélection pour cette expérience' })).toBeVisible();
  await expect(page.getByText('Aucune configuration enregistrée.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Préparer le barème de correction' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lancer et comparer les résultats' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Évaluer cette configuration' })).toBeDisabled();

  await navigation.getByRole('button', { name: /Exécution/ }).click();
  await expect(page.getByRole('heading', { name: 'Exécution de l’expérience' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Préparer le barème de correction' })).toHaveCount(0);
  await navigation.getByRole('button', { name: /Résultats/ }).click();
  await expect(navigation.getByRole('button', { name: /Résultats/ })).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('heading', { name: 'Résultats du parcours complet' })).toBeVisible();
  await navigation.getByRole('button', { name: /Analyse & historique/ }).click();
  await expect(navigation.getByRole('button', { name: /Analyse & historique/ })).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('heading', { name: 'Analyser et comparer les expériences' })).toBeVisible();
});

test('Debug is now a dedicated network inspector, separate from model evaluation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluation des modèles' }).click();
  await expect(page.getByRole('heading', { name: 'Sélection pour cette expérience' })).toBeVisible();

  await page.getByRole('button', { name: 'Inspecteur réseau', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Inspecteur réseau' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sélection pour cette expérience' })).toHaveCount(0);
});
