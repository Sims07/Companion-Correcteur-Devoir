import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC } from '../../src/domain/scientificDiagramFixtures';

test('Qwen direct diagram repairs missing evidence and exports all 19 decisions without OCR', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([{
    id: 'qwen-direct', name: 'Qwen direct', mode: 'single', updatedAt: '2026-11-08T00:00:00Z',
    configuration: { endpoint: 'http://localhost:11434', apiCompatible: false, apiKey: '',
      visionModel: 'unused-ocr', analysisModel: 'qwen3.5:4b', correctionMethod: 'generative',
      secondAnalysisModel: '', arbitratorModel: '',
      diagnosticStrategy: 'single', analysisThinking: false, criterionByCriterion: true },
  }])));
  const payloads: Record<string, any>[] = [];
  await page.route('http://localhost:11434/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/api/tags') return route.fulfill({ headers, json: { models: [{ name: 'qwen3.5:4b' }] } });
    if (path === '/api/ps') return route.fulfill({ headers, json: { models: [] } });
    const body = route.request().postDataJSON();
    if (path === '/api/chat' && body.messages?.[0]?.images?.length) {
      payloads.push(body);
      const criteria = Object.fromEntries(SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria.map(c => [c.id, {
        evidence: 'Observation visible', confidence: 'medium', questionForTeacher: '',
        subcriteria: Object.fromEntries(c.subcriteria!.map(s => [s.id, { points: 0, evidence: 'Élément absent' }])),
      }]));
      // A valid JSON with a missing proof must be repaired, never scored silently.
      if (payloads.length === 1) criteria.drawing.subcriteria['drawing-page'].evidence = '';
      return route.fulfill({ headers, contentType: 'application/x-ndjson', body:
        JSON.stringify({ message: { content: JSON.stringify({ criteria }) } }) + '\n'
        + JSON.stringify({ done: true, done_reason: 'stop', eval_count: 500 }) + '\n' });
    }
    return route.fulfill({ headers, json: { done: true, message: { content: '{}' } } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: /Schémas scientifiques/ }).click();
  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  await page.getByRole('group', { name: 'Configurations à exécuter' }).locator('label.evaluation-profile-option').first().click();
  await panel.getByRole('combobox', { name: 'Méthode de correction scientifique à tester' }).selectOption('direct-image-generative');
  await panel.getByRole('button', { name: 'Tester les 3 schémas en un clic' }).click();
  const results = panel.getByRole('region', { name: 'Résultats des schémas scientifiques' });
  await expect(results.locator('tbody tr')).toHaveCount(3);
  const [download] = await Promise.all([page.waitForEvent('download'), results.getByRole('button', { name: 'Exporter le rapport JSON' }).click()]);
  const report = JSON.parse(await readFile(await download.path(), 'utf8'));
  const runs = report.cases.flatMap((c: { experiments: unknown[] }) => c.experiments);
  expect(runs).toHaveLength(3);
  expect(runs.every((r: any) => r.status === 'success' && r.score === 0 && r.observations.length === 19)).toBe(true);
  expect(runs[0].diagnostics.repairCalls).toBe(1);
  expect(payloads).toHaveLength(4);
  expect(payloads.every(p => p.model === 'qwen3.5:4b' && p.messages[0].images.length === 1)).toBe(true);
});

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
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: /Schémas scientifiques/ }).click();

  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  await panel.locator('details.diagram-lab-legacy > summary').click();
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


test('the scientific-diagram lab exposes an explicit multimodal comparison independently from teacher correction', async ({ page }) => {
  const configuration = {
    endpoint: 'http://localhost:11434',
    apiCompatible: false, apiKey: '', visionModel: 'glm-ocr:4b',
    transcriptionTokenLimit: 2048, transcriptionPromptMode: 'auto',
    transcriptionRepeatPenalty: 1.05, transcriptionPenaltyParameter: 'none',
    transcriptionFrequencyPenalty: 0, analysisModel: 'qwen3.5:9b',
    secondAnalysisModel: '', arbitratorModel: '', diagnosticStrategy: 'single',
    analysisThinking: false, criterionByCriterion: true, correctionMethod: 'generative',
  };
  await page.addInitScript((profiles) => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify(profiles));
  }, [{ id: 'qwen-image', name: 'Qwen 9B multimodal', mode: 'single', updatedAt: '2026-11-08T00:00:00Z', configuration }]);
  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: /Schémas scientifiques/ }).click();

  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  const method = panel.getByRole('combobox', { name: 'Méthode de correction scientifique à tester' });
  await expect(method).toHaveValue('compare');
  const choices = page.getByRole('group', { name: 'Configurations à exécuter' });
  await choices.locator('label.evaluation-profile-option').first().click();
  await expect(panel.getByText('Vision puis analyse / Image → génératif direct', { exact: false })).toBeVisible();

  await method.selectOption('direct-image-generative');
  await expect(method).toHaveValue('direct-image-generative');
  await expect(panel.getByText('Qwen 9B multimodal (Image → génératif direct)')).toBeVisible();

  await method.selectOption('direct-image-systemone');
  await expect(panel.getByRole('button', { name: 'Tester les 3 schémas en un clic' })).toBeDisabled();
  await expect(panel.getByText(/Le parcours System One image exige/).first()).toBeVisible();
  await method.selectOption('compare');
  await expect(panel.getByRole('button', { name: 'Tester les 3 schémas en un clic' })).toBeEnabled();
});
