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
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: /Biologie/ }).click();

  const panel = page.getByRole('region', { name: 'Protocole de test guidé' });
  const contract = panel.getByRole('region', { name: 'Protocole variante B par question' });
  const action = contract.getByRole('button', { name: 'Comparer standard et variante B en un clic' });
  const repeatability = panel.getByRole('region', { name: 'Test de répétabilité variante B' });
  const repeatAction = repeatability.getByRole('button', { name: 'Lancer le test de répétabilité en un clic' });
  const count = repeatability.getByLabel('Nombre de passages');
  const suite = repeatability.getByLabel('Jeu de copies');
  const choices = page.getByRole('group', { name: 'Configurations à exécuter' });
  const assignmentsBefore = await page.evaluate(() => localStorage.getItem('companion-correcteur:assignments:v1'));

  await expect(action).toBeVisible();
  await expect(action).toBeDisabled();
  await panel.getByRole('button', { name: 'Vérifier la répétabilité', exact: true }).click();
  await expect(repeatAction).toBeVisible();
  await expect(repeatAction).toBeDisabled();
  await expect(suite).toHaveValue('baseline');
  await suite.selectOption('stress');
  await expect(suite).toHaveValue('stress');
  await suite.selectOption('baseline');
  await expect(count).toHaveValue('3');
  await count.selectOption('5');
  await expect(count).toHaveValue('5');
  await panel.getByRole('button', { name: 'Comparer les méthodes', exact: true }).click();
  await expect(contract.getByText('A = 10/10', { exact: false })).toBeVisible();
  await contract.getByText('Voir les trois réponses et le barème de référence').click();
  await expect(contract.getByText('B — réponses inversées', { exact: false })).toBeVisible();
  await expect(contract.getByText('C — partielle', { exact: false })).toBeVisible();

  await choices.locator('label.evaluation-profile-option').nth(0).click();
  await choices.locator('label.evaluation-profile-option').nth(1).click();
  await expect(action).toBeEnabled();
  await panel.getByRole('button', { name: 'Vérifier la répétabilité', exact: true }).click();
  await expect(repeatAction).toBeEnabled();
  await panel.getByRole('button', { name: 'Comparer les méthodes', exact: true }).click();
  // Do not need the Vision model for this analysis-only protocol.
  await expect(panel.getByRole('button', { name: 'Lancer les 3 analyses (sans image)' })).toHaveCount(0);

  await choices.locator('label.evaluation-profile-option').nth(2).click();
  await expect(action).toBeEnabled();
  await panel.getByRole('button', { name: 'Vérifier la répétabilité', exact: true }).click();
  await expect(repeatAction).toBeEnabled();
  await panel.getByRole('button', { name: 'Comparer les méthodes', exact: true }).click();
  await expect(contract.getByText(/Profil distant/)).toHaveCount(0);
  // No extra consent control: choosing the saved provider is enough.
  await expect(panel.getByText(/Autoriser l’API externe/)).toHaveCount(0);
  await choices.locator('label.evaluation-profile-option').nth(0).click();
  await choices.locator('label.evaluation-profile-option').nth(1).click();
  await expect(action).toBeEnabled();
  await panel.getByRole('button', { name: 'Vérifier la répétabilité', exact: true }).click();
  await expect(repeatAction).toBeEnabled();
  await panel.getByRole('button', { name: 'Comparer les méthodes', exact: true }).click();

  // A private OpenAI-compatible profile must also be usable by the Vision and
  // integrated pilot; none of these test images are transmitted until a run is clicked.
  await expect(choices.locator('label.evaluation-profile-option').nth(2)).toBeVisible();
  await panel.getByRole('button', { name: 'Vision et parallélisme', exact: true }).click();
  await panel.getByRole('button', { name: 'Préparer le protocole en un clic' }).click();
  await expect(panel.getByRole('button', { name: 'Comparer 1, 2 et 4 appels parallèles' })).toBeDisabled();
  const sample = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZckAAAAASUVORK5CYII=', 'base64');
  for (const caseId of ['A', 'B', 'C']) {
    await panel.locator('#pilot-image-' + caseId).setInputFiles({
      name: 'synthetic-' + caseId + '.png', mimeType: 'image/png', buffer: sample,
    });
    await expect(panel.getByText('1 page(s) prête(s)')).toHaveCount(['A', 'B', 'C'].indexOf(caseId) + 1);
  }
  await expect(panel.getByRole('button', { name: 'Lancer les 3 lectures (Vision seule)' })).toBeEnabled();
  await expect(panel.getByRole('button', { name: 'Tester les 3 photos (Vision + analyse)' })).toBeEnabled();

  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('companion-correcteur:ollama-profiles:v1') ?? '[]'))).toEqual(profiles);
  expect(await page.evaluate(() => localStorage.getItem('companion-correcteur:assignments:v1'))).toBe(assignmentsBefore);
});
