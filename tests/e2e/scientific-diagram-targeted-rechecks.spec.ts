import { chooseEvaluationModel } from './helpers/evaluation-models';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('arrow and contour recheck arms issue distinct calls and export the independent diagnostic evidence', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([{
      id: 'local-recheck', name: 'Qwen local recheck', mode: 'single',
      updatedAt: '2026-11-10T10:00:00Z',
      configuration: {
        endpoint: 'http://localhost:11434', apiCompatible: false, apiKey: '',
        visionModel: 'qwen3.5:4b', analysisModel: 'qwen3.5:4b',
        transcriptionTokenLimit: 2048, transcriptionPromptMode: 'auto',
        transcriptionRepeatPenalty: 1.05, transcriptionPenaltyParameter: 'none',
        transcriptionFrequencyPenalty: 0, analysisThinking: false,
        criterionByCriterion: true, correctionMethod: 'generative',
        secondAnalysisModel: '', arbitratorModel: '', diagnosticStrategy: 'single',
      },
    }]));
  });
  const requests: Array<{ messages: Array<{ content: string; images?: string[] }>; format: unknown }> = [];
  const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS', 'content-type': 'application/json' };
  await page.route('http://localhost:11434/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/api/tags') return route.fulfill({ status: 200, headers, body: JSON.stringify({
      models: [{ name: 'qwen3.5:4b', model: 'qwen3.5:4b' }],
    }) });
    if (path === '/api/show') return route.fulfill({ status: 200, headers, body: JSON.stringify({ model_info: {} }) });
    if (path === '/api/ps') return route.fulfill({ status: 200, headers, body: JSON.stringify({ models: [] }) });
    if (path === '/api/chat') {
      const body = request.postDataJSON() as (typeof requests)[number];
      requests.push(body);
      const system = body.messages[0]?.content ?? '';
      const content = system.includes('Vérification visuelle indépendante')
        ? JSON.stringify({ tip: 'second' })
        : system.includes('Examine uniquement la géométrie de tous les contours')
          ? JSON.stringify({ containment: [{ inner: 'Noyau', outer: 'Cellule', relation: 'outside' }] })
          : JSON.stringify({
            labels: ['Cellule', 'Noyau', 'ADN', 'ARN', 'Protéine'],
            arrows: [
              { first: 'ADN', second: 'ARN', tip: 'second' },
              { first: 'ARN', second: 'Protéine', tip: 'second' },
            ],
            containment: [], arrowsComplete: true,
          });
      return route.fulfill({ status: 200, headers, body: JSON.stringify({
        message: { content }, done: true, done_reason: 'stop', eval_count: 25,
      }) });
    }
    return route.fulfill({ status: 404, headers, body: '{}' });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('group', { name: 'Parcours de test' })
    .getByRole('button', { name: /Schémas scientifiques/ }).click();
  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  await panel.getByRole('tab', { name: /Graphe des relations/ }).click();
  const observer = panel.getByRole('region', { name: 'Extraction du graphe de relations' });
  await chooseEvaluationModel(page);
  const start = observer.getByRole('button', { name: 'Extraire les relations des 6 schémas' });
  const variant = observer.getByLabel('Consigne de lecture du graphe');

  for (const [selection, expectedCalls, kind] of [
    ['recheck-arrows', 18, 'arrows'], ['recheck-contours', 12, 'contours'],
  ] as const) {
    const previous = requests.length;
    await variant.selectOption(selection);
    await expect(observer.getByRole('button', { name: 'Tester avec agrandissement ciblé' })).toBeDisabled();
    await start.click();
    await expect.poll(() => requests.length, { timeout: 90_000 }).toBe(previous + expectedCalls);
    await expect(observer.getByRole('region', { name: 'Résultats du graphe visuel indépendant' })).toBeVisible();
    const current = requests.slice(previous);
    expect(current.filter((item) => item.messages[0]?.content.startsWith('Observe uniquement les pixels'))).toHaveLength(6);
    expect(current.filter((item) => item.messages[0]?.content.includes(
      kind === 'arrows' ? 'Vérification visuelle indépendante' : 'Examine uniquement la géométrie'))).toHaveLength(
      kind === 'arrows' ? 12 : 6,
    );
    for (const req of current) {
      expect(req.messages[1]?.images).toHaveLength(1);
      expect(req.messages.map((item) => item.content).join('\n')).not.toContain('ADN → ARN');
      expect(req.messages.map((item) => item.content).join('\n')).not.toContain('maxPoints');
    }
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      observer.getByRole('button', { name: 'Exporter l’analyse du graphe JSON' }).click(),
    ]);
    const report = JSON.parse(await readFile(await download.path(), 'utf8')) as {
      promptVariant: string; cases: Array<{ experiments: Array<{ diagnostic?: {
        recheck?: { kind: string; attempted: number; fullImageFallbacks: number; evidence: unknown[] };
      } }> }>;
    };
    expect(report.promptVariant).toBe(selection);
    expect(report.cases).toHaveLength(6);
    const sample = report.cases[0]?.experiments[0]?.diagnostic?.recheck;
    expect(sample?.kind).toBe(kind);
    expect(sample?.attempted).toBe(kind === 'arrows' ? 2 : 1);
    expect(sample?.evidence).toHaveLength(kind === 'arrows' ? 2 : 1);
    if (kind === 'arrows') expect(sample?.fullImageFallbacks).toBe(2);
    expect(JSON.stringify(report)).not.toContain('PRIVATE_IMAGE_PIXELS');
    expect(JSON.stringify(report)).not.toContain('http://localhost:11434');
  }
});

