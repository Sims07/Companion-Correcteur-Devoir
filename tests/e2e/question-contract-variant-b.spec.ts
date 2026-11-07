import { expect, test } from '@playwright/test';

test('the question-contract comparison supports locally saved OpenAI-compatible profiles, without extra consent or teacher-data changes', async ({ page }) => {
  const configuration = {
    endpoint: 'http://localhost:11434', apiCompatible: false, apiKey: '',
    visionModel: '', transcriptionTokenLimit: 2048, transcriptionPromptMode: 'auto',
    transcriptionRepeatPenalty: 1.05, transcriptionPenaltyParameter: 'none',
    transcriptionFrequencyPenalty: 0, analysisModel: 'qwen3.5:4b',
    secondAnalysisModel: '', arbitratorModel: '', diagnosticStrategy: 'single',
    analysisThinking: false, criterionByCriterion: true, correctionMethod: 'generative',
  };
  const profiles = [
    { id: 'local-one', name: 'Génératif local', mode: 'single', updatedAt: '2026-11-07T10:00:00Z', configuration },
    { id: 'local-two', name: 'Décisionnel local', mode: 'single', updatedAt: '2026-11-07T10:00:00Z',
      configuration: { ...configuration, analysisModel: 'd1:3b', correctionMethod: 'decision' } },
    { id: 'remote', name: 'Profil distant', mode: 'single', updatedAt: '2026-11-07T10:00:00Z',
      configuration: { ...configuration, endpoint: 'https://remote.example/v1/chat/completions', apiCompatible: true, apiKey: 'fake-remote-token', visionModel: 'vision-remote' } },
  ];
  await page.addInitScript((savedProfiles) => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify(savedProfiles));
  }, profiles);
  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();

  const panel = page.getByRole('region', { name: 'Protocole de test guidé' });
  const contract = panel.getByRole('region', { name: 'Protocole variante B par question' });
  const action = contract.getByRole('button', { name: 'Comparer standard et variante B en un clic' });
  const repeatability = panel.getByRole('region', { name: 'Test de répétabilité variante B' });
  const repeatAction = repeatability.getByRole('button', { name: 'Lancer le test de répétabilité en un clic' });
  const count = repeatability.getByLabel('Nombre de passages');
  const choices = page.getByRole('group', { name: 'Configurations à exécuter' });
  const assignmentsBefore = await page.evaluate(() => localStorage.getItem('companion-correcteur:assignments:v1'));

  await expect(action).toBeVisible();
  await expect(action).toBeDisabled();
  await expect(repeatAction).toBeVisible();
  await expect(repeatAction).toBeDisabled();
  await expect(count).toHaveValue('3');
  await count.selectOption('5');
  await expect(count).toHaveValue('5');
  await expect(contract.getByText('A = 10/10', { exact: false })).toBeVisible();
  await contract.getByText('Voir les trois réponses et le barème de référence').click();
  await expect(contract.getByText('B — réponses inversées', { exact: false })).toBeVisible();
  await expect(contract.getByText('C — partielle', { exact: false })).toBeVisible();

  await choices.locator('label.evaluation-profile-option').nth(0).click();
  await choices.locator('label.evaluation-profile-option').nth(1).click();
  await expect(action).toBeEnabled();
  await expect(repeatAction).toBeEnabled();
  // Do not need the Vision model for this analysis-only protocol.
  await expect(panel.getByRole('button', { name: 'Lancer les 3 analyses (sans image)' })).toHaveCount(0);

  await choices.locator('label.evaluation-profile-option').nth(2).click();
  await expect(action).toBeEnabled();
  await expect(repeatAction).toBeEnabled();
  await expect(panel.getByRole('button', { name: 'Comparer 1, 2 et 4 appels parallèles' })).toBeDisabled();
  await expect(contract.getByText(/Profil distant/)).toHaveCount(0);
  // No extra consent control: choosing the saved provider is enough.
  await expect(panel.getByText(/Autoriser l’API externe/)).toHaveCount(0);
  await choices.locator('label.evaluation-profile-option').nth(0).click();
  await choices.locator('label.evaluation-profile-option').nth(1).click();
  await expect(action).toBeEnabled();
  await expect(repeatAction).toBeEnabled();

  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('companion-correcteur:ollama-profiles:v1') ?? '[]'))).toEqual(profiles);
  expect(await page.evaluate(() => localStorage.getItem('companion-correcteur:assignments:v1'))).toBe(assignmentsBefore);
});
