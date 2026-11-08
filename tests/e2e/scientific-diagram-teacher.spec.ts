import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC } from '../../src/domain/scientificDiagramProtocol.ts';

const baseConfiguration = {
  endpoint: 'http://localhost:11434', apiCompatible: false, apiKey: '',
  visionModel: '', analysisModel: 'qwen3.5:4b',
  transcriptionTokenLimit: 2048, transcriptionPromptMode: 'auto',
  transcriptionRepeatPenalty: 1.05, transcriptionPenaltyParameter: 'none',
  transcriptionFrequencyPenalty: 0, secondAnalysisModel: '', arbitratorModel: '',
  diagnosticStrategy: 'single', analysisThinking: false, criterionByCriterion: true,
  correctionMethod: 'generative',
};
const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZckAAAAASUVORK5CYII=', 'base64');

test('the teacher corrects a scientific diagram directly, reviews criterion evidence and exports no image', async ({ page }) => {
  await page.addInitScript((configuration) => localStorage.setItem(
    'companion-correcteur:ollama-profiles:v1',
    JSON.stringify([{ id: 'teacher-qwen', name: 'Qwen visuel', mode: 'single',
      updatedAt: '2026-11-08T00:00:00Z', configuration }]),
  ), baseConfiguration);

  const directRequests: Record<string, unknown>[] = [];
  await page.route('http://localhost:11434/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (path === '/api/tags') return route.fulfill({ headers, json: { models: [{ name: 'qwen3.5:4b' }] } });
    if (path === '/api/show') return route.fulfill({ headers, json: { model_info: {} } });
    if (path === '/api/ps') return route.fulfill({ headers, json: { models: [] } });
    if (path === '/api/chat') {
      const payload = route.request().postDataJSON() as Record<string, any>;
      if (payload.messages?.[0]?.images?.length) {
        directRequests.push(payload);
        const criteria = Object.fromEntries(SCIENTIFIC_DIAGRAM_REFERENCE_RUBRIC.criteria.map((criterion) => [
          criterion.id, {
            evidence: 'Observation à vérifier', confidence: 'medium', questionForTeacher: '',
            subcriteria: Object.fromEntries((criterion.subcriteria ?? []).map((sub) => [
              sub.id, { points: 0, evidence: 'Non visible' },
            ])),
          },
        ]));
        return route.fulfill({ headers, contentType: 'application/x-ndjson', body:
          JSON.stringify({ message: { content: JSON.stringify({ criteria }) } }) + '\n' +
          JSON.stringify({ done: true, done_reason: 'stop', eval_count: 120 }) + '\n' });
      }
      return route.fulfill({ headers, json: { message: { content: 'OK' }, done: true } });
    }
    return route.fulfill({ status: 404, headers, body: '{}' });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Schémas scientifiques' }).click();
  const workspace = page.getByLabel('Correction des schémas scientifiques');
  await expect(workspace.getByRole('heading', { name: 'Corriger un schéma scientifique' })).toBeVisible();
  const rubric = workspace.getByRole('region', { name: 'Détail du barème' });
  await expect(rubric.getByText('15 attendus', { exact: false })).toBeVisible();
  await expect(rubric.locator('.diagram-teacher-criterion')).toHaveCount(3);
  await expect(rubric.locator('.diagram-teacher-subcriteria > li')).toHaveCount(15);
  await expect(rubric.getByText('Barème cumulé : 4 / 8 pts')).toBeVisible();
  await expect(rubric.getByText('Barème cumulé : 8 / 8 pts')).toBeVisible();
  await workspace.getByRole('combobox', { name: 'Configuration IA' }).selectOption('teacher-qwen');

  const correct = workspace.getByRole('button', { name: 'Corriger directement l’image' });
  await expect(correct).toBeDisabled();
  // Asymmetric browser-decoded fixture: a CSS-only rotation would not alter pixels.
  const sourceBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 4;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#174f78';
    context.fillRect(0, 0, 4, 4);
    context.fillStyle = '#e4a23a';
    context.fillRect(4, 0, 4, 4);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await workspace.locator('#teacher-diagram-images').setInputFiles({
    name: 'mitose.png', mimeType: 'image/png', buffer: Buffer.from(sourceBase64, 'base64'),
  });
  await expect(workspace.getByText('1 page(s) sélectionnée(s)')).toBeVisible();
  await expect(workspace.getByRole('region', { name: 'Schéma original' })).toBeVisible();
  await expect(workspace.locator('.diagram-teacher-image-stage img')).toBeVisible();
  // The viewer shared with the normal correction is available from this workflow.
  await workspace.getByRole('button', { name: 'Agrandir', exact: true }).click();
  const viewer = page.getByRole('dialog', { name: 'Visualiseur de la page 1' });
  await expect(viewer).toBeVisible();
  const enlarged = viewer.getByRole('img', { name: 'Page 1 agrandie' });
  await expect.poll(() => enlarged.evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight])).toEqual([8, 4]);
  await viewer.getByRole('button', { name: 'Zoomer', exact: true }).click();
  await expect(viewer.getByText('125 %')).toBeVisible();
  await viewer.getByRole('button', { name: 'Tourner l’image à droite de 90 degrés' }).click();
  await expect.poll(() => enlarged.evaluate((image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight])).toEqual([4, 8]);
  await viewer.getByRole('button', { name: 'Fermer le visualiseur' }).click();
  await expect(workspace.getByText('Orientation 90°')).toBeVisible();
  const rotatedSrc = await workspace.locator('.diagram-teacher-image-stage img').getAttribute('src');
  const correctedImage = rotatedSrc!.split(',')[1];
  await expect(correct).toBeEnabled();
  await correct.click();

  const result = workspace.getByRole('region', { name: 'Proposition de correction du schéma' });
  await expect(result.getByRole('heading', { name: 'Note proposée : 0 / 8' })).toBeVisible();
  await expect(result.locator('.diagram-teacher-criterion')).toHaveCount(3);
  await expect(result.getByText('Non visible').first()).toBeVisible();
  expect(directRequests).toHaveLength(1);
  expect(directRequests[0]!.model).toBe('qwen3.5:4b');
  expect((directRequests[0]!.messages as any[])[0].images).toHaveLength(1);
  // A manual rotation is applied to the actual pixels sent for grading, not just CSS.
  expect((directRequests[0]!.messages as any[])[0].images[0]).toBe(correctedImage);
  expect(correctedImage).not.toBe(sourceBase64);
  await expect(workspace.getByRole('status').filter({ hasText: 'À vérifier par l’enseignant' })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    result.getByRole('button', { name: 'Exporter le résultat JSON' }).click(),
  ]);
  const reportText = await readFile(await download.path(), 'utf8');
  const report = JSON.parse(reportText);
  expect(report.method).toBe('image-direct-generative');
  expect(report.proposal.finalScore).toBe(0);
  expect(report.teacherValidated).toBe(false);
  expect(reportText).not.toContain('base64');
  expect(reportText).not.toContain('http://localhost');
  expect(reportText).not.toContain('apiKey');
  // Changing orientation after a grade invalidates its previous proposal.
  await workspace.getByRole('button', { name: 'Tourner le schéma à gauche de 90 degrés' }).click();
  await expect(result).toHaveCount(0);
  await expect(workspace.getByText('Orientation d’origine')).toBeVisible();
  await page.getByRole('button', { name: 'Correction', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mes devoirs' })).toBeVisible();
});

