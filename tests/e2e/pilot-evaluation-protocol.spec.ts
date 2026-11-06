import { expect, test } from '@playwright/test';

test('the guided biology protocol reuses the evaluator selection without creating fixed presets', async ({ page }) => {
  const configuration = {
    endpoint: 'http://localhost:11434',
    apiCompatible: false, apiKey: '', visionModel: 'qwen3.5:4b',
    transcriptionTokenLimit: 2048, transcriptionPromptMode: 'auto',
    transcriptionRepeatPenalty: 1.05, transcriptionPenaltyParameter: 'none',
    transcriptionFrequencyPenalty: 0, analysisModel: 'gemma3:4b',
    secondAnalysisModel: '', arbitratorModel: '', diagnosticStrategy: 'single',
    analysisThinking: true, criterionByCriterion: true, correctionMethod: 'generative',
  };
  const profiles = [
    { id: 'my-saved-local', name: 'Ma configuration locale', mode: 'single', updatedAt: '2026-11-06T10:00:00.000Z', configuration },
    { id: 'my-saved-remote', name: 'Ma configuration distante', mode: 'single', updatedAt: '2026-11-06T10:00:00.000Z',
      configuration: { ...configuration, endpoint: 'https://external.example/v1/chat/completions', apiCompatible: true } },
  ];
  await page.addInitScript((savedProfiles) => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify(savedProfiles));
  }, profiles);
  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();

  const panel = page.getByRole('region', { name: 'Protocole de test guidé' });
  const choices = page.getByRole('group', { name: 'Configurations à exécuter' });
  const assignmentsBefore = await page.evaluate(() => localStorage.getItem('companion-correcteur:assignments:v1'));

  await panel.getByRole('button', { name: 'Préparer le protocole en un clic' }).click();
  await expect(panel.getByText('A — correcte')).toBeVisible();
  await expect(panel.getByText('B — inversions')).toBeVisible();
  await expect(panel.getByText('C — partielle')).toBeVisible();
  await expect(panel.getByText('0 profil(s) sélectionné(s)', { exact: false })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Lancer les 3 analyses (sans image)' })).toBeDisabled();
  await expect(panel.getByText(/Sélectionnez au moins une configuration dans/)).toBeVisible();

  await choices.getByRole('checkbox').nth(0).check();
  await expect(panel.getByText('Ma configuration locale', { exact: false })).toBeVisible();
  await expect(panel.getByText('1 profil(s) sélectionné(s)', { exact: false })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Lancer les 3 analyses (sans image)' })).toBeEnabled();
  await expect(panel.getByRole('button', { name: 'Tester les 3 photos (Vision + analyse)' })).toBeDisabled();

  // Preparing again must not reset the evaluator selection or overwrite saved model settings.
  await panel.getByRole('button', { name: 'Réinitialiser le protocole' }).click();
  await expect(choices.getByRole('checkbox').nth(0)).toBeChecked();
  await expect(panel.getByRole('button', { name: 'Lancer les 3 analyses (sans image)' })).toBeEnabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('companion-correcteur:ollama-profiles:v1') ?? '[]'))).toEqual(profiles);

  // An incompatible remote profile must block the guided campaign rather than send copy data out.
  await choices.getByRole('checkbox').nth(1).check();
  await expect(panel.getByText(/Configuration\(s\) incompatible\(s\) : Ma configuration distante/)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Lancer les 3 analyses (sans image)' })).toBeDisabled();
  await choices.getByRole('checkbox').nth(1).uncheck();
  await expect(panel.getByRole('button', { name: 'Lancer les 3 analyses (sans image)' })).toBeEnabled();

  await expect(page.getByRole('group', { name: 'Type d’évaluation' })
    .getByRole('button', { name: /Analyse seule/ })).toHaveAttribute('aria-pressed', 'true');
  const assignmentsAfter = await page.evaluate(() => localStorage.getItem('companion-correcteur:assignments:v1'));
  expect(assignmentsAfter).toBe(assignmentsBefore);
});
