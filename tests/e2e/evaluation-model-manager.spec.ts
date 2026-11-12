import { openCustomTests } from './helpers/evaluation-models.ts';
import { expect, test } from '@playwright/test';

const profileSettings = {
  endpoint: 'http://localhost:11434', apiCompatible: false, apiKey: '',
  visionModel: 'qwen3.5:4b', analysisModel: 'qwen3.5:4b',
  transcriptionTokenLimit: 2048, transcriptionPromptMode: 'auto',
  transcriptionRepeatPenalty: 1.05, transcriptionPenaltyParameter: 'none',
  transcriptionFrequencyPenalty: 0, analysisThinking: false,
  criterionByCriterion: true, correctionMethod: 'generative',
  secondAnalysisModel: '', arbitratorModel: '', diagnosticStrategy: 'single',
};

test('evaluation presents one discreet model choice and moves all management to dialogs', async ({ page }, testInfo) => {
  const profiles = [1, 2, 3, 4].map((number) => ({
    id: 'test-' + number, name: 'Modèle test ' + number,
    mode: 'single', updatedAt: '2026-11-11T08:00:00Z',
    configuration: { ...profileSettings, analysisModel: 'qwen-model-' + number },
  }));
  await page.addInitScript((saved) => localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify(saved)), profiles);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Évaluer les modèles' }).click();
  await openCustomTests(page);

  await expect(page.locator('.evaluation-config-workspace .evaluation-config-editor')).toHaveCount(0);
  await expect(page.locator('.evaluation-selection-block, .evaluation-model-selector')).toHaveCount(0);
  const brief = page.getByRole('group', { name: 'Modèles sélectionnés pour les tests' });
  await expect(brief).toBeVisible();
  await expect(brief).toContainText('Aucun modèle sélectionné');
  await expect(page.getByRole('region', { name: 'Protocole schémas scientifiques' })).toHaveCount(0);

  await brief.getByRole('button', { name: 'Gérer les configurations' }).click();
  const manager = page.getByRole('dialog', { name: 'Gérer les configurations IA' });
  const choices = manager.getByRole('group', { name: 'Configurations à exécuter' });
  await expect(choices.getByRole('checkbox')).toHaveCount(4);
  for (const label of ['Modèle test 1', 'Modèle test 2', 'Modèle test 3']) {
    await choices.getByRole('checkbox', { name: new RegExp(label) }).check();
  }
  await expect(choices.getByRole('checkbox', { name: /Modèle test 4/ })).toBeDisabled();
  await choices.getByRole('checkbox', { name: /Modèle test 2/ }).uncheck();
  await choices.getByRole('checkbox', { name: /Modèle test 4/ }).check();
  await manager.getByRole('button', { name: 'Terminer' }).click();
  await expect(brief).toContainText('Modèle test 1');
  await expect(brief).toContainText('Modèle test 4');
  await expect(brief).not.toContainText('Modèle test 2');

  await brief.getByRole('button', { name: 'Gérer les configurations' }).click();
  await manager.getByRole('button', { name: 'Modifier', exact: true }).first().click();
  const editor = page.getByRole('dialog', { name: 'Créer ou modifier une configuration IA' });
  await expect(editor.locator('#evaluation-profile-name')).toHaveValue('Modèle test 1');
  await expect(editor.locator('#evaluation-provider')).toBeVisible();
  await expect(editor.locator('#evaluation-analysis-model')).toBeVisible();
  await editor.getByRole('button', { name: 'Fermer', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await brief.getByRole('button', { name: 'Gérer les configurations' }).click();
  await expect(manager).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('evaluation-models-dialog-mobile.png'), fullPage: true });
  await manager.getByRole('button', { name: 'Terminer' }).click();
  await page.screenshot({ path: testInfo.outputPath('evaluation-workbench-compact-mobile.png'), fullPage: true });
});
