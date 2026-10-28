import { expect, test } from '@playwright/test';

test('teacher workflow is assignment-centred and configures Ollama without opening diagnostics', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Un devoir, un espace de travail' })).toBeVisible();
  const assignmentTitle = page.getByLabel('Nom du devoir / session');
  await assignmentTitle.fill('Biologie cellulaire — partiel S1');
  await expect(page.getByText('Préparation du devoir')).toBeVisible();
  await expect(page.getByText('Barème vérifié')).toBeVisible();
  await expect(page.getByText('Copie importée')).toBeVisible();

  await expect(page.getByLabel('Adresse du serveur Ollama')).toBeVisible();
  await expect(page.getByLabel('Modèle de lecture des copies')).toBeVisible();
  await expect(page.getByLabel('Modèle d’analyse et de notation')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lancer la lecture et la correction' })).toBeDisabled();

  await page.reload();
  await expect(page.getByLabel('Nom du devoir / session')).toHaveValue('Biologie cellulaire — partiel S1');

  await page.getByRole('button', { name: 'Diagnostic IA' }).click();
  await expect(page.getByRole('heading', { name: 'Un devoir, un espace de travail' })).toHaveCount(0);
  await expect(page.getByLabel('Stratégie de comparaison')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lire puis analyser les copies' })).toBeDisabled();
});
