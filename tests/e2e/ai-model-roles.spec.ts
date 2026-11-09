import { expect, test, type Page } from '@playwright/test';
import { openActiveAssignment } from './helpers/teacher-workspace';

const settingsKey = 'companion-correcteur:ollama-configuration:v1';
const profilesKey = 'companion-correcteur:ollama-profiles:v1';
async function openEvaluator(page: Page) {
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  const editor = page.locator('.evaluation-config-editor');
  if (!await editor.getAttribute('open').then(value => value !== null)) await editor.locator('summary').first().click();
  return editor;
}

test('models stay independent across method switches, saved profiles, reload and teacher settings', async ({ page }) => {
  await page.goto('/');
  const editor = await openEvaluator(page);
  await expect(editor.getByLabel('Modèle génératif', { exact: true })).toBeVisible();
  await expect(editor.getByLabel('Modèle de lecture des images')).toBeHidden();
  await editor.getByLabel('Modèle génératif', { exact: true }).fill('qwen3.5:4b');
  await editor.getByLabel('Modèle décisionnel (facultatif)').fill('tev1:4b');
  const method = editor.getByLabel('Méthode de correction', { exact: true });
  await method.selectOption('decision');
  await expect(editor.getByRole('status').first()).toContainText('décisions : tev1:4b');
  await method.selectOption('generative');
  await expect(editor.getByLabel('Modèle génératif', { exact: true })).toHaveValue('qwen3.5:4b');
  await expect(editor.getByLabel('Modèle décisionnel (facultatif)')).toHaveValue('tev1:4b');
  await method.selectOption('decision');
  await editor.getByLabel('Nom de la configuration').fill('Mes deux modèles');
  await editor.getByRole('button', { name: 'Enregistrer la configuration' }).click();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}'), settingsKey)).toMatchObject({
    generativeModel: 'qwen3.5:4b', decisionModel: 'tev1:4b', analysisModel: 'tev1:4b', visionModel: 'qwen3.5:4b', correctionMethod: 'decision',
  });
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), profilesKey);
  expect(saved[0].configuration).toMatchObject({ generativeModel: 'qwen3.5:4b', decisionModel: 'tev1:4b', analysisModel: 'tev1:4b' });
  await page.reload();
  await openActiveAssignment(page);
  await page.getByRole('button', { name: /Réglages de l’IA locale|IA locale à configurer/ }).click();
  const panel = page.locator('#teacher-ai-settings-panel');
  await expect(panel.getByLabel('Modèle génératif', { exact: true })).toHaveValue('qwen3.5:4b');
  await expect(panel.getByLabel('Modèle décisionnel (facultatif)')).toHaveValue('tev1:4b');
  await panel.getByLabel('Méthode de correction', { exact: true }).selectOption('generative');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').analysisModel, settingsKey)).toBe('qwen3.5:4b');
});

test('a legacy decision profile keeps its reader and cannot accidentally use it for generative preparation', async ({ page }) => {
  await page.addInitScript(key => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ endpoint: 'http://localhost:11434', visionModel: 'glm-ocr', analysisModel: 'tev1:4b', correctionMethod: 'decision' }));
  }, settingsKey);
  await page.goto('/');
  const editor = await openEvaluator(page);
  await expect(editor.getByLabel('Modèle génératif', { exact: true })).toBeEmpty();
  await expect(editor.getByLabel('Modèle décisionnel (facultatif)')).toHaveValue('tev1:4b');
  await editor.getByLabel('Modèle génératif', { exact: true }).fill('qwen3.5:9b');
  await editor.getByText('Options avancées du test', { exact: true }).click();
  await expect(editor.getByLabel('Modèle de lecture des images')).toHaveValue('glm-ocr');
  await editor.getByLabel('Méthode de correction', { exact: true }).selectOption('generative');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}'), settingsKey)).toMatchObject({ analysisModel: 'qwen3.5:9b', visionModel: 'glm-ocr', decisionModel: 'tev1:4b' });
  await page.getByRole('button', { name: /Nouvelle configuration/ }).click();
  await expect(editor.getByLabel('Modèle génératif', { exact: true })).toBeEmpty();
  await expect(editor.getByLabel('Modèle décisionnel (facultatif)')).toBeEmpty();
});

test('barème preparation uses the generator even when correction is decision based', async ({ page }) => {
  await page.addInitScript(key => {
    localStorage.setItem(key, JSON.stringify({ endpoint: 'http://localhost:11434', visionModel: 'reader', analysisModel: 'tev1:4b', generativeModel: 'generator', decisionModel: 'tev1:4b', correctionMethod: 'decision' }));
  }, settingsKey);
  const models: string[] = [];
  await page.route('http://localhost:11434/**', async route => {
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-type': 'application/json' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (!route.request().url().endsWith('/api/chat')) return route.fulfill({ status: 200, headers, body: '{}' });
    const body = route.request().postDataJSON();
    models.push(body.model);
    const content = body.model === 'reader' ? 'Barème de biologie. Structure de la cellule : 2 points.' : JSON.stringify({ title: 'Biologie', criteria: [{ title: 'Structure de la cellule', description: 'Identifier les structures', maxPoints: 2 }] });
    await route.fulfill({ status: 200, headers, body: JSON.stringify({ message: { content }, done: true }) + (body.stream ? '\n' : '') });
  });
  await page.goto('/');
  await openActiveAssignment(page);
  await page.getByRole('tab', { name: 'Barème' }).click();
  await page.locator('#rubric-image-file').setInputFiles({ name: 'bareme.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+afoUAAAAASUVORK5CYII=', 'base64') });
  await expect.poll(() => models).toEqual(['reader', 'generator']);
  await expect(page.getByText(/Barème extrait : 1 critère/).first()).toBeVisible();
  expect(models).not.toContain('tev1:4b');
});
