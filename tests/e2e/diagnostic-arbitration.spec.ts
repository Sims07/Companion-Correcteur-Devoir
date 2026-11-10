import { expect, test } from '@playwright/test';

test('evaluation navigates directly between tests and local results without artificial numbered steps', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();

  const navigation = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Tests', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(navigation.getByRole('button', { name: 'Exécution', exact: true })).toBeHidden();
  await expect(navigation.getByRole('button', { name: 'Résultats', exact: true })).toBeHidden();
  await expect(navigation.getByRole('button', { name: 'Carnet de résultats', exact: true })).toBeVisible();
  await expect(page.locator('.evaluation-model-selector summary')).toBeVisible();
  await expect(page.getByText('Aucune configuration enregistrée.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Préparer le barème de correction' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Évaluer cette configuration' })).toBeDisabled();

  await navigation.getByRole('button', { name: 'Carnet de résultats', exact: true }).click();
  await expect(navigation.getByRole('button', { name: 'Carnet de résultats', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Analyser et comparer les expériences' })).toBeVisible();
  await navigation.getByRole('button', { name: 'Tests', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Préparer le barème de correction' })).toBeVisible();
});

test('Debug remains a dedicated network inspector, separate from evaluation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  await expect(page.locator('.evaluation-model-selector summary')).toBeVisible();

  await page.getByRole('navigation', { name: 'Navigation des outils IA' }).getByRole('button', { name: /Suivre et diagnostiquer/ }).click();
  await page.getByRole('navigation', { name: 'Détails du suivi' }).getByRole('button', { name: 'Inspecteur réseau' }).click();
  await expect(page.getByRole('heading', { name: 'Inspecteur réseau' })).toBeVisible();
  await expect(page.locator('.evaluation-model-selector')).toHaveCount(0);
});
