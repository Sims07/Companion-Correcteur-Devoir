import { expect, test } from '@playwright/test';
import { defaultAiModelConfiguration } from '../../src/shared/domain/aiModelProfiles.ts';

test('un même Gemma peut ouvrir trois radars indépendants selon le niveau de pensée', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(configuration => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify(
      (['off', 'low', 'high'] as const).map(level => ({
        id: 'gemma-' + level,
        name: 'Gemma 26B ' + level,
        mode: 'single',
        updatedAt: '2026-11-22T08:00:00Z',
        configuration: {
          ...configuration,
          endpoint: 'http://localhost:1234/v1',
          apiCompatible: true,
          visionModel: 'google/gemma-4-26b-a4b-qat',
          analysisModel: 'google/gemma-4-26b-a4b-qat',
          correctionMethod: 'generative',
          analysisThinking: level !== 'off',
          analysisReasoningEffort: level === 'off' ? 'medium' : level,
        },
      })),
    ));
  }, defaultAiModelConfiguration);
  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  const home = page.getByRole('region', { name: 'Tableau de bord des radars' });
  const selector = home.getByLabel('Choisir un LLM');
  await expect(selector.locator('option')).toHaveCount(3);
  await expect(selector.locator('option[value="gemma-off"]')).toContainText('Think Off');
  await expect(selector.locator('option[value="gemma-low"]')).toContainText('Think low');
  await expect(selector.locator('option[value="gemma-high"]')).toContainText('Think high');
  await selector.selectOption('gemma-low');
  await expect(home.getByRole('article', { name: 'Schémas scientifiques' })).toContainText('À évaluer');
  await home.getByRole('button', { name: 'Comparer les LLM' }).click();
  await expect(home.getByRole('group', { name: 'Modèles à superposer' })).toContainText('Gemma 26B');
  await selector.selectOption('gemma-high');
  await expect(selector).toHaveValue('gemma-high');
  await home.getByRole('article', { name: 'Schémas scientifiques' })
    .getByRole('button', { name: 'Détail du radar' }).click();
  await expect(page.getByRole('region', { name: 'Radar des candidats scientifiques' })
    .getByLabel('Choisir un LLM')).toHaveValue('gemma-high');
  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  const restored = page.getByRole('region', { name: 'Radar des candidats scientifiques' });
  await expect(restored.getByLabel('Choisir un LLM')).toHaveValue('gemma-high');
});
