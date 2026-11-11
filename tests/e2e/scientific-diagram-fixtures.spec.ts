import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('three bundled mitosis diagrams are visible and one click evaluates A/B/C without supplying expected scores to the model', async ({ page }) => {
  const configuration = {
    endpoint: 'http://localhost:11434', apiCompatible: false, apiKey: '',
    visionModel: '', analysisModel: 'd1:3b',
    transcriptionTokenLimit: 2048, transcriptionPromptMode: 'auto',
    transcriptionRepeatPenalty: 1.05, transcriptionPenaltyParameter: 'none',
    transcriptionFrequencyPenalty: 0, analysisThinking: false,
    criterionByCriterion: true, correctionMethod: 'decision',
    secondAnalysisModel: '', arbitratorModel: '', diagnosticStrategy: 'single',
  };
  await page.addInitScript((profiles) => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify(profiles));
  }, [{ id: 'd1-demo', name: 'D1 test image', mode: 'single', updatedAt: '2026-11-07T20:00:00Z', configuration }]);
  const systemOneRequests: Array<{ state: string; imageCount: number; questions: string[] }> = [];
  // Hold the second model response to exercise export after only A has completed.
  let releaseSecondRequest: () => void = () => undefined;
  const secondResponseGate = new Promise<void>((resolve) => { releaseSecondRequest = resolve; });
  await page.route('http://localhost:11434/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      'content-type': 'application/json',
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (url.pathname === '/api/tags') {
      await route.fulfill({ status: 200, headers, body: JSON.stringify({ models: [{ name: 'd1:3b', model: 'd1:3b' }] }) });
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
      const body = request.postDataJSON() as { state: string; images: string[]; questions: Record<string, unknown> };
      systemOneRequests.push({
        state: body.state, imageCount: body.images?.length ?? 0, questions: Object.keys(body.questions ?? {}),
      });
      if (systemOneRequests.length === 2) await secondResponseGate;
      const answers = Object.fromEntries(Object.keys(body.questions).map((key) => [
        key, key === 'alignment'
          ? { type: 'choice', choice: 'aligned', confidence: 0.99, probabilities: { aligned: 1 } }
          : { type: 'choice', choice: 'absent', confidence: 0.99, probabilities: { absent: 1 } },
      ]));
      await route.fulfill({ status: 200, headers, body: JSON.stringify({ answers, usage: { input_tokens: 20, output_tokens: 0 } }) });
      return;
    }
    await route.fulfill({ status: 404, headers, body: '{}' });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: /Schémas scientifiques/ }).click();
  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  const fixtures = panel.getByRole('region', { name: 'Schémas de référence intégrés' });
  await expect(fixtures.locator('.diagram-fixture-card')).toHaveCount(3);
  await expect(fixtures.getByText('10/10 attendu', { exact: true }).first()).toBeVisible();
  await expect(fixtures.getByText('7.36/10 attendu', { exact: true })).toBeVisible();
  await fixtures.getByText('Voir le détail de la référence provisoire', { exact: true }).click();
  await expect(fixtures.getByText(/Des prolongements de paroi sont visibles/)).toBeVisible();
  await expect(fixtures.getByText('0/10 attendu', { exact: true })).toBeVisible();
  await expect(fixtures.getByRole('combobox', { name: 'Passages par schéma' })).toHaveValue('1');
  await expect.poll(async () => fixtures.locator('img').evaluateAll((images) =>
    images.filter((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0).length),
  ).toBe(3);
  await expect(fixtures.getByRole('button', { name: 'Tester les 3 schémas en un clic' })).toBeDisabled();

  await page.getByRole('button', { name: 'Gérer les configurations' }).click();
  const modelDialog = page.getByRole('dialog', { name: 'Gérer les configurations IA' });
  await modelDialog.getByRole('checkbox').first().check();
  await modelDialog.getByRole('button', { name: 'Terminer' }).click();
  await fixtures.getByRole('button', { name: 'Tester les 3 schémas en un clic' }).click();

  const activity = page.getByRole('status', { name: 'Dernière expérience lancée' });
  await expect(activity).toContainText('Schémas scientifiques · qualité graphique A/B/C');
  await expect(activity).toContainText('TEST EN COURS');
  await expect(activity.getByRole('button', { name: 'Arrêter après l’appel en cours' })).toBeVisible();
  await expect(page.locator('.diagram-lab-live')).toHaveCount(0);
  await expect(activity.getByRole('button', { name: 'Suivre ce test' })).toBeVisible();
  const testViews = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await testViews.getByRole('button', { name: 'Carnet de résultats' }).click();
  await expect(activity).toBeVisible();
  await activity.getByRole('button', { name: 'Suivre ce test' }).click();
  await expect(fixtures).toBeVisible();

  await expect.poll(() => systemOneRequests.length).toBe(2);
  const exportStrip = page.getByRole('region', { name: 'Rapports des schémas scientifiques' });
  await exportStrip.locator('summary').click();
  await expect(exportStrip.getByRole('button', { name: /Exporter les schémas testés \(1 passage\)/ })).toBeVisible();

  // The user inspects live requests while the benchmark is still running.
  const navigation = page.getByRole('navigation', { name: 'Navigation principale' });
  await navigation.getByRole('button', { name: 'Suivi & diagnostic' }).click();
  await page.getByRole('navigation', { name: 'Détails du suivi' }).getByRole('button', { name: 'Inspecteur réseau' }).click();
  await expect(exportStrip.getByRole('button', { name: /Exporter les schémas testés \(1 passage\)/ })).toBeVisible();
  const [partialDownload] = await Promise.all([
    page.waitForEvent('download'),
    exportStrip.getByRole('button', { name: /Exporter les schémas testés \(1 passage\)/ }).click(),
  ]);
  const partial = JSON.parse(await readFile(await partialDownload.path(), 'utf8')) as {
    cases: { experiments: unknown[] }[]; format: string;
  };
  expect(partial.format).toBe('companion-scientific-diagram-fixture-report');
  expect(partial.cases.flatMap((entry) => entry.experiments)).toHaveLength(1);
  await navigation.getByRole('button', { name: 'Évaluer les modèles' }).click();
  releaseSecondRequest();

  const results = fixtures.getByRole('region', { name: 'Résultats des schémas scientifiques' });
  await expect(results).toBeVisible({ timeout: 30_000 });
  await expect(results.locator('tbody tr')).toHaveCount(3);
  await expect(activity).toContainText('TEST TERMINÉ');
  await activity.getByRole('button', { name: 'Voir les résultats' }).click();
  await expect(results).toBeVisible();
  // All 19 native image decisions remain measurable even if a resulting
  // provisional grade needs teacher review.
  await expect(results.getByText('19/19', { exact: true })).toHaveCount(3);
  await expect(results.getByText('10/10', { exact: true }).first()).toBeVisible();
  await expect(results.getByText('7.36/10', { exact: true }).first()).toBeVisible();
  await expect(results.getByText('0/10', { exact: true }).first()).toBeVisible();
  expect(systemOneRequests).toHaveLength(3);
  // A complete report is still downloadable after the panel was unmounted.
  const [completeDownload] = await Promise.all([
    page.waitForEvent('download'),
    results.getByRole('button', { name: 'Exporter le rapport JSON' }).click(),
  ]);
  expect(completeDownload.suggestedFilename()).toBe('companion-schemas-scientifiques.json');
  const complete = JSON.parse(await readFile(await completeDownload.path(), 'utf8')) as {
    cases: { experiments: unknown[]; summaries: { decisions: {
      stable: boolean; stableAndResolved: boolean | null; correctEveryTime: boolean | null;
    }[] }[] }[];
  };
  expect(complete.cases.flatMap((entry) => entry.experiments)).toHaveLength(3);
  // One run must not be presented as proof that a model is "always correct".
  expect(complete.cases.flatMap((entry) => entry.summaries)
    .flatMap((summary) => summary.decisions)
    .every((decision) => !decision.stable
      && decision.stableAndResolved === null && decision.correctEveryTime === null)).toBe(true);
  await page.getByRole('button', { name: /Carnet de résultats/ }).click();
  const journal = page.getByRole('region', { name: 'Carnet des résultats scientifiques' });
  await expect(journal.getByRole('group', { name: 'Campagnes enregistrées' })
    .getByRole('button', { name: /Qualité graphique · A\/B\/C/ }).first()).toBeVisible();
  await expect(journal.getByText('D1 test image').first()).toBeVisible();
  await expect(exportStrip).toBeVisible();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' }).getByRole('button', { name: 'Tests', exact: true }).click();
  await expect(results.locator('tbody tr')).toHaveCount(3);
  for (const req of systemOneRequests) {
    expect(req.imageCount).toBe(1);
    expect(req.questions.length).toBeGreaterThanOrEqual(19);
    expect(req.state).not.toContain('10/10');
    expect(req.state).not.toContain('7.36/10');
    expect(req.state).not.toContain('0/10');
  }

  // The intermediate picture can also be tested independently with the same one-click flow.
  await fixtures.getByRole('button', { name: 'Tester ce schéma' }).nth(1).click();
  await expect(results.locator('tbody tr')).toHaveCount(1);
  expect(systemOneRequests).toHaveLength(4);

  // The new journal must restore the automatic protocol reports after a reload.
  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('group', { name: 'Parcours de test' })
    .getByRole('button', { name: /Schémas scientifiques/ }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' })
    .getByRole('button', { name: /Carnet de résultats/ }).click();
  const reopened = page.getByRole('region', { name: 'Carnet des résultats scientifiques' });
  await expect(reopened.getByRole('group', { name: 'Campagnes enregistrées' }).getByRole('button')).toHaveCount(2);
  await expect(reopened.getByText('D1 test image').first()).toBeVisible();
  await expect(reopened.getByRole('heading', { name: 'Décisions par dessin' })).toBeVisible();
});

