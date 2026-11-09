import { expect, test } from '@playwright/test';

test('each test journey shows its own preparation and preserves custom input across switches', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  const journeys = page.getByRole('group', { name: 'Parcours de test' });
  await page.getByRole('group', { name: 'Type d’évaluation' }).getByRole('button', { name: /Analyse seule/ }).click();
  const transcription = page.getByRole('textbox', { name: 'Transcription de référence pour l’évaluation de l’analyse' });
  await transcription.fill('Réponse personnelle conservée.');
  await journeys.getByRole('button', { name: /Schémas scientifiques/ }).click();
  await expect(page.getByRole('region', { name: 'Protocole schémas scientifiques', exact: true })).toBeVisible();
  await expect(page.locator('#evaluation-rubric')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Type d’évaluation' })).toBeHidden();
  await expect(page.getByRole('region', { name: 'Lancer l’expérience' })).toHaveCount(0);
  await journeys.getByRole('button', { name: /Protocoles de biologie/ }).click();
  await expect(page.getByRole('region', { name: 'Protocole de test guidé' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Protocole schémas scientifiques', exact: true })).toBeHidden();
  await journeys.getByRole('button', { name: /Ma propre copie/ }).click();
  await expect(transcription).toHaveValue('Réponse personnelle conservée.');
  await expect(page.locator('#evaluation-rubric')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Lancer l’expérience' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
