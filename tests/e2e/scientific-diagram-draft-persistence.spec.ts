import { expect, test } from '@playwright/test';
import { chooseEvaluationModel } from './helpers/evaluation-models.ts';
import { SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC } from '../../src/correction/domain/scientificDiagramRubric.ts';

const pixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZckAAAAASUVORK5CYII=', 'base64',
);

const configuration = {
  endpoint: 'http://localhost:11434', apiCompatible: false, apiKey: '',
  visionModel: '', analysisModel: 'qwen3.5:4b', correctionMethod: 'generative',
  secondAnalysisModel: '', arbitratorModel: '', diagnosticStrategy: 'single',
  analysisThinking: false, criterionByCriterion: true,
};

async function openPersonalDiagram(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' })
    .getByRole('button', { name: 'Tests', exact: true }).click();
  await page.getByRole('group', { name: 'Parcours de test' })
    .getByRole('button', { name: /Schémas scientifiques/ }).click();
  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  await panel.locator('details.diagram-lab-legacy > summary').click();
  return panel;
}

test('a failed personal diagram analysis keeps its image and rubric after refresh for regrading', async ({ page }) => {
  await page.addInitScript((profile) => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([profile]));
  }, { id: 'draft-model', name: 'Modèle de reprise', mode: 'single',
    updatedAt: '2026-11-16T15:00:00Z', configuration });

  let failing = true;
  let chatCalls = 0;
  await page.route('http://localhost:11434/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/api/tags') return route.fulfill({ headers, json: { models: [{ name: 'qwen3.5:4b' }] } });
    if (path === '/api/ps') return route.fulfill({ headers, json: { models: [] } });
    if (path === '/api/show') return route.fulfill({ headers, json: { capabilities: ['completion', 'vision'] } });
    if (path === '/api/chat') {
      chatCalls++;
      if (failing) return route.fulfill({ status: 503, headers, json: { error: 'IA indisponible' } });
      const criteria = Object.fromEntries(SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC.criteria.map(criterion => [
        criterion.id, {
          evidence: 'Schéma visible', confidence: 'high', questionForTeacher: '',
          subcriteria: Object.fromEntries((criterion.subcriteria ?? []).map(sub => [
            sub.id, { points: 0, evidence: 'Non représenté' },
          ])),
        },
      ]));
      return route.fulfill({ headers, contentType: 'application/x-ndjson',
        body: JSON.stringify({ message: { content: JSON.stringify({ criteria }) } }) + '\n' +
          JSON.stringify({ done: true, done_reason: 'stop' }) + '\n' });
    }
    return route.fulfill({ status: 404, headers, body: '{}' });
  });

  await page.goto('/');
  let panel = await openPersonalDiagram(page);
  await chooseEvaluationModel(page);
  await panel.getByRole('combobox', { name: 'Méthode de correction scientifique à tester' })
    .selectOption('direct-image-generative');
  await panel.getByRole('button', { name: /Mitose végétale · 10 points/ }).click();
  await panel.locator('#diagram-protocol-photos').setInputFiles({
    name: 'copie-a-relancer.png', mimeType: 'image/png', buffer: pixelPng,
  });
  await panel.locator('#diagram-protocol-context').fill('Mitose en quatre panneaux');
  await expect(panel.getByText('Schéma sauvegardé sur cet appareil', { exact: false })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Analyser mon schéma' })).toBeEnabled();
  await panel.getByRole('button', { name: 'Analyser mon schéma' }).click();
  await expect.poll(() => chatCalls).toBeGreaterThan(0);
  await expect(panel.getByRole('button', { name: 'Analyser mon schéma' })).toBeEnabled({ timeout: 30_000 });

  // Simulate the teacher's action: reload after AI error, with no reimport.
  await page.reload();
  panel = await openPersonalDiagram(page);
  await expect(panel.getByText('1 page(s) prêtes')).toBeVisible();
  await expect(panel.getByRole('img', { name: /copie-a-relancer.png/ })).toBeVisible();
  await expect(panel.locator('#diagram-protocol-context')).toHaveValue('Mitose en quatre panneaux');
  await expect(panel.getByRole('button', { name: /Mitose végétale · 10 points/ }))
    .toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByRole('combobox', { name: 'Méthode de correction scientifique à tester' }))
    .toHaveValue('direct-image-generative');
  await expect(panel.getByText('Schéma sauvegardé sur cet appareil', { exact: false })).toBeVisible();
  failing = false;
  await expect(panel.getByRole('button', { name: 'Analyser mon schéma' })).toBeEnabled();
  await panel.getByRole('button', { name: 'Analyser mon schéma' }).click();
  await expect(panel.locator('#evaluation-diagram-personal-results')).toContainText('1 essai(s) exécuté(s)');
  expect(chatCalls).toBeGreaterThanOrEqual(2);
});
