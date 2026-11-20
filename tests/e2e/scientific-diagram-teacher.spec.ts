import { expect, test, type Page } from '@playwright/test';
import { SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC } from '../../src/correction/domain/scientificDiagramRubric.ts';

const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZckAAAAASUVORK5CYII=', 'base64');
const configuration = {
  endpoint: 'http://localhost:11434', apiCompatible: false, apiKey: '',
  visionModel: '', analysisModel: 'qwen3.5:4b',
  transcriptionTokenLimit: 2048, transcriptionPromptMode: 'auto',
  transcriptionRepeatPenalty: 1.05, transcriptionPenaltyParameter: 'none',
  transcriptionFrequencyPenalty: 0, secondAnalysisModel: '', arbitratorModel: '',
  diagnosticStrategy: 'single', analysisThinking: false, criterionByCriterion: true,
  correctionMethod: 'generative',
};

function diagramResult() {
  const criteria = Object.fromEntries(SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC.criteria.map((criterion) => [
    criterion.id, {
      evidence: 'Observation à vérifier', confidence: 'medium', questionForTeacher: '',
      subcriteria: Object.fromEntries((criterion.subcriteria ?? []).map((sub) => [
        sub.id, { points: 0, evidence: 'Non visible' },
      ])),
    },
  ]));
  return JSON.stringify({ criteria });
}

async function createDiagramAssignment(page: Page, title = 'Mitose · L1') {
  await expect(page.getByRole('heading', { name: 'Mes devoirs' })).toBeVisible();
  await page.getByRole('button', { name: /Créer un devoir/ }).click();
  await page.getByRole('combobox', { name: 'Type de devoir' }).selectOption('scientific-diagram');
  await expect(page.getByText('15 attendus graphiques, 8 points', { exact: false })).toBeVisible();
  await page.getByLabel('Nom du devoir').fill(title);
  await page.getByRole('button', { name: 'Créer le devoir de schéma' }).click();
  await expect(page.getByRole('heading', { name: 'Suivi des copies' })).toBeVisible();
  const diagram = page.getByRole('region', { name: 'Devoir de schéma scientifique' });
  await expect(diagram).toContainText('Correction directe du dessin, sans transcription OCR');
  await expect(diagram).toContainText('8 points');
  await diagram.getByText('Voir le barème graphique', { exact: false }).click();
  await expect(diagram.locator('ol > li')).toHaveCount(3);
  await expect(diagram.locator('ul > li')).toHaveCount(15);
  await expect(diagram.getByText('Barème cumulé : 4 / 8 pts')).toBeVisible();
  await expect(diagram.getByText('Barème cumulé : 6 / 8 pts')).toBeVisible();
  await expect(diagram.getByText('Barème cumulé : 8 / 8 pts')).toBeVisible();
  return diagram;
}

async function addCopies(page: Page, names: string[], buffers: Buffer[] = []) {
  await page.locator('.copy-overview-heading').getByRole('button', { name: /Ajouter des copies/ }).click();
  await page.locator('#teacher-copy-intake-files').setInputFiles(names.map((name, index) => ({
    name, mimeType: 'image/png', buffer: buffers[index] ?? onePixelPng,
  })));
  await expect(page.locator('.copy-overview-grid .correction-series-card')).toHaveCount(names.length);
}

function mockOllama(page: Page, requests: Record<string, any>[], failed: () => boolean = () => false) {
  return page.route('http://localhost:11434/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const headers = {
      'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/api/tags') return route.fulfill({ headers, json: { models: [{ name: 'qwen3.5:4b' }] } });
    if (path === '/api/show') return route.fulfill({ headers, json: { model_info: {} } });
    if (path === '/api/ps') return route.fulfill({ headers, json: { models: [] } });
    if (path === '/api/chat') {
      const payload = route.request().postDataJSON() as Record<string, any>;
      requests.push(payload);
      if (failed()) return route.fulfill({ status: 503, headers, body: 'Serveur indisponible' });
      return route.fulfill({
        headers, contentType: 'application/x-ndjson',
        body: JSON.stringify({ message: { content: diagramResult() } }) + '\n' +
          JSON.stringify({ done: true, done_reason: 'stop', eval_count: 120 }) + '\n',
      });
    }
    return route.fulfill({ status: 404, headers, body: '{}' });
  });
}

