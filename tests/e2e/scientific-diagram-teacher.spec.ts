import { expect, test, type Page } from '@playwright/test';
import { SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC } from '../../src/domain/scientificDiagramProtocol.ts';

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
  return diagram;
}

async function addCopies(page: Page, names: string[]) {
  await page.locator('.copy-overview-heading').getByRole('button', { name: /Ajouter des copies/ }).click();
  await page.locator('#teacher-copy-intake-files').setInputFiles(names.map((name) => ({
    name, mimeType: 'image/png', buffer: onePixelPng,
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

test.beforeEach(async ({ page }) => {
  await page.addInitScript((config) => {
    localStorage.setItem('companion-correcteur:auto-background-correction:v1', 'false');
    localStorage.setItem('companion-correcteur:ollama-configuration:v1', JSON.stringify(config));
  }, configuration);
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

  await addCopies(page, ['étudiant-a.png', 'étudiant-b.png']);
  await expect(page.getByRole('button', { name: /En attente/ })).toContainText('2');
  await expect(requests).toHaveLength(0);
  await page.locator('.copy-overview-heading').getByRole('button', { name: /Démarrer les corrections/ }).click();
  await expect(page.locator('.copy-overview-grid .correction-series-card.is-to-review')).toHaveCount(2, { timeout: 30000 });
  expect(requests).toHaveLength(2);
  expect(requests.every((payload) => payload.model === 'qwen3.5:4b')).toBe(true);
  expect(requests.every((payload) => payload.messages?.[0]?.images?.length === 1)).toBe(true);

  await page.locator('.copy-overview-grid .correction-series-card').first().getByRole('button', { name: 'Ouvrir' }).click();
  await expect(page.getByRole('complementary', { name: 'Navigation entre les copies' })).toBeVisible();
  await expect(page.locator('.teacher-copy-rail-list > li')).toHaveCount(2);
  await expect(page.locator('.review-source-pane')).toBeVisible();
  await expect(page.locator('.review-main-column .review-card')).toHaveCount(3);
  await expect(page.locator('.copy-review-header-score')).toContainText('0 / 8');
  const firstCriterion = page.locator('.review-main-column .review-card').first();
  await firstCriterion.getByText('Voir la preuve et la justification détaillées').click();
  await expect(firstCriterion.getByText('Observation à vérifier')).toBeVisible();

  await page.getByRole('button', { name: 'Valider et passer à la suivante' }).click();
  await page.getByRole('button', { name: 'Mes devoirs' }).click();
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
  failed = false;
  await page.locator('.copy-overview-grid .correction-series-card.is-to-retry').getByRole('button', { name: 'Relancer' }).click();
  await expect(page.locator('.copy-overview-grid .correction-series-card.is-to-review')).toHaveCount(1, { timeout: 30000 });
  expect(requests.length).toBeGreaterThanOrEqual(2);
  await page.locator('.copy-overview-grid .correction-series-card').first().getByRole('button', { name: 'Ouvrir' }).click();
  await expect(page.locator('.copy-review-header-score')).toContainText('0 / 8');
});

test('remote diagram assignments never queue images without explicit consent, even when the rubric is ready', async ({ page }) => {
  let remoteCalls = 0;
  await page.addInitScript((config) => localStorage.setItem('companion-correcteur:ollama-configuration:v1', JSON.stringify(config)),
    { ...configuration, endpoint: 'https://ai.example/v1/chat/completions', apiCompatible: true });
  await page.route('https://ai.example/**', async (route) => {
    remoteCalls += 1;
    await route.fulfill({ status: 503, body: '{}' });
  });
  await page.goto('/');
  const context = await createDiagramAssignment(page, 'Dessin botanique');
  await expect(context).toContainText('Serveur non local');
  await page.locator('.copy-overview-heading').getByRole('button', { name: /Ajouter des copies/ }).click();
  const input = page.locator('#teacher-copy-intake-files');
  await input.setInputFiles({ name: 'dessin.png', mimeType: 'image/png', buffer: onePixelPng });
  await expect(page.locator('.copy-overview-grid .correction-series-card')).toHaveCount(0);
  expect(remoteCalls).toBe(0);
  await context.getByRole('checkbox', { name: /J’autorise l’envoi des images/ }).check();
  await input.setInputFiles({ name: 'dessin.png', mimeType: 'image/png', buffer: onePixelPng });
  await expect(page.locator('.copy-overview-grid .correction-series-card')).toHaveCount(1);
  expect(remoteCalls).toBe(0);
});
