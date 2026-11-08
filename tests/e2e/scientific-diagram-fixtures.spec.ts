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
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  const fixtures = panel.getByRole('region', { name: 'Schémas de référence intégrés' });
  await expect(fixtures.locator('.diagram-fixture-card')).toHaveCount(5);
  await expect(fixtures.getByText('10/10 attendu', { exact: true }).first()).toBeVisible();
  await expect(fixtures.getByText('7.36/10 attendu', { exact: true })).toBeVisible();
  await fixtures.getByText('Voir le détail de la référence provisoire', { exact: true }).click();
  await expect(fixtures.getByText(/Des prolongements de paroi sont visibles/)).toBeVisible();
  await expect(fixtures.getByText('0/10 attendu', { exact: true })).toBeVisible();
  await expect(fixtures.getByText('9.32/10 attendu', { exact: true })).toBeVisible();
  await expect(fixtures.getByRole('combobox', { name: 'Passages par schéma' })).toHaveValue('1');
  await expect.poll(async () => fixtures.locator('img').evaluateAll((images) =>
    images.filter((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0).length),
  ).toBe(5);
  await expect(fixtures.getByRole('button', { name: 'Tester les 3 schémas en un clic' })).toBeDisabled();

  await page.getByRole('group', { name: 'Configurations à exécuter' })
    .locator('label.evaluation-profile-option').first().click();
  await fixtures.getByRole('button', { name: 'Tester les 3 schémas en un clic' }).click();

  await expect.poll(() => systemOneRequests.length).toBe(2);
  const exportStrip = page.getByRole('region', { name: 'Rapports des schémas scientifiques' });
  await expect(exportStrip.getByRole('button', { name: /Exporter les schémas testés \(1 passage\)/ })).toBeVisible();

  // The user inspects live requests while the benchmark is still running.
  const navigation = page.getByRole('navigation', { name: 'Navigation des outils IA' });
  await navigation.getByRole('button', { name: /Inspecteur réseau/ }).click();
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
  await navigation.getByRole('button', { name: /Évaluation des modèles/ }).click();
  releaseSecondRequest();

  const results = fixtures.getByRole('region', { name: 'Résultats des schémas scientifiques' });
  await expect(results).toBeVisible({ timeout: 30_000 });
  await expect(results.locator('tbody tr')).toHaveCount(3);
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
  await page.getByRole('button', { name: /3.*Résultats/ }).click();
  await expect(exportStrip).toBeVisible();
  await page.getByRole('button', { name: /1.*Configuration/ }).click();
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
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  const fixtures = panel.getByRole('region', { name: 'Schémas de référence intégrés' });
  const cards = fixtures.locator('.diagram-fixture-card');
  await expect(cards).toHaveCount(5);
  await expect(cards.nth(3).getByText('D — témoin, flèches justes')).toBeVisible();
  await expect(cards.nth(4).getByText('E — piège, flèches inversées')).toBeVisible();
  await page.getByRole('group', { name: 'Configurations à exécuter' })
    .locator('label.evaluation-profile-option').first().click();
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
    cases: Array<{ caseId: string; labelPointerChallenge?: { expected: string }; experiments: unknown[] }>;
  };
  expect(exported.cases.filter((entry) => entry.experiments.length).map((entry) => entry.caseId)).toEqual(['D', 'E']);
  expect(exported.cases.find((entry) => entry.caseId === 'D')?.labelPointerChallenge?.expected).toBe('correct');
  expect(exported.cases.find((entry) => entry.caseId === 'E')?.labelPointerChallenge?.expected).toBe('incorrect');
  expect(JSON.stringify(exported)).not.toContain('iVBORw0KGgo');
});