test.beforeEach(async ({ page }, testInfo) => {
  await page.addInitScript((config) => {
    localStorage.setItem('companion-correcteur:auto-background-correction:v1', 'false');
    localStorage.setItem('companion-correcteur:ollama-configuration:v1', JSON.stringify(config));
  }, testInfo.title.startsWith('remote diagram assignments')
    ? { ...configuration, endpoint: 'https://ai.example/v1/chat/completions', apiCompatible: true }
    : configuration);
});

test('an individually corrected scientific diagram uses one direct image request without any Vision classification', async ({ page }) => {
  const requests: Record<string, any>[] = [];
  await mockOllama(page, requests);
  await page.goto('/');
  await createDiagramAssignment(page, 'Mitose directe individuelle');

  await page.locator('.copy-overview-heading').getByRole('button', { name: /Ajouter des copies/ }).click();
  await page.getByRole('button', { name: 'Préparer manuellement une copie et ses pages' }).click();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toBeVisible();
  await page.locator('#copy-files').setInputFiles({ name: 'mitose.png', mimeType: 'image/png', buffer: onePixelPng });
  const correct = page.getByRole('button', { name: 'Corriger le schéma' });
  await expect(correct).toBeEnabled();
  await correct.click();

  await expect(page.locator('.review-main-column .review-card')).toHaveCount(3, { timeout: 30000 });
  expect(requests).toHaveLength(1);
  expect(requests[0].model).toBe('qwen3.5:4b');
  expect(requests[0].messages?.[0]?.images).toHaveLength(1);
  expect(String(requests[0].messages[0].content)).toContain('BARÈME ENSEIGNANT');
  expect(String(requests[0].messages[0].content)).not.toContain('Classer la page');
  expect(requests[0].options?.num_ctx).toBe(9216);
});

test('direct diagram grading keeps the original image on screen and does not claim zero pages were read', async ({ page }) => {
  const requests: Record<string, any>[] = [];
  await mockOllama(page, requests);
  let releaseResponse: () => void = () => undefined;
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  // Keep the local model busy while checking the real teacher-facing progress screen.
  await page.route('http://localhost:11434/api/chat', async (route) => {
    requests.push(route.request().postDataJSON() as Record<string, any>);
    await responseGate;
    await route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      contentType: 'application/x-ndjson',
      body: JSON.stringify({ message: { content: diagramResult() } }) + '\n' +
        JSON.stringify({ done: true, done_reason: 'stop', eval_count: 120 }) + '\n',
    });
  });
  await page.goto('/');
  await createDiagramAssignment(page, 'Schéma visible pendant la correction');
  await page.locator('.copy-overview-heading').getByRole('button', { name: /Ajouter des copies/ }).click();
  await page.getByRole('button', { name: 'Préparer manuellement une copie et ses pages' }).click();
  await page.locator('#copy-files').setInputFiles({ name: 'schema-visible.png', mimeType: 'image/png', buffer: onePixelPng });
  await page.getByRole('button', { name: 'Corriger le schéma' }).click();

  try {
    await expect.poll(() => requests.length).toBe(1);
    // The direct path has no OCR reading stage and must not display a false green check.
    await expect(page.locator('.teacher-progress-phases')).toContainText('Analyse directe du schéma');
    await expect(page.locator('.teacher-progress-phases')).not.toContainText('Lecture de la copie');
    await expect(page.locator('.teacher-progress-phases')).not.toContainText('0/1 pages lues');
    await expect(page.locator('.teacher-progress-page-list')).toContainText('Page 1 / 1 · incluse dans l’analyse');
    await expect(page.getByRole('heading', { name: 'Le schéma en cours de correction' })).toBeVisible();
    const liveImage = page.getByRole('img', { name: 'Page 1 du schéma en cours de correction' });
    await expect(liveImage).toBeVisible();
    await expect(liveImage).toHaveAttribute('src', /^data:image\/png;base64,/);
    await expect(page.locator('.live-transcription-panel')).toHaveCount(0);
    expect(requests[0].messages?.[0]?.images).toHaveLength(1);
  } finally {
    releaseResponse();
  }
  await expect(page.locator('.review-main-column .review-card')).toHaveCount(3, { timeout: 30000 });
});

