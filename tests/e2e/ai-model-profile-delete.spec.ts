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

test('model removal requires confirmation and keeps local evaluation selection consistent', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();

  await page.getByRole('button', { name: 'Gérer les configurations' }).click();
  const selection = page.getByRole('dialog', { name: 'Gérer les configurations IA' });
  await selection.getByRole('checkbox', { name: /Configuration à supprimer/ }).check();
  await selection.getByRole('button', { name: 'Terminer' }).click();
  await expect(page.getByRole('group', { name: 'Modèles sélectionnés pour les tests' })).toContainText('Configuration à supprimer');

  const initialSettings = await page.evaluate((key) => localStorage.getItem(key), configurationStorageKey);
  await page.getByRole('button', { name: 'Gérer les configurations' }).click();
  await selection.getByRole('button', { name: 'Supprimer des configurations' }).click();

  const manager = page.getByRole('dialog', { name: 'Gérer mes configurations IA' });
  await manager.getByRole('checkbox', { name: /Configuration à supprimer/ }).check();
  await manager.getByRole('button', { name: /Supprimer 1 configuration/ }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirmer la suppression des configurations' });
  await expect(confirm).toContainText('Configuration à supprimer');
  await confirm.getByRole('button', { name: 'Retour à la liste' }).click();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]'), profileStorageKey)).toEqual(profiles);
  await manager.getByRole('button', { name: /Supprimer 1 configuration/ }).click();
  await confirm.getByRole('button', { name: 'Confirmer la suppression de 1 configuration(s)' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Modèles sélectionnés pour les tests' })).not.toContainText('Configuration à supprimer');
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]'), profileStorageKey)).toEqual([profiles[1]]);
  expect(await page.evaluate((key) => localStorage.getItem(key), configurationStorageKey)).toBe(initialSettings);

  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('button', { name: 'Gérer les configurations' }).click();
  await expect(selection.getByRole('checkbox')).toHaveCount(1);
  await expect(selection).toContainText('Configuration à conserver');
});

test('teacher deletion is reflected in the evaluation manager and edit modal', async ({ page }) => {
  await page.goto('/');
  await page.locator('.assignment-overview-card').first().getByRole('button', { name: /Reprendre le devoir/ }).click();
  await page.getByRole('button', { name: /Réglages de l’IA locale|IA locale à configurer/ }).click();
  const teacherPanel = page.locator('#teacher-ai-settings-panel');
  await teacherPanel.locator('#ai-model-profile').selectOption('saved-one');
  await teacherPanel.getByRole('button', { name: 'Supprimer cette configuration' }).click();
  await page.getByRole('dialog', { name: 'Supprimer cette configuration IA ?' })
    .getByRole('button', { name: 'Supprimer la configuration' }).click();
  await expect(teacherPanel.locator('#ai-model-profile option')).toHaveCount(2);

  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('button', { name: 'Gérer les configurations' }).click();
  const selection = page.getByRole('dialog', { name: 'Gérer les configurations IA' });
  await expect(selection).not.toContainText('Configuration à supprimer');
  await expect(selection).toContainText('Configuration à conserver');
  await selection.getByRole('button', { name: 'Modifier', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Créer ou modifier une configuration IA' });
  await expect(editor.locator('#evaluation-profile-select')).toHaveValue('saved-two');
  await expect(editor.locator('#evaluation-profile-name')).toHaveValue('Configuration à conserver');
});

test('batch cleanup safely retains three profiles and preserves settings', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('button', { name: 'Gérer les configurations' }).click();
  const selection = page.getByRole('dialog', { name: 'Gérer les configurations IA' });
  await expect(selection.getByRole('checkbox')).toHaveCount(16);
  await selection.getByRole('checkbox', { name: /Ancien 16/ }).check();
  await selection.locator('.evaluation-profiles-dialog-item').filter({ hasText: 'Ancien 16' })
    .getByRole('button', { name: 'Modifier', exact: true }).click();
  const editor = page.getByRole('dialog', { name: 'Créer ou modifier une configuration IA' });
  await expect(editor.locator('#evaluation-analysis-model')).toHaveValue('model-15');
  await editor.getByRole('button', { name: 'Fermer', exact: true }).click();

  await page.getByRole('button', { name: 'Gérer les configurations' }).click();
  await selection.getByRole('button', { name: 'Supprimer des configurations' }).click();
  let manager = page.getByRole('dialog', { name: 'Gérer mes configurations IA' });
  await manager.getByRole('button', { name: 'Tout sélectionner' }).click();
  for (const name of ['Garder 1', 'Garder 2', 'Garder 3']) {
    await manager.getByRole('checkbox', { name: new RegExp(name) }).uncheck();
  }
  await expect(manager.getByText('13 à supprimer · 3 à conserver')).toBeVisible();
  await manager.getByRole('button', { name: /Supprimer 13 configuration/ }).click();
  let confirmation = page.getByRole('dialog', { name: 'Confirmer la suppression des configurations' });
  await expect(confirmation.locator('.ai-profile-manager-confirm-list li')).toHaveCount(13);
  await confirmation.getByRole('button', { name: 'Retour à la liste' }).click();
  manager = page.getByRole('dialog', { name: 'Gérer mes configurations IA' });
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]').length, profileStorageKey)).toBe(16);
  await manager.getByRole('button', { name: /Supprimer 13 configuration/ }).click();
  confirmation = page.getByRole('dialog', { name: 'Confirmer la suppression des configurations' });
  await confirmation.getByRole('button', { name: 'Confirmer la suppression de 13 configuration(s)' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]').map((item: { id: string }) => item.id), profileStorageKey))
    .toEqual(['bulk-0', 'bulk-1', 'bulk-2']);
  await expect(page.getByRole('group', { name: 'Modèles sélectionnés pour les tests' })).not.toContainText('Ancien 16');
  expect(await page.evaluate((key) => localStorage.getItem(key), configurationStorageKey)).toBeTruthy();

  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('button', { name: 'Gérer les configurations' }).click();
  await expect(selection.getByRole('checkbox')).toHaveCount(3);
  await expect(selection).not.toContainText('Ancien');
});

test('batch removal refuses to change state when local storage fails', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('button', { name: 'Gérer les configurations' }).click();
  await page.getByRole('dialog', { name: 'Gérer les configurations IA' })
    .getByRole('button', { name: 'Supprimer des configurations' }).click();
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
  await page.getByRole('dialog', { name: 'Gérer mes configurations IA' })
    .getByRole('button', { name: 'Fermer', exact: true }).click();
});
