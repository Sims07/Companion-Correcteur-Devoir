import { expect, test } from '@playwright/test';

test('teacher journey shows one task at a time and keeps Ollama settings tucked away', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('navigation', { name: 'Étapes du devoir' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Préparer le barème' })).toBeVisible();
  const assignmentTitle = page.getByLabel('DEVOIR EN COURS');
  await assignmentTitle.fill('Biologie cellulaire — partiel S1');
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toHaveCount(0);
  await expect(page.getByLabel('Adresse du serveur Ollama')).toHaveCount(0);

  await page.getByRole('button', { name: /Continuer vers la copie/ }).click();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toBeVisible();
  await expect(page.getByLabel('Adresse du serveur Ollama')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Paramètres de l’IA locale/ })).toHaveAttribute('aria-expanded', 'false');

  await page.getByRole('button', { name: 'Paramètres de l’IA locale' }).click();
  await expect(page.getByLabel('Adresse du serveur Ollama')).toBeVisible();
  await expect(page.getByLabel('Modèle de lecture des copies')).toBeVisible();
  await expect(page.getByLabel('Modèle d’analyse et de notation')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lancer la lecture et la correction' })).toBeDisabled();

  await page.getByRole('button', { name: 'Fermer' }).click();
  await expect(page.getByLabel('Adresse du serveur Ollama')).toHaveCount(0);

  await page.reload();
  await expect(page.getByLabel('Nom du devoir')).toHaveValue('Biologie cellulaire — partiel S1');

  await page.getByRole('button', { name: 'Diagnostic IA' }).click();
  await expect(page.getByRole('navigation', { name: 'Étapes du devoir' })).toHaveCount(0);
  await expect(page.getByLabel('Stratégie de comparaison')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lire puis analyser les copies' })).toBeDisabled();
});