test('a large PNG copy is downsized on the multimodal wire but preserved locally for the teacher', async ({ page }) => {
  const requests: Record<string, any>[] = [];
  await mockOllama(page, requests);
  await page.goto('/');
  await createDiagramAssignment(page, 'Grande copie scientifique');

  const originalBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2600;
    canvas.height = 1800;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 2600, 1800);
    ctx.fillStyle = '#111111';
    ctx.font = '60px sans-serif';
    ctx.fillText('Mitose', 100, 100);
    ctx.strokeRect(200, 200, 1000, 800);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await page.locator('.copy-overview-heading').getByRole('button', { name: /Ajouter des copies/ }).click();
  await page.getByRole('button', { name: 'Préparer manuellement une copie et ses pages' }).click();
  await page.locator('#copy-files').setInputFiles({
    name: 'grand-schema.png', mimeType: 'image/png', buffer: Buffer.from(originalBase64, 'base64'),
  });
  await page.getByRole('button', { name: 'Corriger le schéma' }).click();
  await expect(page.locator('.review-main-column .review-card')).toHaveCount(3, { timeout: 30000 });

  expect(requests).toHaveLength(1);
  const sent = requests[0].messages?.[0]?.images?.[0] as string;
  expect(sent).toBeTruthy();
  expect(sent).not.toBe(originalBase64);
  const dimensions = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = 'data:image/jpeg;base64,' + base64;
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  }, sent);
  expect(dimensions).toEqual([1300, 900]);
  // The teacher can still see the original PNG, not the reduced network payload.
  const copyImage = page.locator('.review-source-pane img').first();
  await expect(copyImage).toHaveAttribute('src', /^data:image\/png;base64,/);
});

test('a diagram devoir has the normal library, several copies, review rail and locally archived corrections', async ({ page }) => {
  const requests: Record<string, any>[] = [];
  await mockOllama(page, requests);
  await page.goto('/');
  await createDiagramAssignment(page);

  await page.getByRole('button', { name: 'Mes devoirs' }).click();
  const card = page.locator('.assignment-overview-card').filter({ hasText: 'Mitose · L1' });
  await expect(card).toContainText('Schéma scientifique');
  await expect(card).toContainText('8 points');
  await card.getByRole('button', { name: /Reprendre le devoir|Ouvrir le devoir/ }).click();
  await expect(page.getByRole('heading', { name: 'Suivi des copies' })).toBeVisible();

  const arrowPng = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 200; canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 200, 100);
    ctx.fillStyle = 'black'; ctx.fillRect(40, 48, 102, 4);
    ctx.beginPath(); ctx.moveTo(162, 50); ctx.lineTo(138, 38); ctx.lineTo(138, 62); ctx.fill();
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await addCopies(page, ['étudiant-a.png', 'étudiant-b.png'], [Buffer.from(arrowPng, 'base64')]);
  await expect(page.getByRole('button', { name: /En attente/ })).toContainText('2');
  await expect(requests).toHaveLength(0);
  await page.locator('.copy-overview-heading').getByRole('button', { name: /Démarrer les corrections/ }).click();
  await expect(page.locator('.copy-overview-grid .correction-series-card.is-to-review')).toHaveCount(2, { timeout: 30000 });
  expect(requests).toHaveLength(2);
  const hints = requests.map(payload => String(payload.messages[0].content)).filter(prompt => prompt.includes('Pointes possibles'));
  expect(hints).toHaveLength(1);
  expect(hints[0]).toMatch(/page 1, x=\d+ %, y=\d+ %, vers droite/);
  expect(requests.every((payload) => payload.model === 'qwen3.5:4b')).toBe(true);
  expect(requests.every((payload) => payload.messages?.[0]?.images?.length === 1)).toBe(true);

  await page.locator('.copy-overview-grid .correction-series-card').first().getByRole('button', { name: 'Vérifier la copie' }).click();
  await expect(page.getByRole('complementary', { name: 'Navigation entre les copies' })).toBeVisible();
  await expect(page.locator('.teacher-copy-rail-list > li')).toHaveCount(2);
  await expect(page.locator('.review-source-pane')).toBeVisible();
  await page.getByRole('button', { name: 'Agrandir la page 1 du schéma' }).click();
  const viewer = page.getByRole('dialog', { name: 'Visualiseur de la page 1' });
  await expect(viewer.getByRole('button', { name: 'Zoomer', exact: true })).toBeVisible();
  await viewer.getByRole('button', { name: 'Fermer le visualiseur' }).click();
  await expect(page.locator('.review-main-column .review-card')).toHaveCount(3);
  await expect(page.locator('.copy-review-header-score')).toContainText('0 / 8');
  const firstCriterion = page.locator('.review-main-column .review-card').first();
  // The teacher sees the evidence immediately, even before opening the AI complements.
  await expect(firstCriterion.locator('.review-evidence-source').getByText('Observation à vérifier')).toBeVisible();
  await expect(firstCriterion.locator('details.review-explanation')).not.toHaveAttribute('open', '');

  await page.getByRole('button', { name: 'Valider et passer à la suivante' }).click();
  await page.getByRole('button', { name: 'Mes devoirs' }).click();
  // Real teacher behavior: an assignment, its type and validated copies survive reload.
  await page.reload();
  await expect(card).toContainText('Schéma scientifique');
  await card.getByRole('button', { name: /Reprendre le devoir|Ouvrir le devoir/ }).click();
  await expect(page.getByRole('heading', { name: 'Suivi des copies' })).toBeVisible();
  await page.locator('.copy-overview-filters').getByRole('button', { name: /Corrigées/ }).click();
  await expect(page.locator('.copy-overview-grid .correction-series-card.is-completed')).toHaveCount(1);
  await page.locator('.copy-overview-filters').getByRole('button', { name: /À vérifier/ }).click();
  await expect(page.locator('.copy-overview-grid .correction-series-card.is-to-review')).toHaveCount(1);
});

