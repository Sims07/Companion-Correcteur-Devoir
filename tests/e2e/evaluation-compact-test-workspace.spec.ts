import { expect, test } from '@playwright/test';

test('scientific batteries lead directly to a compact configuration toolbar and controls', async ({ page }) => {
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
    { id: 'local', name: 'Profil local de test', mode: 'single', updatedAt: '2026-11-10T10:00:00.000Z', configuration: config },
  ])), configuration);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('group', { name: 'Parcours de test' })
    .getByRole('button', { name: 'Schémas scientifiques' }).click();

  const toolbar = page.locator('.evaluation-setup-toolbar');
  const editor = toolbar.locator('details.evaluation-config-editor');
  await expect(editor).not.toHaveAttribute('open', '');
  const row = await toolbar.evaluate((element) => {
    const model = element.querySelector('.evaluation-model-selector')?.getBoundingClientRect();
    const editorSummary = element.querySelector('details.evaluation-config-editor > summary')?.getBoundingClientRect();
    return { modelY: model?.top ?? -1, editorY: editorSummary?.top ?? -2 };
  });
  expect(Math.abs(row.modelY - row.editorY)).toBeLessThan(20);

  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  await expect(panel.getByRole('heading', { name: 'Schémas scientifiques · batteries de tests' })).toHaveCount(1);
  await expect(panel.getByText('LABORATOIRE · PROTOCOLES AUTOMATIQUES')).toHaveCount(0);
  await expect(panel.getByRole('tablist', { name: 'Protocoles automatiques des schémas scientifiques' })).toBeVisible();
  const alignedMethod = await panel.locator('.diagram-lab-method').evaluate((element) => {
    const label = element.querySelector('label')?.getBoundingClientRect();
    const select = element.querySelector('select')?.getBoundingClientRect();
    return { labelY: label?.top ?? -1, selectY: select?.top ?? -2 };
  });
  expect(Math.abs(alignedMethod.labelY - alignedMethod.selectY)).toBeLessThan(20);
  await expect(panel.getByRole('button', { name: 'Tester les 3 schémas en un clic' })).toBeVisible();

  await editor.locator('summary').click();
  await expect(editor).toHaveAttribute('open', '');
  await expect(editor.getByLabel('Nom de la configuration')).toBeVisible();
  await editor.locator('summary').click();
  await expect(editor).not.toHaveAttribute('open', '');

  await page.setViewportSize({ width: 390, height: 844 });
  const tabs = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  const tabPositions = await tabs.getByRole('button', { name: /^(Tests|Carnet de résultats|Radar des candidats)$/ }).evaluateAll((buttons) =>
    buttons.map((button) => Math.round(button.getBoundingClientRect().top)));
  expect(new Set(tabPositions).size).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await tabs.getByRole('button', { name: 'Radar des candidats' }).click();
  await expect(tabs.getByRole('button', { name: 'Radar des candidats' })).toHaveAttribute('aria-current', 'page');
});

test('biology batteries no longer stack a second laboratory introduction above the choices', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: 'Biologie' }).click();
  const panel = page.getByRole('region', { name: 'Protocole de test guidé' });
  await expect(panel.getByRole('heading', { name: 'Tests de référence en biologie' })).toHaveCount(1);
  await expect(panel.getByText('LABORATOIRE · EXPÉRIENCE GUIDÉE')).toHaveCount(0);
  await expect(panel.getByRole('group', { name: 'Objectif du protocole de biologie' }).getByRole('button')).toHaveCount(3);
  await expect(panel.getByRole('button', { name: 'Comparer standard et variante B en un clic' })).toBeVisible();
  await panel.getByRole('group', { name: 'Objectif du protocole de biologie' })
    .getByRole('button', { name: 'Vision et parallélisme' }).click();
  await expect(panel.getByRole('button', { name: 'Préparer le protocole en un clic' })).toBeVisible();
});
