import { chooseEvaluationModel } from './helpers/evaluation-models';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC } from '../../src/evaluation/domain/scientificDiagramFixtures.ts';

test('scientific batteries explain the exact 10-point rubric and personal diagrams can choose 8 or 10 points', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' })
    .getByRole('button', { name: 'Tests', exact: true }).click();
  await page.getByRole('group', { name: 'Parcours de test' })
    .getByRole('button', { name: /Schémas scientifiques/ }).click();
  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  const fixtureRubric = panel.locator('details.diagram-lab-rubric');
  await fixtureRubric.locator('summary').click();
  await expect(fixtureRubric.locator('section.diagram-lab-rubric-group')).toHaveCount(4);
  await expect(fixtureRubric.locator('li')).toHaveCount(19);
  await expect(fixtureRubric).toContainText('titre PRINCIPAL');
  await expect(fixtureRubric).toContainText('La disposition des sous-schémas en grille');
  await expect(fixtureRubric).toContainText('chromatine non condensée');
  await panel.locator('details.diagram-lab-legacy > summary').click();
  const presets = panel.getByRole('group', { name: 'Modèle de barème pour le schéma personnel' });
  const standard = presets.getByRole('button', { name: /Dessin scientifique · 8 points/ });
  const mitosis = presets.getByRole('button', { name: /Mitose végétale · 10 points/ });
  await expect(standard).toHaveAttribute('aria-pressed', 'true');
  await mitosis.click();
  await expect(mitosis).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByText('19 attendus', { exact: false })).toBeVisible();
  await standard.click();
  await expect(standard).toHaveAttribute('aria-pressed', 'true');
  await expect(panel.getByText('15 attendus', { exact: false })).toBeVisible();
});

test('Qwen direct diagram repairs missing evidence and exports all 19 decisions without OCR', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([{
    id: 'qwen-direct', name: 'Qwen direct', mode: 'single', updatedAt: '2026-11-08T00:00:00Z',
    configuration: { endpoint: 'http://localhost:11434', apiCompatible: false, apiKey: '',
      visionModel: 'unused-ocr', analysisModel: 'qwen3.5:4b', correctionMethod: 'generative',
      secondAnalysisModel: '', arbitratorModel: '',
      diagnosticStrategy: 'single', analysisThinking: false, criterionByCriterion: false },
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
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' }).getByRole('button', { name: 'Tests', exact: true }).click();
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: /Schémas scientifiques/ }).click();
  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  await chooseEvaluationModel(page);
  await panel.getByRole('combobox', { name: 'Méthode de correction scientifique à tester' }).selectOption('direct-image-generative');
  await panel.getByRole('button', { name: 'Tester les 3 schémas en un clic' }).click();
  const results = panel.getByRole('region', { name: 'Résultats des schémas scientifiques' });
  await expect(results.locator('tbody tr')).toHaveCount(3);
  const activity = page.getByRole('status', { name: 'Dernière expérience lancée' });
  await expect(activity).toContainText('TEST TERMINÉ');
  await activity.getByRole('button', { name: 'Masquer le bandeau' }).click();
  await expect(activity).toHaveCount(0);
  // Closing the sticky banner must not erase the completed fixture results.
  await expect(results.locator('tbody tr')).toHaveCount(3);
  const [download] = await Promise.all([page.waitForEvent('download'), results.getByRole('button', { name: 'Exporter le rapport JSON' }).click()]);
  const report = JSON.parse(await readFile(await download.path(), 'utf8'));
  const runs = report.cases.flatMap((c: { experiments: unknown[] }) => c.experiments);
  expect(runs).toHaveLength(3);
  expect(runs.every((r: any) => r.status === 'success' && r.score === 0 && r.observations.length === 19)).toBe(true);
  expect(runs[0].diagnostics.repairCalls).toBe(1);
  expect(payloads).toHaveLength(4);
  expect(payloads.every(p => p.model === 'qwen3.5:4b' && p.messages[0].images.length === 1)).toBe(true);
  // A subsequent run brings back the activity banner, without reloading the app.
  await panel.getByRole('button', { name: 'Tester les 3 schémas en un clic' }).click();
  await expect(page.getByRole('status', { name: 'Dernière expérience lancée' })).toBeVisible();
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
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' }).getByRole('button', { name: 'Tests', exact: true }).click();
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: /Schémas scientifiques/ }).click();

  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  await panel.locator('details.diagram-lab-legacy > summary').click();
  await expect(panel.getByText('15 attendus', { exact: false }).first()).toBeVisible();
  await expect(panel.getByText('8 points', { exact: false }).first()).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Analyser mon schéma' })).toBeDisabled();
  await expect(panel.getByRole('combobox', { name: 'Passages du schéma personnel' })).toHaveValue('1');
  await panel.getByRole('combobox', { name: 'Passages du schéma personnel' }).selectOption('3');
  await expect(panel.getByRole('combobox', { name: 'Passages du schéma personnel' })).toHaveValue('3');
  await panel.getByRole('combobox', { name: 'Passages du schéma personnel' }).selectOption('5');
  await expect(panel.getByRole('combobox', { name: 'Passages du schéma personnel' })).toHaveValue('5');
  await panel.getByRole('combobox', { name: 'Passages du schéma personnel' }).selectOption('1');
  await expect(panel.getByRole('combobox', { name: 'Passages du schéma personnel' })).toHaveValue('1');

  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZckAAAAASUVORK5CYII=', 'base64');
  await panel.locator('#diagram-protocol-photos').setInputFiles({
    name: 'cellules.png', mimeType: 'image/png', buffer: png,
  });
  await expect(panel.getByText('1 page(s) prêtes')).toBeVisible();

  await panel.locator('details.diagram-protocol-reference-details > summary').click();
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

  await chooseEvaluationModel(page);
  await expect(panel.getByText('System One image directe', { exact: false })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Analyser mon schéma' })).toBeEnabled();
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
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' }).getByRole('button', { name: 'Tests', exact: true }).click();
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: /Schémas scientifiques/ }).click();

  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  const method = panel.getByRole('combobox', { name: 'Méthode de correction scientifique à tester' });
  await expect(method).toHaveValue('compare');
  await chooseEvaluationModel(page);
  await expect(panel.getByRole('tab', { name: /Qualité graphique/ })).toHaveAttribute('aria-selected', 'true');
  // The advanced personal-copy workflow remains intact but is intentionally collapsed.
  await panel.locator('details.diagram-lab-legacy > summary').click();
  await expect(panel.getByText('Image → génératif direct', { exact: false })).toBeVisible();
  await expect(method.locator('option[value="vision-then-analysis"]')).toHaveCount(0);

  await method.selectOption('direct-image-generative');
  await expect(method).toHaveValue('direct-image-generative');
  await expect(panel.getByText('Qwen 9B multimodal (Image → génératif direct)')).toBeVisible();

  await method.selectOption('direct-image-systemone');
  await expect(panel.getByRole('button', { name: 'Tester les 3 schémas en un clic' })).toBeDisabled();
  await expect(panel.getByText(/Le parcours System One image exige/).first()).toBeVisible();
  await method.selectOption('compare');
  await expect(panel.getByRole('button', { name: 'Tester les 3 schémas en un clic' })).toBeEnabled();
});

