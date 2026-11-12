import { expect, test } from '@playwright/test';
import { buildBlindVisualObservationReport } from '../../src/domain/scientificDiagramBlindGraph.ts';
import { DIAGRAM_SENSITIVITY_CASES } from '../../src/domain/scientificDiagramSensitivity.ts';
import { summarizeDiagramLabReport } from '../../src/domain/diagramLabHistory.ts';
import { defaultAiModelConfiguration } from '../../src/domain/aiModelProfiles.ts';
import { buildDiagramLabRadar } from '../../src/domain/diagramLabRadar.ts';
import { SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET } from '../../src/domain/scientificDiagramFixtures.ts';

const report = buildBlindVisualObservationReport(DIAGRAM_SENSITIVITY_CASES.map((item) => ({
  caseId: item.id, profileId: 'radar-prof', profileName: 'Vision à compléter',
  model: 'vision:4b', repetition: 1, status: 'success' as const, durationMs: 2000,
  observations: { ...item.gold }, arrowCount: 2, containmentCount: 1,
})), 1, '2026-11-10T12:00:00Z');

test('D1 radar evaluation unloads the native model without calling unsupported Chat', async ({ page }) => {
  const requests: Array<{ path: string; model: string; keepAlive?: unknown }> = [];
  const loaded = new Set(['d1:3b', 'qwen3.5:4b']);
  await page.route('http://localhost:11434/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.method() === 'POST' ? JSON.parse(request.postData() || '{}') as {
      model?: string; keep_alive?: unknown; questions?: Record<string, { type?: string; criteria?: Record<string, string> }>;
    } : {};
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS', 'content-type': 'application/json' };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers }); return;
    }
    requests.push({ path, model: body.model ?? '', keepAlive: body.keep_alive });
    if (path === '/api/tags') {
      await route.fulfill({ status: 200, headers, body: JSON.stringify({ models: [
        { name: 'd1:3b' }, { name: 'qwen3.5:4b' },
      ] }) }); return;
    }
    if (path === '/api/show') {
      await route.fulfill({ status: 200, headers, body: JSON.stringify({ capabilities: ['completion', 'vision'] }) }); return;
    }
    if (path === '/api/ps') {
      await route.fulfill({ status: 200, headers, body: JSON.stringify({
        models: [...loaded].map((name) => ({ name })),
      }) }); return;
    }
    if (path === '/v1/systemone') {
      if (body.keep_alive === 0) loaded.delete('d1:3b');
      const answers = Object.fromEntries(Object.entries(body.questions ?? {}).map(([id, question]) => {
        const choice = Object.keys(question.criteria ?? {})[0] ?? 'present';
        return [id, question.type === 'noul' ? { noul: 0.9 }
          : { type: 'choice', choice, probabilities: { [choice]: 1 }, confidence: 1 }];
      }));
      await route.fulfill({ status: 200, headers, body: JSON.stringify({ answers }) }); return;
    }
    if (path === '/api/generate') {
      if (body.keep_alive === 0) loaded.delete(body.model ?? '');
      await route.fulfill({ status: 200, headers, body: JSON.stringify({ done: true }) }); return;
    }
    if (path === '/api/chat' && body.model === 'qwen3.5:4b') {
      await route.fulfill({ status: 200, headers, body: JSON.stringify({
        model: 'qwen3.5:4b', message: { content: 'Cellule végétale, noyau, ADN, mitose.' },
        done: true, done_reason: 'stop',
      }) + '\n' }); return;
    }
    await route.fulfill({ status: 400, headers, body: JSON.stringify({ error: 'unsupported call' }) });
  });
  await page.goto('/');
  await page.evaluate((configuration) => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([{
      id: 'd1-with-vision', name: 'D1 avec Vision', mode: 'single',
      updatedAt: '2026-11-12T13:00:00Z',
      configuration: { ...configuration, endpoint: 'http://localhost:11434',
        visionModel: 'qwen3.5:4b', analysisModel: 'd1:3b', decisionModel: 'd1:3b',
        correctionMethod: 'decision' },
    }]));
  }, defaultAiModelConfiguration);
  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  const science = page.getByRole('region', { name: 'Tableau de bord des radars' })
    .getByRole('article', { name: 'Schémas scientifiques' });
  await science.getByRole('button', { name: 'Évaluer en schémas scientifiques' }).click();
  await expect.poll(() => requests.some((req) => req.path === '/v1/systemone'
    && req.model === 'd1:3b' && req.keepAlive === 0), { timeout: 30_000 }).toBe(true);
  expect(requests.filter((req) => req.path === '/api/chat' && req.model === 'd1:3b')).toEqual([]);
});