test('a failed diagram image call becomes À reprendre and retry restores an unvalidated suggestion', async ({ page }) => {
  const requests: Record<string, any>[] = [];
  let failed = true;
  await mockOllama(page, requests, () => failed);
  await page.goto('/');
  await createDiagramAssignment(page, 'Schémas à relancer');
  await addCopies(page, ['étudiant.png']);
  await page.locator('.copy-overview-heading').getByRole('button', { name: /Démarrer les corrections/ }).click();
  await expect(page.locator('.copy-overview-grid .correction-series-card.is-to-retry')).toHaveCount(1, { timeout: 30000 });
  await expect(page.locator('.copy-overview-grid .correction-series-card').first()).toContainText('À reprendre');
  // The failed copy and the original image must survive a complete reload.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mes devoirs' })).toBeVisible();
  await page.locator('.assignment-overview-card').filter({ hasText: 'Schémas à relancer' })
    .getByRole('button', { name: /Reprendre le devoir|Ouvrir le devoir/ }).click();
  await expect(page.locator('.copy-overview-grid .correction-series-card.is-to-retry')).toHaveCount(1);
  await expect(page.locator('.copy-overview-grid .correction-series-card.is-to-retry')).toContainText('étudiant.png');
  failed = false;
  await page.locator('.copy-overview-grid .correction-series-card.is-to-retry').getByRole('button', { name: 'Relancer' }).click();
  await expect(page.locator('.copy-overview-grid .correction-series-card.is-to-review')).toHaveCount(1, { timeout: 30000 });
  expect(requests.length).toBeGreaterThanOrEqual(2);
  await page.locator('.copy-overview-grid .correction-series-card').first().getByRole('button', { name: 'Vérifier la copie' }).click();
  await expect(page.locator('.copy-review-header-score')).toContainText('0 / 8');
});

test('remote diagram assignments accept image copies without consent banners and start on demand', async ({ page }) => {
  let remoteCalls = 0;
  await page.route('https://ai.example/**', async (route) => {
    remoteCalls += 1;
    await route.fulfill({ status: 503, body: '{}' });
  });
  await page.goto('/');
  const context = await createDiagramAssignment(page, 'Dessin botanique');
  await expect(context).not.toContainText('Serveur non local');
  await expect(context.getByRole('checkbox', { name: /J’autorise/ })).toHaveCount(0);

  await page.locator('.copy-overview-heading').getByRole('button', { name: /Ajouter des copies/ }).click();
  await page.locator('#teacher-copy-intake-files').setInputFiles({
    name: 'dessin.png', mimeType: 'image/png', buffer: onePixelPng,
  });
  await expect(page.locator('.copy-overview-grid .correction-series-card')).toHaveCount(1);
  expect(remoteCalls).toBe(0);

  await page.locator('.copy-overview-heading').getByRole('button', { name: /Démarrer les corrections/ }).click();
  await expect.poll(() => remoteCalls).toBeGreaterThan(0);
});
