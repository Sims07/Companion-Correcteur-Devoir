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
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: /Biologie/ }).click();

  const panel = page.getByRole('region', { name: 'Protocole de test guidé' });
  await panel.getByRole('button', { name: 'Vision et parallélisme', exact: true }).click();
  const choices = page.getByRole('group', { name: 'Configurations à exécuter' });
  const assignmentsBefore = await page.evaluate(() => localStorage.getItem('companion-correcteur:assignments:v1'));

  await panel.getByRole('button', { name: 'Préparer le protocole en un clic' }).click();
  await expect(panel.getByText('A — correcte', { exact: true })).toBeVisible();
  await expect(panel.getByText('B — inversions', { exact: true })).toBeVisible();
  await expect(panel.getByText('C — partielle', { exact: true })).toBeVisible();
  await expect(panel.getByText('0 profil(s) sélectionné(s)', { exact: false })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Lancer les 3 analyses (sans image)' })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Comparer 1, 2 et 4 appels parallèles' })).toBeDisabled();
  await expect(panel.getByRole('combobox', { name: 'Réponse de référence' })).toHaveValue('C');
  await expect(panel.getByRole('button', { name: 'Lancer les 3 lectures (Vision seule)' })).toBeDisabled();
  await expect(panel.getByText(/Sélectionnez au moins une configuration dans/)).toBeVisible();

  await choices.locator('label.evaluation-profile-option').nth(0).click();
  await expect(panel.getByText('Ma configuration locale', { exact: false })).toBeVisible();
  await expect(panel.getByText('1 profil(s) sélectionné(s)', { exact: false })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Lancer les 3 analyses (sans image)' })).toBeEnabled();
  await expect(panel.getByRole('button', { name: 'Comparer 1, 2 et 4 appels parallèles' })).toBeEnabled();
  await panel.getByRole('combobox', { name: 'Réponse de référence' }).selectOption('B');
  await expect(panel.getByRole('combobox', { name: 'Réponse de référence' })).toHaveValue('B');
  await expect(panel.getByRole('button', { name: 'Tester les 3 photos (Vision + analyse)' })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Lancer les 3 lectures (Vision seule)' })).toBeDisabled();

  // The guided Vision-only scenario requires one local image per reference case.
  // Its availability does not require changing the evaluator's selected stage.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZckAAAAASUVORK5CYII=', 'base64');
  const uploads = panel.locator('input[type="file"]');
  for (let index = 0; index < 3; index++) {
    await uploads.nth(index).setInputFiles({ name: `reference-${index}.png`, mimeType: 'image/png', buffer: png });
    await expect(panel.getByText('1 page(s) prête(s)')).toHaveCount(index + 1);
  }
  await expect(panel.getByRole('button', { name: 'Lancer les 3 lectures (Vision seule)' })).toBeEnabled();

  // Preparing again must not reset the evaluator selection or overwrite saved model settings.
  await panel.getByRole('button', { name: 'Réinitialiser le protocole' }).click();
  await expect(choices.getByRole('checkbox').nth(0)).toBeChecked();
  await expect(panel.getByRole('button', { name: 'Lancer les 3 analyses (sans image)' })).toBeEnabled();
  await expect(panel.getByRole('button', { name: 'Lancer les 3 lectures (Vision seule)' })).toBeDisabled();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('companion-correcteur:ollama-profiles:v1') ?? '[]'))).toEqual(profiles);

  // A configured OpenAI-compatible provider is allowed in the guided analysis protocol;
  // only the CPU concurrency experiment remains specific to native local Ollama.
  await choices.locator('label.evaluation-profile-option').nth(1).click();
  await expect(panel.getByRole('button', { name: 'Lancer les 3 analyses (sans image)' })).toBeEnabled();
  await expect(panel.getByRole('button', { name: 'Comparer 1, 2 et 4 appels parallèles' })).toBeDisabled();
  await expect(panel.getByText(/Configuration\(s\) incompatible\(s\)/)).toHaveCount(0);
  await choices.locator('label.evaluation-profile-option').nth(1).click();
  await expect(panel.getByRole('button', { name: 'Lancer les 3 analyses (sans image)' })).toBeEnabled();

  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: /Ma copie/ }).click();
  await expect(page.getByRole('group', { name: 'Type d’évaluation' })
    .getByRole('button', { name: /Analyse seule/ })).toHaveAttribute('aria-pressed', 'true');
  const assignmentsAfter = await page.evaluate(() => localStorage.getItem('companion-correcteur:assignments:v1'));
  expect(assignmentsAfter).toBe(assignmentsBefore);
});
