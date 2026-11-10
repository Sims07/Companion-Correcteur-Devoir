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
        body: JSON.stringify({ message: { content: [2, 3].includes(requests.length) ? '{' : JSON.stringify(graph) }, done: true,
          done_reason: [2, 3].includes(requests.length) ? 'length' : 'stop', eval_count: 768 }) });
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
  await panel.getByRole('tab', { name: /Graphe des relations/ }).click();
  const observer = panel.getByRole('region', { name: 'Extraction du graphe de relations' });
  const start = observer.getByRole('button', { name: 'Extraire les relations des 6 schémas' });
  await expect(start).toBeDisabled();
  await expect(observer.getByRole('status')).toContainText('Sélectionnez au moins une configuration');
  await page.getByRole('group', { name: 'Configurations à exécuter' })
    .locator('label.evaluation-profile-option').first().click();
  await expect(start).toBeEnabled();
  await observer.getByLabel('Consigne de lecture du graphe').selectOption('isolated-arrows-outside');
  await start.click();
  await expect.poll(() => requests.length, { timeout: 90_000 }).toBe(7);
  for (const item of requests) {
    const typed = item as typeof item & { format?: { properties?: { arrows?: { items?: { required?: string[] } }; containment?: { items?: { required?: string[] } } } } };
    expect(typed.format?.properties?.arrows?.items?.required).toContain('tip');
    expect(typed.format?.properties?.containment?.items?.required).toContain('relation');
    expect(item.model).toBe('qwen3.5:4b');
    expect(item.messages.find((entry) => entry.role === 'user')?.images).toHaveLength(1);
    const plainPrompts = item.messages.map((entry) => entry.content).join('\n');
    expect(plainPrompts).toContain('EXAMEN INDÉPENDANT');
    expect(plainPrompts).toContain('INVENTAIRE SPATIAL');
    expect(plainPrompts).not.toContain('ADN → ARN');
    expect(plainPrompts).not.toContain('Protéine');
    expect(plainPrompts).not.toContain('legends-visible');
    expect(plainPrompts).not.toContain('maxPoints');
    expect(plainPrompts).toMatch(/aucun/i);
  }
  // Decode the exact base64 attached to the Ollama requests, not a rendered preview.
  const actualPngs = [requests[0], requests[6]].map((item) => item?.messages.find((message) => message.role === 'user')?.images?.[0]);
  expect(actualPngs.every(Boolean)).toBe(true);
  const pixels = await page.evaluate(async (encoded) => {
    const decode = async (base64: string) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + base64;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(538, 293, 48, 35);
      let darkBeyondStroke = 0;
      for (let y = 0; y < 35; y++) for (let x = 0; x < 48; x++) {
        const n = (y * 48 + x) * 4;
        if (Math.abs(y + 293 - 310) > 5 && data[n]! < 130 && data[n + 1]! < 130 && data[n + 2]! < 130) darkBeyondStroke++;
      }
      return { width: img.naturalWidth, height: img.naturalHeight, darkBeyondStroke };
    };
    return Promise.all(encoded.map(decode));
  }, actualPngs as string[]);
  expect(pixels.map((item) => [item.width, item.height])).toEqual([[1100, 610], [1100, 610]]);
  expect(pixels[0]!.darkBeyondStroke).toBeGreaterThan(pixels[1]!.darkBeyondStroke);
  const results = observer.getByRole('region', { name: 'Résultats du graphe visuel indépendant' });
  await expect(results).toBeVisible({ timeout: 30_000 });
  await expect(results.locator('table').first().locator('tbody tr')).toHaveCount(1);
  await results.getByText('Décisions observées par schéma', { exact: true }).click();
  const successful = results.locator('details').filter({ has: page.locator('summary', { hasText: 'Sortie valide' }) }).last();
  await successful.locator('summary').first().click();
  await successful.getByText('Graphe extrait', { exact: true }).click();
  await expect(successful.locator('pre').first()).toContainText('arrowsComplete');
  await results.getByText('Qwen Vision local · passage 1 · Échec', { exact: false }).click();
  await expect(results.getByText('Sortie rejetée : JSON visuel illisible.', { exact: true })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    observer.getByRole('button', { name: 'Exporter l’analyse du graphe JSON' }).click(),
  ]);
  const json = JSON.parse(await readFile(await download.path(), 'utf8')) as {
    format: string; version: number; localOnly: boolean; statistics: unknown[];
    cases: Array<{ experiments: Array<{ observations: Record<string, string>; graph?: unknown; diagnostic?: { rawResponse: string; validationError?: string; doneReason?: string; imageAudit?: { width: number; height: number; pngSignatureValid: boolean } }; relationDetails?: unknown }> }>;
  };
  expect(json.format).toBe('companion-scientific-diagram-blind-graph-report');
  expect(json.localOnly).toBe(true);
  expect(json.version).toBe(2);
  expect((json as typeof json & { promptVariant: string }).promptVariant).toBe('isolated-arrows-outside');
  expect(json.cases[0]?.experiments[0]).toMatchObject({ promptVariant: 'isolated-arrows-outside' });
  expect(json.cases[0]?.experiments[0]?.graph).toBeTruthy();
  expect(json.cases[0]?.experiments[0]?.relationDetails).toBeTruthy();
  expect(json.cases[0]?.experiments[0]?.diagnostic?.rawResponse).toContain('arrowsComplete');
  expect(json.cases[0]?.experiments[0]?.diagnostic?.imageAudit).toMatchObject({ width: 1100, height: 610, pngSignatureValid: true });
  expect(json.cases[1]?.experiments[0]?.graph).toBeUndefined();
  expect(json.cases[1]?.experiments[0]?.diagnostic).toMatchObject({ rawResponse: '{', validationError: 'JSON visuel illisible.', doneReason: 'length', attempts: 2, previousValidationError: 'JSON visuel illisible.' });
  expect(json.cases).toHaveLength(6);
  expect(json.cases.map((item) => item.experiments.length)).toEqual([1, 1, 1, 1, 1, 1]);
  expect(json.statistics).toHaveLength(1);
  expect(json.statistics[0]).toMatchObject({ correctRelationCount: 14, correctRelationRejections: 0 });
  expect(json.cases[0]?.experiments[0]?.observations['relations::transcription']).toBe('present');
  expect(JSON.stringify(json)).not.toContain('http://localhost:11434');
  expect(JSON.stringify(json)).not.toContain('data:image');
  expect(JSON.stringify(json)).not.toContain('PRIVATE_PIXEL_BYTES');

  await page.getByRole('navigation', { name: 'Navigation des outils IA' })
    .getByRole('button', { name: /Suivre et diagnostiquer/ }).click();
  await page.getByRole('navigation', { name: 'Détails du suivi' })
    .getByRole('button', { name: 'Inspecteur réseau' }).click();
  const reports = page.getByRole('region', { name: 'Rapports des schémas scientifiques' });
  await reports.locator('summary').click();
  await expect(reports.getByRole('button', { name: /Exporter l’observation indépendante/ })).toBeVisible();
});

