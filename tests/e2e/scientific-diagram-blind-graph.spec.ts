import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('blind diagram observer only sends PNGs and generic instructions to local Ollama, then exports a safe graph comparison', async ({ page }) => {
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
  const requests: Array<{ model: string; messages: Array<{ role: string; content: string; images?: string[] }> }> = [];
  const headers = {
    'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS', 'content-type': 'application/json',
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
        body: JSON.stringify({ models: [{ name: 'qwen3.5:4b', model: 'qwen3.5:4b' }] }) });
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
    if (url.pathname === '/api/chat') {
      const payload = request.postDataJSON() as { model: string; messages: Array<{ role: string; content: string; images?: string[] }> };
      requests.push(payload);
      const graph = {
        labels: ['ADN', 'ARN', 'Protéine', 'Noyau', 'Cellule'],
        arrows: [
          { first: 'ADN', second: 'ARN', tip: 'second' },
          { first: 'ARN', second: 'Protéine', tip: 'second' },
        ],
        containment: [{ inner: 'Noyau', outer: 'Cellule', relation: 'inside' }],
        arrowsComplete: true,
      };
      await route.fulfill({ status: 200, headers,
        body: JSON.stringify({ message: { content: JSON.stringify(graph) }, done: true }) });
      return;
    }
    await route.fulfill({ status: 404, headers, body: '{}' });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  await page.getByRole('group', { name: 'Parcours de test' })
    .getByRole('button', { name: /Schémas scientifiques/ }).click();
  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  const observer = panel.locator('details.diagram-sensitivity-section')
    .filter({ has: page.getByText('Observer un graphe de relations avant le barème (Ollama local)') });
  await observer.locator('summary').click();
  const start = observer.getByRole('button', { name: 'Extraire les relations des 6 schémas' });
  await expect(start).toBeDisabled();
  await page.getByRole('group', { name: 'Configurations à exécuter' })
    .locator('label.evaluation-profile-option').first().click();
  await expect(start).toBeEnabled();
  await start.click();
  await expect.poll(() => requests.length, { timeout: 90_000 }).toBe(6);
  for (const item of requests) {
    expect(item.model).toBe('qwen3.5:4b');
    expect(item.messages.find((entry) => entry.role === 'user')?.images).toHaveLength(1);
    const plainPrompts = item.messages.map((entry) => entry.content).join('\n');
    expect(plainPrompts).not.toContain('ADN → ARN');
    expect(plainPrompts).not.toContain('Protéine');
    expect(plainPrompts).not.toContain('legends-visible');
    expect(plainPrompts).not.toContain('maxPoints');
    expect(plainPrompts).toMatch(/aucun/i);
  }
  const results = observer.getByRole('region', { name: 'Résultats du graphe visuel indépendant' });
  await expect(results).toBeVisible({ timeout: 30_000 });
  await expect(results.locator('tbody tr')).toHaveCount(1);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    observer.getByRole('button', { name: 'Exporter l’analyse du graphe JSON' }).click(),
  ]);
  const json = JSON.parse(await readFile(await download.path(), 'utf8')) as {
    format: string; localOnly: boolean; statistics: unknown[];
    cases: Array<{ experiments: Array<{ observations: Record<string, string> }> }>;
  };
  expect(json.format).toBe('companion-scientific-diagram-blind-graph-report');
  expect(json.localOnly).toBe(true);
  expect(json.cases).toHaveLength(6);
  expect(json.cases.map((item) => item.experiments.length)).toEqual([1, 1, 1, 1, 1, 1]);
  expect(json.statistics).toHaveLength(1);
  expect(json.cases[0]?.experiments[0]?.observations['relations::transcription']).toBe('present');
  expect(JSON.stringify(json)).not.toContain('http://localhost:11434');
  expect(JSON.stringify(json)).not.toContain('data:image');
  expect(JSON.stringify(json)).not.toContain('PRIVATE_PIXEL_BYTES');

  await page.getByRole('navigation', { name: 'Navigation des outils IA' })
    .getByRole('button', { name: /Inspecteur réseau/ }).click();
  await expect(page.getByRole('region', { name: 'Rapports des schémas scientifiques' })
    .getByRole('button', { name: /Exporter l’observation indépendante/ })).toBeVisible();
});