test('D1 configured as its own Vision reader is rejected before any unsupported /api/chat call', async ({ page }) => {
  const chatCalls: string[] = [];
  await page.route('http://localhost:11434/**', async (route) => {
    if (new URL(route.request().url()).pathname === '/api/chat') chatCalls.push(route.request().url());
    await route.fulfill({ status: 400, contentType: 'application/json',
      body: JSON.stringify({ error: '"d1:3b" does not support chat' }) });
  });
  await page.goto('/');
  await page.evaluate((configuration) => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([{
      id: 'd1-wrong-reader', name: 'D1', mode: 'single', updatedAt: '2026-11-12T13:00:00Z',
      configuration: { ...configuration, endpoint: 'http://localhost:11434',
        analysisModel: 'd1:3b', decisionModel: 'd1:3b', visionModel: 'd1:3b',
        correctionMethod: 'decision' },
    }]));
  }, defaultAiModelConfiguration);
  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  const scientific = page.getByRole('region', { name: 'Tableau de bord des radars' })
    .getByRole('article', { name: 'Schémas scientifiques' });
  await expect(scientific.getByRole('button', { name: 'Évaluer en schémas scientifiques' })).toBeDisabled();
  await expect(scientific).toContainText('Modèle décisionnel utilisé en Vision');
  await expect(scientific).toContainText('/api/chat');
  expect(chatCalls).toEqual([]);
});

