import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('semantic sensitivity suite sends the same independent rubric with six pixel images and exports safe metrics', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([{
      id: 'semantic-local', name: 'D1 sémantique', mode: 'single',
      updatedAt: '2026-11-09T12:00:00Z',
      configuration: {
        endpoint: 'http://localhost:11434', apiCompatible: false, apiKey: '',
        visionModel: '', analysisModel: 'd1:3b',
        transcriptionTokenLimit: 2048, transcriptionPromptMode: 'auto',
        transcriptionRepeatPenalty: 1.05, transcriptionPenaltyParameter: 'none',
        transcriptionFrequencyPenalty: 0, analysisThinking: false,
        criterionByCriterion: true, correctionMethod: 'decision',
        secondAnalysisModel: '', arbitratorModel: '', diagnosticStrategy: 'single',
      },
    }]));
  });
  const requests: Array<{ imageCount: number; state: string; answerKeys: string[]; pixels: string }> = [];
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'content-type': 'application/json',
  };
  await page.route('http://localhost:11434/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (url.pathname === '/api/tags') {
      await route.fulfill({ status: 200, headers,
        body: JSON.stringify({ models: [{ name: 'd1:3b', model: 'd1:3b' }] }) });
      return;
    }
    if (url.pathname === '/api/show') {
      await route.fulfill({ status: 200, headers, body: JSON.stringify({ model_info: {} }) });
      return;
    }
    if (url.pathname === '/api/ps') {
      await route.fulfill({ status: 200, headers, body: JSON.stringify({ models: [] }) });
      return;
    }
    if (url.pathname === '/v1/systemone') {
      const body = request.postDataJSON() as {
        images: string[]; state: string; questions: Record<string, unknown>;
      };
      const answerKeys = Object.keys(body.questions ?? {});
      requests.push({ imageCount: body.images?.length ?? 0, state: body.state, answerKeys, pixels: body.images?.[0] ?? '' });
      const answers = Object.fromEntries(answerKeys.map((key) => [
        key, key === 'alignment'
          ? { type: 'choice', choice: 'aligned', confidence: 0.99, probabilities: { aligned: 1 } }
          : { type: 'choice', choice: 'present', confidence: 0.99, probabilities: { present: 1 } },
      ]));
      await route.fulfill({ status: 200, headers,
        body: JSON.stringify({ answers, usage: { input_tokens: 20, output_tokens: 0 } }) });
      return;
    }
    await route.fulfill({ status: 404, headers, body: '{}' });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  await page.getByRole('group', { name: 'Parcours de test' })
    .getByRole('button', { name: /Schémas scientifiques/ }).click();

  const section = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  await section.getByRole('tab', { name: /Compréhension biologique/ }).click();
  const suite = section.getByRole('region', { name: 'Sensibilité sémantique' });
  await expect(suite.locator('.diagram-fixture-card')).toHaveCount(6);
  await expect(suite.getByText('À arbitrer', { exact: true })).toBeVisible();
  await expect(suite.getByRole('button', { name: 'Tester les 6 variantes sémantiques' })).toBeDisabled();
  await page.getByRole('group', { name: 'Configurations à exécuter' })
    .locator('label.evaluation-profile-option').first().click();
  await suite.getByRole('combobox', { name: 'Stratégie de vérification visuelle' }).selectOption('compare');
  await suite.getByRole('button', { name: 'Tester les 6 variantes sémantiques' }).click();
  await expect.poll(() => requests.length, { timeout: 90_000 }).toBe(12);
  // A/B uses exactly the same preprocessed PNG pixels, not a second rasterization.
  expect(requests.slice(0, 6).map((item) => item.pixels))
    .toEqual(requests.slice(6).map((item) => item.pixels));
  expect(requests.every((item) => item.imageCount === 1)).toBe(true);
  expect(requests.every((item) => item.answerKeys.filter((key) => key.includes('expected_')).length === 3)).toBe(true);
  expect(requests.every((item) => !/S1 —|S2 —|S3 —|Flèche inversée|Mauvaise connexion/.test(item.state))).toBe(true);

  const results = suite.getByRole('region', { name: 'Résultats de sensibilité sémantique' });
  await expect(results).toBeVisible({ timeout: 30_000 });
  await expect(results.locator('tbody tr')).toHaveCount(2);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    suite.getByRole('button', { name: 'Exporter les mesures JSON' }).click(),
  ]);
  const json = JSON.parse(await readFile(await download.path(), 'utf8')) as {
    format: string; cases: { caseId: string; referenceScore: number | null; experiments: unknown[] }[];
    promptModes: string[];
    statistics: { promptMode: string; sensitivityHits: number; sensitivityTrials: number }[];
  };
  expect(json.format).toBe('companion-scientific-diagram-sensitivity-report');
  expect(json.promptModes).toEqual(['standard', 'guided']);
  expect(json.cases).toHaveLength(12);
  expect(json.cases.map((item) => item.caseId))
    .toEqual(['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S0', 'S1', 'S2', 'S3', 'S4', 'S5']);
  expect(json.cases.map((item) => item.experiments.length)).toEqual(Array(12).fill(1));
  expect(json.cases[5]?.referenceScore).toBeNull();
  expect(json.statistics.map((item) => item.promptMode)).toEqual(['standard', 'guided']);
  const raw = JSON.stringify(json);
  expect(raw).not.toContain('access-control-allow-origin');
  expect(raw).not.toContain('data:image');
  expect(raw).not.toContain('http://localhost:11434');
  expect(raw).not.toContain('images":["');
  // Real model sensitivity is deliberately NOT asserted by mocked inference.
});
