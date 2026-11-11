import { chooseEvaluationModel } from './helpers/evaluation-models';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('optional blind-graph zoom crops actual local pixels, resolves only observed tips and exports safe diagnostics', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([{
      id: 'local-blind', name: 'Qwen Vision local', mode: 'single',
      updatedAt: '2026-11-09T12:00:00Z',
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
  type Payload = { model: string; messages: Array<{ content: string; images?: string[] }>; format: unknown; keep_alive: number };
  const captured: Payload[] = [];
  const headers = {
    'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS', 'content-type': 'application/json',
  };
  await page.route('http://localhost:11434/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/api/tags') return route.fulfill({ status: 200, headers,
      body: JSON.stringify({ models: [{ name: 'qwen3.5:4b', model: 'qwen3.5:4b' }] }) });
    if (path === '/api/show') return route.fulfill({ status: 200, headers, body: JSON.stringify({ model_info: {} }) });
    if (path === '/api/ps') return route.fulfill({ status: 200, headers, body: JSON.stringify({ models: [] }) });
    if (path === '/api/chat') {
      const payload = request.postDataJSON() as Payload;
      captured.push(payload);
      const zoom = payload.messages[0]?.content.includes('agrandie');
      const graph = {
        labels: ['ADN', 'ARN', 'Protéine', 'Noyau', 'Cellule'],
        arrows: [{ first: 'ADN', second: 'ARN', tip: 'none',
          bounds: { left: 290, top: 360, right: 650, bottom: 650 } }],
        containment: [{ inner: 'Noyau', outer: 'Cellule', relation: 'inside' }],
        arrowsComplete: true,
      };
      return route.fulfill({ status: 200, headers,
        body: JSON.stringify({ message: { content: JSON.stringify(zoom ? { tip: 'second' } : graph) },
          done_reason: 'stop', eval_count: 50 }) });
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
  const start = observer.getByRole('button', { name: 'Tester avec agrandissement ciblé' });
  await expect(start).toBeEnabled();
  await start.click();
  await expect.poll(() => captured.length, { timeout: 90_000 }).toBe(12);
  const full = captured.filter((p) => !p.messages[0]?.content.includes('agrandie'));
  const zoomed = captured.filter((p) => p.messages[0]?.content.includes('agrandie'));
  expect(full).toHaveLength(6);
  expect(zoomed).toHaveLength(6);
  expect(zoomed.every((p) => p.model === 'qwen3.5:4b' && p.keep_alive === 0)).toBe(true);
  expect(JSON.stringify(full[0]?.format)).toContain('bounds');
  for (const item of zoomed) {
    expect(item.messages[1]?.images).toHaveLength(1);
    expect(item.messages[1]?.content).toContain(JSON.stringify({ first: 'ADN', second: 'ARN' }));
    expect(item.messages[0]?.content).toContain('les deux extrémités et le trait complet');
    expect(item.messages[0]?.content).toContain('objet JSON avec la clé tip');
    expect(item.messages[1]?.content).not.toContain('ADN → ARN');
    expect(item.messages[0]?.content).not.toContain('barème de correction');
  }
  const originals = full[0]!.messages[1]!.images![0]!;
  const crop = zoomed[0]!.messages[1]!.images![0]!;
  expect(originals).not.toBe(crop);
  const sizes = await page.evaluate(async (images: string[]) => {
    return Promise.all(images.map(async (base64) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + base64;
      await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    }));
  }, [originals, crop]);
  expect(sizes[0]).toEqual([1100, 610]);
  expect(sizes[1]).not.toEqual(sizes[0]);
  const results = observer.getByRole('region', { name: 'Résultats du graphe visuel indépendant' });
  await expect(results).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    observer.getByRole('button', { name: 'Exporter l’analyse du graphe JSON' }).click(),
  ]);
  const json = JSON.parse(await readFile(await download.path(), 'utf8')) as {
    cases: Array<{ experiments: Array<{ zoom?: boolean; observations: Record<string, string>;
      diagnostic?: { zoom?: { attempted: number; resolved: number } } }> }>;
    statistics: Array<{ method: string }>;
  };
  expect(json.cases).toHaveLength(6);
  expect(json.cases[0]?.experiments[0]?.zoom).toBe(true);
  expect(json.cases[0]?.experiments[0]?.observations['relations::transcription']).toBe('present');
  expect(json.cases[0]?.experiments[0]?.diagnostic?.zoom).toMatchObject({ attempted: 1, resolved: 1 });
  expect(json.statistics[0]?.method).toBe('blind-graph-zoom');
  expect(JSON.stringify(json)).not.toContain('data:image');
  expect(JSON.stringify(json)).not.toContain('http://localhost:11434');
  expect(JSON.stringify(json)).not.toContain(crop);
});