test('a remote scientific diagram model cannot receive photos without explicit opt-in', async ({ page }) => {
  await page.addInitScript((configuration) => localStorage.setItem(
    'companion-correcteur:ollama-profiles:v1',
    JSON.stringify([{ id: 'remote-qwen', name: 'Serveur collègue', mode: 'single',
      updatedAt: '2026-11-08T00:00:00Z', configuration }]),
  ), { ...baseConfiguration, endpoint: 'https://ai.example/v1/chat/completions', apiCompatible: true });

  await page.goto('/');
  await page.getByRole('button', { name: 'Schémas scientifiques' }).click();
  const workspace = page.getByLabel('Correction des schémas scientifiques');
  await workspace.getByRole('combobox', { name: 'Configuration IA' }).selectOption('remote-qwen');
  await workspace.locator('#teacher-diagram-images').setInputFiles({
    name: 'mitose.png', mimeType: 'image/png', buffer: onePixelPng,
  });
  await expect(workspace.getByText('Serveur non local.', { exact: false })).toBeVisible();
  await expect(workspace.getByRole('button', { name: 'Corriger directement l’image' })).toBeDisabled();
  await workspace.getByRole('checkbox', { name: /J’autorise l’envoi de ces images/ }).check();
  await expect(workspace.getByRole('button', { name: 'Corriger directement l’image' })).toBeEnabled();
  await workspace.getByRole('combobox', { name: 'Configuration IA' }).selectOption('');
  await workspace.getByRole('combobox', { name: 'Configuration IA' }).selectOption('remote-qwen');
  await expect(workspace.getByRole('checkbox', { name: /J’autorise l’envoi de ces images/ })).not.toBeChecked();
  await expect(workspace.getByRole('button', { name: 'Corriger directement l’image' })).toBeDisabled();
});

test('multi-page diagrams keep each orientation independent, and a new import resets it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Schémas scientifiques' }).click();
  const workspace = page.getByLabel('Correction des schémas scientifiques');
  const imageBase64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 4;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#174f78';
    context.fillRect(0, 0, 4, 4);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const buffer = Buffer.from(imageBase64, 'base64');
  await workspace.locator('#teacher-diagram-images').setInputFiles([
    { name: 'page-a.png', mimeType: 'image/png', buffer },
    { name: 'page-b.png', mimeType: 'image/png', buffer },
  ]);
  const first = workspace.getByRole('button', { name: 'Afficher la page 1' });
  const second = workspace.getByRole('button', { name: 'Afficher la page 2' });
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  await workspace.getByRole('button', { name: 'Agrandir', exact: true }).click();
  let viewer = page.getByRole('dialog', { name: 'Visualiseur de la page 1' });
  await viewer.getByRole('button', { name: 'Page suivante' }).click();
  viewer = page.getByRole('dialog', { name: 'Visualiseur de la page 2' });
  await expect(viewer).toBeVisible();
  await viewer.getByRole('button', { name: 'Tourner l’image à droite de 90 degrés' }).click();
  await expect.poll(() => viewer.getByRole('img', { name: 'Page 2 agrandie' }).evaluate(
    (image: HTMLImageElement) => [image.naturalWidth, image.naturalHeight],
  )).toEqual([4, 8]);
  await viewer.getByRole('button', { name: 'Page précédente' }).click();
  await expect(page.getByRole('dialog', { name: 'Visualiseur de la page 1' })).toBeVisible();
  await page.keyboard.press('Escape');
  await first.click();
  await expect(workspace.getByText('Orientation d’origine')).toBeVisible();
  await second.click();
  await expect(workspace.getByText('Orientation 90°')).toBeVisible();

  await workspace.locator('#teacher-diagram-images').setInputFiles({
    name: 'nouveau-schema.png', mimeType: 'image/png', buffer,
  });
  await expect(second).toHaveCount(0);
  await expect(workspace.getByText('Orientation d’origine')).toBeVisible();
  await expect(workspace.getByText('1 page(s) sélectionnée(s)')).toBeVisible();
});