test('blind graph observer supports an explicitly selected OpenAI-compatible Vision endpoint, exporting remote provenance', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([{
      id: 'remote-blind', name: 'Vision OpenAI-compatible', mode: 'single',
      updatedAt: '2026-11-09T12:00:00Z',
      configuration: {
        endpoint: 'https://vision.example.test/v1/chat/completions', apiCompatible: true, apiKey: 'PRIVATE_API_KEY',
        visionModel: 'vision-27b', analysisModel: 'vision-27b',
        transcriptionTokenLimit: 2048, transcriptionPromptMode: 'auto',
        transcriptionRepeatPenalty: 1.05, transcriptionPenaltyParameter: 'none',
        transcriptionFrequencyPenalty: 0, analysisThinking: false,
        criterionByCriterion: true, correctionMethod: 'generative',
        secondAnalysisModel: '', arbitratorModel: '', diagnosticStrategy: 'single',
      },
    }]));
  });
  const requests: Array<Record<string, unknown>> = [];
  await page.route('https://vision.example.test/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST,OPTIONS', 'access-control-allow-headers': '*' } });
      return;
    }
    expect(request.url()).toBe('https://vision.example.test/v1/chat/completions');
    expect(request.headers().authorization).toBe('Bearer PRIVATE_API_KEY');
    const data = request.postDataJSON() as Record<string, unknown>;
    requests.push(data);
    const graph = { labels: ['ADN', 'ARN'], arrows: [{ first: 'ADN', second: 'ARN', tip: 'second' }],
      containment: [], arrowsComplete: true };
    await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(graph) }, finish_reason: 'stop' }],
        usage: { completion_tokens: 42 } }) });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  await page.getByRole('group', { name: 'Parcours de test' })
    .getByRole('button', { name: /Schémas scientifiques/ }).click();
  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  await panel.getByRole('tab', { name: /Graphe des relations/ }).click();
  const observer = panel.getByRole('region', { name: 'Extraction du graphe de relations' });
  const start = observer.getByRole('button', { name: 'Extraire les relations des 6 schémas' });
  await expect(start).toBeDisabled();
  await page.getByRole('group', { name: 'Configurations à exécuter' })
    .locator('label.evaluation-profile-option').first().click();
  await expect(start).toBeEnabled();
  await start.click();
  await expect.poll(() => requests.length, { timeout: 90_000 }).toBe(6);
  for (const body of requests) {
    expect((body.response_format as { type?: string })?.type).toBe('json_schema');
    expect(body.model).toBe('vision-27b');
    expect(JSON.stringify(body)).toContain('data:image/png;base64,');
    expect(JSON.stringify(body)).not.toContain('ADN → ARN');
    expect(JSON.stringify(body)).not.toContain('maxPoints');
    expect(JSON.stringify(body)).not.toContain('PRIVATE_API_KEY');
  }
  const results = observer.getByRole('region', { name: 'Résultats du graphe visuel indépendant' });
  await expect(results).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    observer.getByRole('button', { name: 'Exporter l’analyse du graphe JSON' }).click(),
  ]);
  const report = JSON.parse(await readFile(await download.path(), 'utf8')) as {
    localOnly: boolean; cases: Array<{ experiments: Array<{ provider: string; remote: boolean; diagnostic?: { outputTokens?: number } }> }>;
  };
  expect(report.localOnly).toBe(false);
  expect(report.cases).toHaveLength(6);
  expect(report.cases[0]?.experiments[0]?.provider).toBe('openai-compatible');
  expect(report.cases[0]?.experiments[0]?.remote).toBe(true);
  expect(report.cases[0]?.experiments[0]?.diagnostic?.outputTokens).toBe(42);
  expect(JSON.stringify(report)).not.toContain('PRIVATE_API_KEY');
  expect(JSON.stringify(report)).not.toContain('vision.example.test');
  expect(JSON.stringify(report)).not.toContain('data:image');
});