test('paired D/E diagrams test the pointed structure, not just the written label', async ({ page }) => {
  const configuration = {
    endpoint: 'http://localhost:11434', apiCompatible: false, apiKey: '',
    visionModel: '', analysisModel: 'd1:3b',
    transcriptionTokenLimit: 2048, transcriptionPromptMode: 'auto',
    transcriptionRepeatPenalty: 1.05, transcriptionPenaltyParameter: 'none',
    transcriptionFrequencyPenalty: 0, analysisThinking: false,
    criterionByCriterion: true, correctionMethod: 'decision',
    secondAnalysisModel: '', arbitratorModel: '', diagnosticStrategy: 'single',
  };
  await page.addInitScript((profiles) => localStorage.setItem(
    'companion-correcteur:ollama-profiles:v1', JSON.stringify(profiles),
  ), [{ id: 'd1-pointer', name: 'D1 test flèches', mode: 'single',
    updatedAt: '2026-11-08T22:00:00Z', configuration }]);

  const requests: Array<{ image: string; state: string; questions: string[] }> = [];
  await page.route('http://localhost:11434/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS', 'content-type': 'application/json' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/api/tags') return route.fulfill({ status: 200, headers,
      body: JSON.stringify({ models: [{ name: 'd1:3b', model: 'd1:3b' }] }) });
    if (path === '/api/show') return route.fulfill({ status: 200, headers,
      body: JSON.stringify({ model_info: {} }) });
    if (path === '/api/ps') return route.fulfill({ status: 200, headers,
      body: JSON.stringify({ models: [] }) });
    if (path === '/v1/systemone') {
      const body = route.request().postDataJSON() as {
        images: string[]; state: string; questions: Record<string, unknown>;
      };
      requests.push({ image: body.images[0] ?? '', state: body.state, questions: Object.keys(body.questions ?? {}) });
      const answers = Object.fromEntries(Object.keys(body.questions).map((key) => [
        key, key === 'alignment'
          ? { type: 'choice', choice: 'aligned', confidence: 0.95, probabilities: { aligned: 1 } }
          : { type: 'choice', choice: 'present', confidence: 0.95, probabilities: { present: 1 } },
      ]));
      return route.fulfill({ status: 200, headers,
        body: JSON.stringify({ answers, usage: { input_tokens: 20, output_tokens: 0 } }) });
    }
    return route.fulfill({ status: 404, headers, body: '{}' });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: /Schémas scientifiques/ }).click();
  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  await panel.getByRole('tab', { name: /Sens des flèches/ }).click();
  const fixtures = panel.getByRole('region', { name: 'Schémas de référence intégrés' });
  const cards = fixtures.locator('.diagram-fixture-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).getByText('D — témoin, flèches justes')).toBeVisible();
  await expect(cards.nth(1).getByText('E — piège, flèches inversées')).toBeVisible();
  await expect(cards.nth(0).getByText('9.34/10 attendu')).toBeVisible();
  await expect(cards.nth(1).getByText('8.66/10 attendu')).toBeVisible();
  await expect(cards.nth(0).getByText(/Alignement en colonne : 0\/0\.66 pt/)).toBeVisible();
  await expect(cards.nth(1).getByText(/Alignement en colonne : 0\/0\.66 pt/)).toBeVisible();
  await page.getByRole('button', { name: 'Gérer les configurations' }).click();
  const modelDialog = page.getByRole('dialog', { name: 'Gérer les configurations IA' });
  await modelDialog.getByRole('checkbox').first().check();
  await modelDialog.getByRole('button', { name: 'Terminer' }).click();
  await fixtures.getByRole('button', { name: 'Tester les flèches D/E en un clic' }).click();
  const results = fixtures.getByRole('region', { name: 'Résultats des schémas scientifiques' });
  await expect(results.locator('tbody tr')).toHaveCount(2, { timeout: 30_000 });
  await expect(results.getByText('1/1 détection(s)', { exact: true })).toBeVisible();
  await expect(results.getByText('0/1 détection(s)', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  for (const req of requests) {
    // SVG is rasterized into a real PNG before invoking the model; no vector
    // metadata, reference score or trap disclosure reaches model state.
    expect(req.image).toMatch(/^iVBORw0KGgo/);
    expect(req.questions.length).toBeGreaterThanOrEqual(19);
    expect(req.state).not.toMatch(/9[.,]32|flèches inversées|piège/i);
  }
  expect(requests[0]!.image).not.toBe(requests[1]!.image);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    results.getByRole('button', { name: 'Exporter le rapport JSON' }).click(),
  ]);
  const exported = JSON.parse(await readFile(await download.path(), 'utf8')) as {
    cases: Array<{ caseId: string; referenceScore: number; layoutObservation?: {
      criterionKey: string; points: number; maximumPoints: number;
    }; labelPointerChallenge?: { expected: string }; experiments: unknown[] }>;
  };
  expect(exported.cases.filter((entry) => entry.experiments.length).map((entry) => entry.caseId)).toEqual(['D', 'E']);
  expect(exported.cases.find((entry) => entry.caseId === 'D')?.labelPointerChallenge?.expected).toBe('correct');
  expect(exported.cases.find((entry) => entry.caseId === 'E')?.labelPointerChallenge?.expected).toBe('incorrect');
  expect(exported.cases.filter((entry) => entry.caseId === 'D' || entry.caseId === 'E')
    .map((entry) => entry.referenceScore)).toEqual([9.34, 8.66]);
  for (const fixture of exported.cases.filter((entry) => entry.caseId === 'D' || entry.caseId === 'E')) {
    expect(fixture.layoutObservation).toMatchObject({
      criterionKey: 'legends::legends-aligned', points: 0, maximumPoints: 0.66,
    });
  }
  expect(JSON.stringify(exported)).not.toContain('iVBORw0KGgo');
});


