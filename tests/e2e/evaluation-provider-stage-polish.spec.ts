import { openCustomTests } from './helpers/evaluation-models.ts';
import { expect, test } from '@playwright/test';

test('evaluation does not add a permanent provider/privacy banner regardless of selected configuration', async ({ page }) => {
  const configuration = {
    endpoint: 'http://localhost:11434', apiCompatible: false, apiKey: '',
    visionModel: 'qwen3.5:4b', analysisModel: 'qwen3.5:4b',
    transcriptionTokenLimit: 2048, transcriptionPromptMode: 'auto',
    transcriptionRepeatPenalty: 1.05, transcriptionPenaltyParameter: 'none',
    transcriptionFrequencyPenalty: 0, analysisThinking: false,
    criterionByCriterion: true, correctionMethod: 'generative',
    secondAnalysisModel: '', arbitratorModel: '', diagnosticStrategy: 'single',
  };
  await page.addInitScript((config) => localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([
    { id: 'local', name: 'Local témoin', mode: 'single', updatedAt: '2026-11-10T10:00:00.000Z', configuration: config },
    { id: 'remote', name: 'Profil serveur distant', mode: 'single', updatedAt: '2026-11-10T10:00:00.000Z',
      configuration: { ...config, endpoint: 'https://remote.example/v1/chat/completions', apiCompatible: true } },
  ])), configuration);
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await openCustomTests(page);
  const notice = page.locator('.evaluation-provider-indicator, .evaluation-page-header');
  const remoteNotice = page.locator('.evaluation-remote-endpoint-notice');
  await expect(notice).toHaveCount(0);
  await expect(remoteNotice).toHaveCount(0);

  await page.getByRole('button', { name: 'Gérer les configurations' }).click();
  const configurations = page.getByRole('dialog', { name: 'Gérer les configurations IA' });
  await configurations.getByRole('checkbox', { name: /Profil serveur distant/ }).check();
  await expect(notice).toHaveCount(0);
  await expect(remoteNotice).toHaveCount(0);
  await configurations.getByRole('checkbox', { name: /Local témoin/ }).check();
  await expect(notice).toHaveCount(0);
  await configurations.getByRole('checkbox', { name: /Profil serveur distant/ }).uncheck();
  await expect(notice).toHaveCount(0);
  await expect(remoteNotice).toHaveCount(0);
});

test('personal tests use a compact type switch, never a numbered sequence', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await openCustomTests(page);
  const picker = page.getByRole('group', { name: 'Type d’évaluation' });
  const options = picker.getByRole('button');
  await expect(options).toHaveCount(3);
  await expect(picker.locator('.evaluation-stage-number')).toHaveCount(0);
  await expect(options.nth(0)).toHaveText('Vision seule');
  await expect(options.nth(1)).toHaveText('Analyse seule');
  await expect(options.nth(2)).toHaveText('Parcours complet');
  await expect(options.nth(2)).toHaveAttribute('aria-pressed', 'true');
  await options.nth(1).click();
  await expect(options.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Transcription à noter' })).toBeVisible();
  await expect(picker).toHaveCSS('display', 'grid');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(picker).toHaveCSS('display', 'grid');
  await expect(options).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