test('blind graph uses saved Bonsai generative Vision model even with decision correction, and remembers selection after reload', async ({ page }) => {
  await page.addInitScript(() => {
    // Seed once: on reload the application must restore the selection itself.
    if (sessionStorage.getItem('bonsai-graph-seeded')) return;
    sessionStorage.setItem('bonsai-graph-seeded', 'yes');
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([{
      id: 'bonsai-vision', name: 'Bonsai graph', mode: 'single', updatedAt: '2026-11-10T10:00:00Z',
      configuration: {
        endpoint: 'http://localhost:11434', apiCompatible: false, apiKey: '',
        visionModel: '', generativeModel: 'bonsai-2:4b', decisionModel: 'tev1:4b',
        analysisModel: 'tev1:4b', correctionMethod: 'decision',
        transcriptionTokenLimit: 2048, transcriptionPromptMode: 'auto',
        transcriptionRepeatPenalty: 1.05, transcriptionPenaltyParameter: 'none',
        transcriptionFrequencyPenalty: 0, analysisThinking: false,
        criterionByCriterion: true, secondAnalysisModel: '', arbitratorModel: '', diagnosticStrategy: 'single',
      },
    }]));
    localStorage.setItem('companion-correcteur:evaluation-selected-profiles:v1', JSON.stringify(['bonsai-vision']));
  });
  const models: string[] = [];
  await page.route('http://localhost:11434/**', async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS', 'content-type': 'application/json' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (pathname === '/api/tags') return route.fulfill({ status: 200, headers, body: JSON.stringify({
      models: [{ name: 'bonsai-2:4b', model: 'bonsai-2:4b' }],
    }) });
    if (pathname === '/api/show') return route.fulfill({ status: 200, headers, body: JSON.stringify({ model_info: {} }) });
    if (pathname === '/api/ps') return route.fulfill({ status: 200, headers, body: JSON.stringify({ models: [] }) });
    if (pathname === '/api/chat') {
      const body = request.postDataJSON() as { model: string };
      models.push(body.model);
      return route.fulfill({ status: 200, headers, body: JSON.stringify({
        message: { content: JSON.stringify({ labels: ['ADN', 'ARN'], arrows: [
          { first: 'ADN', second: 'ARN', tip: 'second' },
        ], containment: [], arrowsComplete: true }) }, done: true, done_reason: 'stop',
      }) });
    }
    return route.fulfill({ status: 404, headers, body: '{}' });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  await page.getByRole('group', { name: 'Parcours de test' })
    .getByRole('button', { name: /Schémas scientifiques/ }).click();
  const panel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  await panel.getByRole('tab', { name: /Graphe des relations/ }).click();
  const observer = panel.getByRole('region', { name: 'Extraction du graphe de relations' });
  const start = observer.getByRole('button', { name: 'Extraire les relations des 6 schémas' });
  await expect(start).toBeEnabled();
  await expect(observer.getByText(/Modèle réellement envoyé aux six schémas/)).toContainText('bonsai-2:4b');
  await start.click();
  await expect.poll(() => models.length, { timeout: 90_000 }).toBe(6);
  expect(models).toEqual(Array(6).fill('bonsai-2:4b'));

  await page.reload();
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  await page.getByRole('group', { name: 'Parcours de test' })
    .getByRole('button', { name: /Schémas scientifiques/ }).click();
  const afterReloadPanel = page.getByRole('region', { name: 'Protocole schémas scientifiques' });
  await afterReloadPanel.getByRole('tab', { name: /Graphe des relations/ }).click();
  const afterReload = afterReloadPanel.getByRole('region', { name: 'Extraction du graphe de relations' });
  await expect(afterReload.getByRole('button', { name: 'Extraire les relations des 6 schémas' })).toBeEnabled();
});