const thinkingModelCases = [
  { model: 'qwen3.5:4b', values: [false, true], default: false, wire: true },
  { model: 'qwen3.5:9b', values: [false, true], default: false, wire: true },
  { model: 'custom-vision-thinker:latest', values: [false, 'low', 'medium', 'high'], default: 'medium', wire: 'medium' },
] as const;

for (const scenario of thinkingModelCases) {
test(scenario.model + ' compares Think OFF/ON on E with runtime Ollama capabilities', async ({ page }) => {
  const configuration = {
    endpoint: 'http://localhost:11434', apiCompatible: false, apiKey: '',
    visionModel: '', analysisModel: scenario.model,
    transcriptionTokenLimit: 2048, transcriptionPromptMode: 'auto',
    transcriptionRepeatPenalty: 1.05, transcriptionPenaltyParameter: 'none',
    transcriptionFrequencyPenalty: 0,
    analysisThinking: true, // Saved ON must not contaminate the OFF control.
    correctionMethod: 'generative', criterionByCriterion: false,
    secondAnalysisModel: '', arbitratorModel: '', diagnosticStrategy: 'single',
  };
  await page.addInitScript((profiles) => localStorage.setItem(
    'companion-correcteur:ollama-profiles:v1', JSON.stringify(profiles),
  ), [{ id: 'vision-thinking', name: 'Modèle Vision Think', mode: 'single',
    updatedAt: '2026-11-09T10:00:00Z', configuration }]);

  const requests: Array<{ think: boolean | string; numPredict: number; image: string; model: string }> = [];
  await page.route('http://localhost:11434/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS', 'content-type': 'application/x-ndjson' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/api/tags') return route.fulfill({ status: 200, headers, body: JSON.stringify({
      models: [{ name: scenario.model, model: scenario.model }],
    }) });
    if (path === '/api/show') return route.fulfill({ status: 200, headers, body: JSON.stringify({
      model_info: {}, capabilities: ['completion', 'vision'],
      thinking: { values: scenario.values, default: scenario.default },
    }) });
    if (path === '/api/ps') return route.fulfill({ status: 200, headers, body: JSON.stringify({ models: [] }) });
    if (path === '/api/generate') return route.fulfill({ status: 200, headers, body: '{}' });
    if (path === '/api/chat') {
      const body = req.postDataJSON() as {
        model: string; think: boolean | string; options: { num_predict: number };
        messages: Array<{ images?: string[]; content?: string }>;
        format: { properties: { criteria: { properties: Record<string, {
          properties: { subcriteria?: { properties: Record<string, { properties: { points: { maximum: number } } }> } };
        }> } } };
      };
      requests.push({
        model: body.model, think: body.think, numPredict: body.options.num_predict,
        image: body.messages[0]?.images?.[0] ?? '',
      });
      expect(body.messages[0]?.content).not.toMatch(/piège|référence 8[.,]66|flèches inversées/i);
      const criteria = Object.fromEntries(Object.entries(body.format.properties.criteria.properties).map(([id, criterion]) => [
        id, {
          evidence: 'Structure examinée', confidence: 'high', questionForTeacher: '',
          subcriteria: Object.fromEntries(Object.entries(criterion.properties.subcriteria?.properties ?? {}).map(([sid, sub]) => [
            sid, { points: sid === 'legends-aligned' || (sid === 'legends-visible' && body.think)
              ? 0 : sub.properties.points.maximum, evidence: 'Visuellement contrôlé' },
          ])),
        },
      ]));
      const events = [
        ...(body.think ? [{ message: { thinking: 'PRIVATE_REASONING_NOT_EXPORTED' } }] : []),
        { message: { content: JSON.stringify({ criteria }) } },
        { done: true, done_reason: 'stop', prompt_eval_count: 60,
          eval_count: body.think ? 850 : 200, eval_duration: 1200000000 },
      ];
      return route.fulfill({ status: 200, headers,
        body: events.map((event) => JSON.stringify(event)).join('\n') + '\n' });
    }
    return route.fulfill({ status: 404, headers, body: '{}' });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: /Schémas scientifiques/ }).click();
  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  await page.getByRole('button', { name: 'Gérer les configurations' }).click();
  const modelDialog = page.getByRole('dialog', { name: 'Gérer les configurations IA' });
  await modelDialog.getByRole('checkbox').first().check();
  await modelDialog.getByRole('button', { name: 'Terminer' }).click();
  await panel.getByRole('combobox', { name: 'Méthode de correction scientifique à tester' })
    .selectOption('compare-thinking');
  await panel.getByRole('tab', { name: /Sens des flèches/ }).click();
  const fixtures = panel.getByRole('region', { name: 'Schémas de référence intégrés' });
  await fixtures.locator('.diagram-fixture-card').nth(1)
    .getByRole('button', { name: 'Tester ce schéma' }).click();

  const results = fixtures.getByRole('region', { name: 'Résultats des schémas scientifiques' });
  await expect(results.locator('tbody tr')).toHaveCount(2, { timeout: 30_000 });
  expect(requests).toHaveLength(2);
  expect(requests.map((req) => [req.think, req.numPredict])).toEqual([[false, 2048], [scenario.wire, 4096]]);
  expect(requests.every((req) => req.model === scenario.model)).toBe(true);
  expect(requests[0]?.image).toMatch(/^iVBORw0KGgo/);
  expect(requests[0]?.image).toBe(requests[1]?.image);
  await expect(results.getByText(/OFF \/ non détectée/)).toBeVisible();
  await expect(results.getByText(scenario.wire === true ? /ON \/ émise/ : /ON \(medium\) \/ émise/)).toBeVisible();
  await expect(results.getByText('0/1 détection(s)', { exact: true })).toBeVisible();
  await expect(results.getByText('1/1 détection(s)', { exact: true })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    results.getByRole('button', { name: 'Exporter le rapport JSON' }).click(),
  ]);
  const report = JSON.parse(await readFile(await download.path(), 'utf8')) as {
    cases: Array<{ caseId: string; experiments: Array<{
      method: string; thinkingRequested: boolean; thinkingObserved: boolean; thinkingSetting: boolean | string;
      diagnostics: { generationBudgetTokens: number; generatedTokens: number };
    }> }>;
  };
  const experiments = report.cases.find((item) => item.caseId === 'E')?.experiments ?? [];
  expect(experiments.map((item) => [
    item.method, item.thinkingRequested, item.thinkingObserved, item.thinkingSetting,
    item.diagnostics.generationBudgetTokens, item.diagnostics.generatedTokens,
  ])).toEqual([
    ['direct-image-generative', false, false, false, 2048, 200],
    ['direct-image-generative-thinking', true, true, scenario.wire, 4096, 850],
  ]);
  expect(JSON.stringify(report)).not.toMatch(/PRIVATE_REASONING_NOT_EXPORTED|iVBORw0KGgo|api\/chat|127\.0\.0\.1/);
});
}