test('the dashboard launches scientific batteries on a configured Ollama LAN host', async ({ page }) => {
  const ollamaRequests: string[] = [];
  await page.route('http://192.168.1.42:11434/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS', 'content-type': 'application/json' };
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    ollamaRequests.push(path);
    await route.fulfill({ status: 200, headers, body: JSON.stringify(path === '/api/tags'
      ? { models: [{ name: 'gemma4:e4b', model: 'gemma4:e4b' }] }
      : path === '/api/show'
        ? { model_info: {}, capabilities: ['completion', 'vision'] }
        : { message: { content: '{"summary":"essai","criteria":[]}' }, done: true, done_reason: 'stop' }) });
  });
  await page.goto('/');
  await page.evaluate((configuration) => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([{
      id: 'gemma-no-vision', name: 'Gemma directe', mode: 'single',
      updatedAt: '2026-11-12T10:00:00Z',
      configuration: { ...configuration, endpoint: 'http://192.168.1.42:11434',
        apiCompatible: false, visionModel: '', analysisModel: 'gemma4:e4b',
        generativeModel: 'gemma4:e4b', correctionMethod: 'generative' },
    }]));
  }, defaultAiModelConfiguration);
  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  const dashboard = page.getByRole('region', { name: 'Tableau de bord des radars' });
  await dashboard.getByLabel('Choisir un LLM').selectOption('gemma4:e4b');
  await dashboard.getByRole('article', { name: 'Schémas scientifiques' })
    .getByRole('button', { name: 'Évaluer en schémas scientifiques' }).click();

  const nav = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await expect(nav.getByRole('button', { name: 'Tests', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('group', { name: 'Modèles sélectionnés pour les tests' })).toContainText('Gemma directe');
  // This status must be present while fixtures are being prepared or tested,
  // not only after a long-running Ollama call has returned.
  await expect(page.getByRole('status', { name: 'Suivi du lancement depuis le radar' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Dernière expérience lancée' }))
    .toContainText('Schémas scientifiques · qualité graphique A/B/C');
  // The former graph-only localhost check aborted before any Ollama request.
  await expect.poll(() => ollamaRequests.includes('/api/chat'), { timeout: 30_000 }).toBe(true);
  await expect(page.getByRole('status', { name: 'Suivi du lancement depuis le radar' }))
    .not.toContainText('Lancement impossible');
});

test('a missing radar axis leads directly to its automatic fixture battery on the same saved profile', async ({ page }) => {
  await page.goto('/');
  const entry = summarizeDiagramLabReport(report, 'finished');
  const profile = {
    id: 'radar-prof', name: 'Vision à compléter', mode: 'single', updatedAt: '2026-11-10T12:00:00Z',
    configuration: { ...defaultAiModelConfiguration, visionModel: 'vision:4b',
      analysisModel: 'vision:4b', generativeModel: 'vision:4b', correctionMethod: 'generative' },
  };
  const alternateProfile = { ...profile, id: 'radar-other', name: 'Autre configuration',
    configuration: { ...profile.configuration, visionModel: 'another:4b', analysisModel: 'another:4b',
      generativeModel: 'another:4b' } };
  await page.evaluate(async ({ entry, profile, alternateProfile }) => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([profile, alternateProfile]));
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('companion-correcteur-devoir', 6);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('diagram-lab-archive', 'readwrite');
    tx.objectStore('diagram-lab-archive').put(entry);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { entry, profile, alternateProfile });
  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' }).getByRole('button', { name: 'Tests', exact: true }).click();
  const nav = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await nav.getByRole('button', { name: 'Radars' }).click();
  await page.getByRole('article', { name: 'Schémas scientifiques' }).getByRole('button', { name: 'Détail du radar' }).click();
  const radar = page.getByRole('region', { name: 'Radar des candidats scientifiques' });
  await radar.getByLabel('Choisir un LLM').selectOption('another:4b');
  await radar.getByRole('group', { name: 'Axe à examiner' }).getByRole('button', { name: /Qualité graphique/ }).click();
  await expect(radar.getByText('Non mesuré').first()).toBeVisible();
  await expect(radar.getByText(/Qualité graphique A\/B\/C · 1 passage/)).toBeVisible();

  await radar.getByRole('button', { name: 'Lancer le test manquant' }).click();
  await expect(nav.getByRole('button', { name: 'Tests' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('group', { name: 'Parcours de test' })
    .getByRole('button', { name: /Schémas scientifiques/ })).toHaveAttribute('aria-pressed', 'true');
  const running = page.getByRole('status', { name: 'Dernière expérience lancée' });
  await expect(running).toBeVisible();
  await expect(running).toContainText('Autre configuration');
  await expect(running).toContainText('Schémas scientifiques · qualité graphique A/B/C');
  // No previously selected unrelated model is invoked by this shortcut.
  await expect(page.getByRole('group', { name: 'Modèles sélectionnés pour les tests' })).toContainText('Autre configuration');
  await nav.getByRole('button', { name: 'Radars' }).click();
  await page.getByRole('article', { name: 'Schémas scientifiques' }).getByRole('button', { name: 'Détail du radar' }).click();
  await expect(page.getByRole('region', { name: 'Radar des candidats scientifiques' }).getByLabel('Choisir un LLM'))
    .toHaveValue('another:4b');
  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' }).getByRole('button', { name: 'Tests', exact: true }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' }).getByRole('button', { name: 'Radars' }).click();
  await page.getByRole('article', { name: 'Schémas scientifiques' }).getByRole('button', { name: 'Détail du radar' }).click();
  await expect(page.getByRole('region', { name: 'Radar des candidats scientifiques' }).getByLabel('Choisir un LLM'))
    .toHaveValue('another:4b');
});

test('evaluating a new model launches the four required batteries from one action', async ({ page }) => {
  await page.goto('/');
  await page.evaluate((configuration) => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([{
      id: 'new-radar-model', name: 'Nouveau modèle', mode: 'single', updatedAt: '2026-11-11T12:00:00Z',
      configuration: { ...configuration, visionModel: 'fresh:4b', analysisModel: 'fresh:4b',
        generativeModel: 'fresh:4b', correctionMethod: 'generative' },
    }]));
  }, defaultAiModelConfiguration);
  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' }).getByRole('button', { name: 'Tests', exact: true }).click();
  const nav = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await nav.getByRole('button', { name: 'Radars' }).click();
  await page.getByRole('article', { name: 'Schémas scientifiques' }).getByRole('button', { name: 'Détail du radar' }).click();
  const radar = page.getByRole('region', { name: 'Radar des candidats scientifiques' });
  await radar.getByLabel('Choisir un LLM').selectOption('fresh:4b');
  await expect(radar.getByText(/4 batteries de test à enchaîner automatiquement/)).toBeVisible();
  await radar.getByRole('button', { name: 'Évaluer le modèle' }).click();
  await expect(nav.getByRole('button', { name: 'Tests' })).toHaveAttribute('aria-current', 'page');
  const running = page.getByRole('status', { name: 'Dernière expérience lancée' });
  await expect(running).toBeVisible();
  await expect(running).toContainText('Schémas scientifiques');
  await expect(page.getByRole('group', { name: 'Modèles sélectionnés pour les tests' })).toContainText('Nouveau modèle');
});

