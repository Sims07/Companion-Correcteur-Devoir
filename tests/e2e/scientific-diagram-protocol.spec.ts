import { expect, test } from '@playwright/test';

test('a scientific diagram protocol accepts a photo, rubric, teacher decisions and saved models', async ({ page }) => {
  const configuration = {
    endpoint: 'http://localhost:11434',
    apiCompatible: false, apiKey: '', visionModel: '',
    transcriptionTokenLimit: 2048, transcriptionPromptMode: 'auto',
    transcriptionRepeatPenalty: 1.05, transcriptionPenaltyParameter: 'none',
    transcriptionFrequencyPenalty: 0, analysisModel: 'd1:3b',
    secondAnalysisModel: '', arbitratorModel: '', diagnosticStrategy: 'single',
    analysisThinking: false, criterionByCriterion: true, correctionMethod: 'decision',
  };
  await page.addInitScript((profiles) => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify(profiles));
  }, [{ id: 'd1-vision', name: 'D1 image directe', mode: 'single', updatedAt: '2026-11-07T00:00:00Z', configuration }]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();

  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  await expect(panel.getByText('15 attendus', { exact: false }).first()).toBeVisible();
  await expect(panel.getByText('8 points', { exact: false }).first()).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Tester le schéma en un clic' })).toBeDisabled();
  await expect(panel.getByRole('combobox', { name: 'Répétitions' })).toHaveValue('3');
  await panel.getByRole('combobox', { name: 'Répétitions' }).selectOption('5');
  await expect(panel.getByRole('combobox', { name: 'Répétitions' })).toHaveValue('5');

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZckAAAAASUVORK5CYII=', 'base64');
  await panel.locator('#diagram-protocol-photos').setInputFiles({
    name: 'cellules.png', mimeType: 'image/png', buffer: png,
  });
  await expect(panel.getByText('1 page(s) prêtes')).toBeVisible();

  await panel.getByRole('combobox', { name: 'Référence : Occupe toute la page' }).selectOption('present');
  await expect(panel.getByRole('combobox', { name: 'Référence : Occupe toute la page' })).toHaveValue('present');

  const imported = {
    format: 'companion-correcteur-rubric', rubricTitle: 'Barème faculté',
    criteria: [
      { id: 'a', title: 'Dessiner', maxPoints: 2, subcriteria: [
        { id: 'a-1', title: 'Deux structures', maxPoints: 2 },
      ] },
      { id: 'b', title: 'Compréhension', description: 'phase de mitose', maxPoints: 2 },
    ],
  };
  await panel.locator('#diagram-protocol-rubric').setInputFiles({
    name: 'bareme.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(imported)),
  });
  await expect(panel.getByText('Barème faculté', { exact: false })).toBeVisible();
  await expect(panel.getByText('1 attendu', { exact: false })).toBeVisible();
  await expect(panel.getByRole('combobox', { name: 'Référence : Deux structures' })).toHaveValue('');

  const choices = page.getByRole('group', { name: 'Configurations à exécuter' });
  await choices.locator('label.evaluation-profile-option').first().click();
  await expect(panel.getByText('System One image directe', { exact: false })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Tester le schéma en un clic' })).toBeEnabled();
});
