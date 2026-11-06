import { expect, test } from '@playwright/test';

const profileStorageKey = 'companion-correcteur:ollama-profiles:v1';
const configurationStorageKey = 'companion-correcteur:ollama-configuration:v1';

const configuration = {
  endpoint: 'http://localhost:11434', apiCompatible: false, apiKey: '',
  visionModel: 'gemma3:4b', transcriptionTokenLimit: 2048,
  transcriptionPromptMode: 'auto', transcriptionRepeatPenalty: 1.05,
  transcriptionPenaltyParameter: 'none', transcriptionFrequencyPenalty: 0,
  analysisModel: 'qwen3.5:4b', secondAnalysisModel: '', arbitratorModel: '',
  diagnosticStrategy: 'single', analysisThinking: false,
  criterionByCriterion: true, correctionMethod: 'generative',
};

const profiles = [
  { id: 'saved-one', name: 'Configuration à supprimer', mode: 'single', configuration, updatedAt: '2026-11-06T10:00:00Z' },
  { id: 'saved-two', name: 'Configuration à conserver', mode: 'single',
    configuration: { ...configuration, analysisModel: 'tev1:4b' }, updatedAt: '2026-11-06T10:01:00Z' },
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ key, saved }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(saved));
  }, { key: profileStorageKey, saved: profiles });
});

test('deleting a saved profile requires confirmation, updates evaluation selection and persists after reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  const options = page.getByRole('group', { name: 'Configurations à exécuter' });
  await options.locator('label.evaluation-profile-option').filter({ hasText: 'Configuration à supprimer' }).click();
  await expect(options.getByRole('checkbox').first()).toBeChecked();

  const remove = page.getByRole('button', { name: 'Supprimer cette configuration' });
  await expect(remove).toBeDisabled();
  await page.locator('#evaluation-profile-select').selectOption('saved-one');
  await expect(page.locator('#evaluation-profile-name')).toHaveValue('Configuration à supprimer');
  await expect(remove).toBeEnabled();

  const initialSettings = await page.evaluate((key) => localStorage.getItem(key), configurationStorageKey);
  await remove.click();
  const dialog = page.getByRole('dialog', { name: 'Supprimer cette configuration IA ?' });
  await expect(dialog).toContainText('Configuration à supprimer');
  await expect(dialog).toContainText('l’historique des évaluations');
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.locator('#evaluation-profile-select')).toHaveValue('saved-one');
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]'), profileStorageKey)).toEqual(profiles);

  await remove.click();
  await dialog.getByRole('button', { name: 'Supprimer la configuration' }).click();
  await expect(page.locator('#evaluation-profile-select')).toHaveValue('');
  await expect(page.locator('#evaluation-profile-name')).toHaveValue('');
  await expect(page.locator('#evaluation-analysis-model')).toHaveValue('qwen3.5:4b');
  await expect(remove).toBeDisabled();
  await expect(options.getByRole('checkbox')).toHaveCount(1);
  await expect(options.getByText('Configuration à conserver')).toBeVisible();
  await expect(options.getByText('Configuration à supprimer')).toHaveCount(0);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]'), profileStorageKey)).toEqual([profiles[1]]);
  // Profile deletion must not delete the active settings or evaluation archive.
  expect(await page.evaluate((key) => localStorage.getItem(key), configurationStorageKey)).toBeTruthy();
  expect(initialSettings).toBeTruthy();

  await page.reload();
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  await expect(page.locator('#evaluation-profile-select option')).toHaveCount(2); // Current + retained profile
  await expect(page.locator('#evaluation-profile-select')).toContainText('Configuration à conserver');
  await expect(page.locator('#evaluation-profile-select')).not.toContainText('Configuration à supprimer');
});

test('teacher and technical settings also offer deletion for the selected saved configuration', async ({ page }) => {
  await page.goto('/');
  await page.locator('.assignment-overview-card').first().getByRole('button', { name: /Reprendre le devoir/ }).click();
  await page.getByRole('button', { name: /Réglages de l’IA locale|IA locale à configurer/ }).click();
  const teacherPanel = page.locator('#teacher-ai-settings-panel');
  await expect(teacherPanel.getByRole('button', { name: 'Supprimer cette configuration' })).toBeDisabled();
  await teacherPanel.locator('#ai-model-profile').selectOption('saved-one');
  await teacherPanel.getByRole('button', { name: 'Supprimer cette configuration' }).click();
  await page.getByRole('dialog', { name: 'Supprimer cette configuration IA ?' })
    .getByRole('button', { name: 'Supprimer la configuration' }).click();
  await expect(teacherPanel.locator('#ai-model-profile option')).toHaveCount(2);

  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Inspecteur réseau/ }).click();
  const debugPanel = page.locator('.diagnostic-ai-profile-controls');
  await expect(debugPanel.getByRole('button', { name: 'Supprimer cette configuration' })).toBeDisabled();
  await debugPanel.locator('#debug-ai-model-profile').selectOption('saved-two');
  await expect(debugPanel.getByRole('button', { name: 'Supprimer cette configuration' })).toBeEnabled();
});