test('qwen-like 6/8 radar targets A/B/C x3 to fill graphics and stability in one battery', async ({ page }) => {
  const model = 'vision:4b';
  const profile = {
    id: 'radar-prof', name: 'Vision à compléter', mode: 'single', updatedAt: '2026-11-11T14:40:00Z',
    configuration: { ...defaultAiModelConfiguration, visionModel: model,
      analysisModel: model, generativeModel: model, correctionMethod: 'generative' },
  };
  const makeRuns = (observations: Record<string, string>) => [{
    profileId: profile.id, profileName: profile.name, model, repetition: 1, status: 'success',
    method: 'direct-image-generative', durationMs: 2000,
    observations: Object.entries(observations).map(([key, choice]) => ({ key, choice })),
  }];
  const arrows = {
    format: 'companion-scientific-diagram-fixture-report', createdAt: '2026-11-11T14:39:00Z',
    plannedRepetitions: 1, localOnly: true, cases: (['D', 'E'] as const).map((id) => ({
      caseId: id, label: id, gold: { [SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET]: id === 'D' ? 'present' : 'absent' },
      // E was incorrectly accepted, leading to the 50/100 arrow score seen in the screenshot.
      experiments: makeRuns({ [SCIENTIFIC_DIAGRAM_LABEL_POINTER_TARGET]: 'present' }),
      summaries: [],
    })),
  };
  const semantic = {
    format: 'companion-scientific-diagram-sensitivity-report',
    createdAt: '2026-11-11T14:38:00Z', plannedRepetitions: 1, localOnly: true,
    promptModes: ['standard'], statistics: [],
    cases: DIAGRAM_SENSITIVITY_CASES.map((item) => ({
      caseId: item.id, label: item.label, promptMode: 'standard',
      experiments: makeRuns(item.gold),
    })),
  };
  const entries = [
    summarizeDiagramLabReport(report, 'finished'),
    summarizeDiagramLabReport(arrows as unknown as Parameters<typeof summarizeDiagramLabReport>[0], 'finished'),
    summarizeDiagramLabReport(semantic as unknown as Parameters<typeof summarizeDiagramLabReport>[0], 'finished'),
  ];
  const candidate = buildDiagramLabRadar(entries, 'model').find((item) => item.id === model);
  expect(candidate?.measured).toBe(6);
  expect(candidate?.axes.graphics.value).toBeNull();
  expect(candidate?.axes.stability.value).toBeNull();
  expect(candidate?.axes.arrows.value).toBe(50);

  await page.goto('/');
  await page.evaluate(async ({ entries: saved, profile: savedProfile }) => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([savedProfile]));
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('companion-correcteur-devoir', 6);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction('diagram-lab-archive', 'readwrite');
    for (const entry of saved) tx.objectStore('diagram-lab-archive').put(entry);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { entries, profile });
  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' }).getByRole('button', { name: 'Tests', exact: true }).click();
  const nav = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await nav.getByRole('button', { name: 'Radars' }).click();
  await page.getByRole('article', { name: 'Schémas scientifiques' }).getByRole('button', { name: 'Détail du radar' }).click();
  const radar = page.getByRole('region', { name: 'Radar des candidats scientifiques' });
  await radar.getByLabel('Choisir un LLM').selectOption(model);
  await expect(radar.getByText(/2 caractéristique\(s\) à mesurer sur huit/)).toBeVisible();
  await expect(radar.getByText(/1 batterie de test à enchaîner automatiquement · Qualité graphique A\/B\/C · 3 passages/)).toBeVisible();
  await radar.getByRole('button', { name: 'Évaluer le modèle' }).click();
  await expect(nav.getByRole('button', { name: 'Tests' })).toHaveAttribute('aria-current', 'page');
  // The compact workspace intentionally hides the radar return note while
  // a long inference is running. Assert the durable navigation and exact
  // selected model instead of racing that transient status element.
  await expect(page.getByRole('group', { name: 'Modèles sélectionnés pour les tests' })
    .getByText('Vision à compléter')).toBeVisible();
});
