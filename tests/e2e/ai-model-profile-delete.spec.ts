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

test('teacher deletion is reflected immediately in the evaluator profiles', async ({ page }) => {
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
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  await expect(page.locator('#evaluation-profile-select')).not.toContainText('Configuration à supprimer');
  await expect(page.locator('#evaluation-profile-select')).toContainText('Configuration à conserver');
  await page.locator('#evaluation-profile-select').selectOption('saved-two');
  await expect(page.getByRole('button', { name: 'Supprimer cette configuration' })).toBeEnabled();
});

test('manage 16 saved configurations at once: select all, retain 3, confirm, and persist without disturbing current settings', async ({ page }) => {
  await page.goto('/');
  const many = Array.from({ length: 16 }, (_, index) => ({
    ...profiles[0]!,
    id: 'bulk-' + index,
    name: index < 3 ? 'Garder ' + (index + 1) : 'Ancien ' + (index + 1),
    configuration: { ...configuration, analysisModel: 'model-' + index },
  }));
  await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), {
    key: profileStorageKey, data: many,
  });
  await page.reload();
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  const options = page.getByRole('group', { name: 'Configurations à exécuter' });
  await expect(options.getByRole('checkbox')).toHaveCount(16);
  await options.locator('label.evaluation-profile-option').filter({ hasText: 'Ancien 16' }).click();
  await page.locator('#evaluation-profile-select').selectOption('bulk-15');
  await expect(page.locator('#evaluation-analysis-model')).toHaveValue('model-15');

  await page.getByRole('button', { name: 'Gérer les configurations (16)' }).click();
  let manager = page.getByRole('dialog', { name: 'Gérer mes configurations IA' });
  await expect(manager.getByRole('checkbox')).toHaveCount(16);
  await expect(manager.getByRole('button', { name: /Supprimer 0 configuration/ })).toBeDisabled();
  await manager.getByRole('button', { name: 'Tout sélectionner' }).click();
  for (const name of ['Garder 1', 'Garder 2', 'Garder 3']) {
    await manager.getByRole('checkbox', { name: new RegExp(name) }).uncheck();
  }
  await expect(manager.getByText('13 à supprimer · 3 à conserver')).toBeVisible();
  await manager.getByRole('button', { name: /Supprimer 13 configuration/ }).click();
  let confirmation = page.getByRole('dialog', { name: 'Confirmer la suppression des configurations' });
  await expect(confirmation.locator('.ai-profile-manager-confirm-list li')).toHaveCount(13);
  await expect(confirmation).toContainText('3 configuration(s) conservée(s)');
  await confirmation.getByRole('button', { name: 'Retour à la liste' }).click();
  manager = page.getByRole('dialog', { name: 'Gérer mes configurations IA' });
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]').length, profileStorageKey)).toBe(16);
  await manager.getByRole('button', { name: /Supprimer 13 configuration/ }).click();
  confirmation = page.getByRole('dialog', { name: 'Confirmer la suppression des configurations' });
  await confirmation.getByRole('button', { name: 'Confirmer la suppression de 13 configuration(s)' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Gérer les configurations (3)' })).toBeVisible();
  await expect(options.getByRole('checkbox')).toHaveCount(3);
  await expect(options.getByRole('checkbox').filter({ hasText: /Ancien 16/ })).toHaveCount(0);
  await expect(page.locator('#evaluation-profile-select')).toHaveValue('');
  await expect(page.locator('#evaluation-profile-name')).toHaveValue('');
  // The editor retains the loaded configuration even when its saved entry is removed.
  await expect(page.locator('#evaluation-analysis-model')).toHaveValue('model-15');
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]').map((item: { id: string }) => item.id), profileStorageKey))
    .toEqual(['bulk-0', 'bulk-1', 'bulk-2']);
  expect(await page.evaluate((key) => localStorage.getItem(key), configurationStorageKey)).toBeTruthy();

  await page.reload();
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  await expect(page.getByRole('button', { name: 'Gérer les configurations (3)' })).toBeVisible();
  await expect(page.locator('#evaluation-profile-select option')).toHaveCount(4);
  await expect(page.locator('#evaluation-profile-select')).toContainText('Garder 1');
  await expect(page.locator('#evaluation-profile-select')).not.toContainText('Ancien');
});

test('batch removal aborts safely if local storage fails, keeping all saved profiles', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  await page.getByRole('button', { name: 'Gérer les configurations (2)' }).click();
  const manager = page.getByRole('dialog', { name: 'Gérer mes configurations IA' });
  await manager.getByRole('checkbox', { name: /Configuration à supprimer/ }).check();
  await manager.getByRole('button', { name: /Supprimer 1 configuration/ }).click();
  await page.evaluate((key) => {
    const normalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (itemKey: string, value: string) {
      if (itemKey === key) throw new DOMException('Storage unavailable', 'QuotaExceededError');
      return normalSetItem.call(this, itemKey, value);
    };
  }, profileStorageKey);
  const confirm = page.getByRole('dialog', { name: 'Confirmer la suppression des configurations' });
  await confirm.getByRole('button', { name: 'Confirmer la suppression de 1 configuration(s)' }).click();
  await expect(confirm.getByRole('alert')).toContainText('La suppression n’a pas été enregistrée');
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]').length, profileStorageKey)).toBe(2);
  await confirm.getByRole('button', { name: 'Retour à la liste' }).click();
  await page.getByRole('dialog', { name: 'Gérer mes configurations IA' }).getByRole('button', { name: 'Fermer' }).click();
  await expect(page.locator('#evaluation-profile-select option')).toHaveCount(3);
});
