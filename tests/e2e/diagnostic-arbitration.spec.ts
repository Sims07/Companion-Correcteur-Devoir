import { openCustomTests } from './helpers/evaluation-models.ts';
import { expect, test } from '@playwright/test';

test('evaluation navigates directly between tests and local results without artificial numbered steps', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await openCustomTests(page);

  const navigation = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole('button', { name: 'Tests', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(navigation.getByRole('button', { name: 'Exécution', exact: true })).toBeHidden();
  await expect(navigation.getByRole('button', { name: 'Résultats', exact: true })).toBeHidden();
  await expect(navigation.getByRole('button', { name: 'Campagnes', exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Modèles sélectionnés pour les tests' })).toBeVisible();
  await expect(page.getByText('Aucun modèle sélectionné')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Préparer le barème de correction' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Évaluer cette configuration' })).toBeDisabled();

  await navigation.getByRole('button', { name: 'Campagnes', exact: true }).click();
  await page.getByRole('button', { name: 'Comparer les essais sur copie' }).click();
  await expect(navigation.getByRole('button', { name: 'Campagnes', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Analyser et comparer les expériences' })).toBeVisible();
  await navigation.getByRole('button', { name: 'Tests', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Préparer le barème de correction' })).toBeVisible();
});

test('Debug remains a dedicated network inspector, separate from evaluation', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await openCustomTests(page);
  await expect(page.getByRole('group', { name: 'Modèles sélectionnés pour les tests' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Suivi & diagnostic' }).click();
  await page.getByRole('navigation', { name: 'Détails du suivi' }).getByRole('button', { name: 'Inspecteur réseau' }).click();
  await expect(page.getByRole('heading', { name: 'Inspecteur réseau' })).toBeVisible();
  await expect(page.locator('.evaluation-model-brief')).toHaveCount(0);
});