test('a personal diagram runs once without teacher references and exports a readable result', async ({ page }) => {
  const configuration = {
    endpoint: 'http://localhost:11434', apiCompatible: false, apiKey: '',
    visionModel: '', analysisModel: 'qwen3.5:4b', correctionMethod: 'generative',
    secondAnalysisModel: '', arbitratorModel: '', diagnosticStrategy: 'single',
    analysisThinking: false, criterionByCriterion: true,
  };
  await page.addInitScript((profile) => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([profile]));
    localStorage.removeItem('companion-correcteur:evaluation-selected-profiles:v1');
  }, { id: 'professor-diagram', name: 'Modèle professeur', mode: 'single',
    updatedAt: '2026-11-15T00:00:00Z', configuration });

  const chatPayloads: Record<string, any>[] = [];
  await page.route('http://localhost:11434/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/api/tags') return route.fulfill({ headers, json: { models: [{ name: 'qwen3.5:4b' }] } });
    if (path === '/api/ps') return route.fulfill({ headers, json: { models: [] } });
    if (path === '/api/show') return route.fulfill({ headers, json: { capabilities: ['completion', 'vision'] } });
    if (path === '/api/chat') {
      chatPayloads.push(route.request().postDataJSON());
      return route.fulfill({ headers, contentType: 'application/x-ndjson', body:
        JSON.stringify({ message: { content: JSON.stringify({ criteria: {
          cells: { evidence: 'Structures observables', confidence: 'high', questionForTeacher: '',
            subcriteria: {
              nucleus: { points: 1, evidence: 'Noyau identifié' },
              membrane: { points: 1, evidence: 'Membrane identifiée' },
            } },
        } }) } }) + '\n' +
        JSON.stringify({ done: true, done_reason: 'stop', eval_count: 128 }) + '\n',
      });
    }
    return route.fulfill({ headers, json: { done: true, message: { content: '{}' } } });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' })
    .getByRole('button', { name: 'Tests', exact: true }).click();
  await page.getByRole('group', { name: 'Parcours de test' })
    .getByRole('button', { name: /Schémas scientifiques/ }).click();
  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  await panel.locator('details.diagram-lab-legacy > summary').click();

  await expect(panel.getByRole('combobox', { name: 'Référence : Occupe toute la page' })).toBeHidden();
  await expect(panel.getByRole('combobox', { name: 'Passages du schéma personnel' })).toHaveValue('1');
  await expect(panel.getByRole('button', { name: 'Analyser mon schéma' })).toBeDisabled();
  await panel.getByRole('button', { name: 'Choisir un modèle à tester' }).click();
  const dialog = page.getByRole('dialog', { name: 'Gérer les configurations IA' });
  await dialog.getByRole('group', { name: 'Configurations à exécuter' })
    .getByRole('checkbox', { name: /Modèle professeur/ }).check();
  await dialog.getByRole('button', { name: 'Terminer' }).click();

  await panel.getByRole('combobox', { name: 'Méthode de correction scientifique à tester' })
    .selectOption('direct-image-generative');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZckAAAAASUVORK5CYII=', 'base64');
  await panel.locator('#diagram-protocol-photos').setInputFiles({
    name: 'schema-professeur.png', mimeType: 'image/png', buffer: png,
  });
  await expect(panel.getByText('1 page(s) prêtes')).toBeVisible();
  await panel.locator('#diagram-protocol-rubric').setInputFiles({
    name: 'bareme-professeur.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      rubricTitle: 'Barème professeur',
      criteria: [{ id: 'cells', title: 'Anatomie', maxPoints: 2, subcriteria: [
        { id: 'nucleus', title: 'Noyau', maxPoints: 1 },
        { id: 'membrane', title: 'Membrane', maxPoints: 1 },
      ] }],
    })),
  });
  await expect(panel.getByText('Barème professeur', { exact: false })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Analyser mon schéma' })).toBeEnabled();
  await panel.getByRole('button', { name: 'Analyser mon schéma' }).click();

  const result = panel.locator('#evaluation-diagram-personal-results');
  await expect(result).toContainText('1 essai(s) exécuté(s)');
  await expect(result).toContainText('Non mesurable');
  await expect(result).toContainText('Non mesuré (1 passage)');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    result.getByRole('button', { name: 'Exporter JSON' }).click(),
  ]);
  const report = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(report.experiments).toHaveLength(1);
  expect(report.experiments[0].status).toBe('success');
  expect(report.plannedRepetitions).toBe(1);
  expect(chatPayloads).toHaveLength(1);
  expect(chatPayloads[0].messages?.[0]?.images?.length).toBe(1);
});

test('the direct diagram laboratory shares one Responses image across the criteria of each copy', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([{
    id: 'gemma-responses', name: 'Gemma Responses', mode: 'single', updatedAt: '2026-11-24T00:00:00Z',
    configuration: { endpoint: 'http://localhost:1234/v1/responses', apiCompatible: true, apiKey: '',
      visionModel: 'gemma', analysisModel: 'gemma', correctionMethod: 'generative',
      secondAnalysisModel: '', arbitratorModel: '', diagnosticStrategy: 'single',
      analysisThinking: false, criterionByCriterion: true, smartZoom: false },
  }])));
  const requests: { previousId?: string; images: number; criterion: string }[] = [];
  const rubric = SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC;
  await page.route('http://localhost:1234/**', async route => {
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (route.request().url().endsWith('/v1/models')) return route.fulfill({ headers, json: { data: [{ id: 'gemma' }] } });
    const body = route.request().postDataJSON();
    const content = body.input[0].content;
    const prompt = content.find((item: { type: string }) => item.type === 'input_text').text;
    const criterion = rubric.criteria[requests.length % rubric.criteria.length];
    expect(prompt).toContain(criterion.id);
    requests.push({ previousId: body.previous_response_id,
      images: content.filter((item: { type: string }) => item.type === 'input_image').length, criterion: criterion.id });
    return route.fulfill({ headers, json: {
      id: 'resp_' + requests.length, output: [], output_text: JSON.stringify({ criteria: {
        [criterion.id]: { evidence: 'Observation visible', confidence: 'medium', questionForTeacher: '',
          subcriteria: Object.fromEntries(criterion.subcriteria!.map(item => [item.id, { points: 0, evidence: 'Élément absent' }])) },
      } }),
    } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' }).getByRole('button', { name: 'Tests', exact: true }).click();
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: /Schémas scientifiques/ }).click();
  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  await chooseEvaluationModel(page);
  await panel.getByRole('combobox', { name: 'Méthode de correction scientifique à tester' }).selectOption('direct-image-generative');
  await panel.getByRole('button', { name: 'Tester les 3 schémas en un clic' }).click();
  const results = panel.getByRole('region', { name: 'Résultats des schémas scientifiques' });
  // The three copies are processed sequentially, with one request per criterion.
  await expect(results.locator('tbody tr')).toHaveCount(3, { timeout: 20_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), results.getByRole('button', { name: 'Exporter le rapport JSON' }).click()]);
  const report = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(report.cases.flatMap((diagram: { experiments: unknown[] }) => diagram.experiments))
    .toEqual(Array.from({ length: 3 }, () => expect.objectContaining({ status: 'success', score: 0 })));
  expect(requests).toEqual(Array.from({ length: 3 }, (_, diagram) => rubric.criteria.map((criterion, index) => ({
    criterion: criterion.id, previousId: index ? 'resp_' + (diagram * rubric.criteria.length + index) : undefined,
    images: index ? 0 : 1,
  }))).flat());
});
