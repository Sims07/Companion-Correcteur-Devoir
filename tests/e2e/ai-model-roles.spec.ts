import { openCustomTests } from './helpers/evaluation-models.ts';
import { expect, test, type Page } from '@playwright/test';
import { openActiveAssignment } from './helpers/teacher-workspace';

const settingsKey = 'companion-correcteur:ollama-configuration:v1';
const profilesKey = 'companion-correcteur:ollama-profiles:v1';
async function openEvaluator(page: Page) {
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await openCustomTests(page);
  await page.getByRole('button', { name: 'Gérer les configurations' }).click();
  await page.getByRole('dialog', { name: 'Gérer les configurations IA' })
    .getByRole('button', { name: 'Modifier les réglages courants' }).click();
  return page.getByRole('dialog', { name: 'Créer ou modifier une configuration IA' });
}

test('models stay independent across method switches, saved profiles, reload and teacher settings', async ({ page }, testInfo) => {
  await page.goto('/');
  const editor = await openEvaluator(page);
  await expect(editor.getByLabel('Modèle génératif', { exact: true })).toBeVisible();
  await expect(editor.getByLabel('Modèle de lecture des images')).toBeHidden();
  const reasoning = editor.getByLabel('Raisonnement', { exact: true });
  await expect(reasoning).toHaveValue('off');
  await reasoning.selectOption('on');
  await editor.getByLabel('Connexion IA').selectOption('openai');
  await expect(reasoning).toHaveValue('medium');
  await reasoning.selectOption('off');
  await expect(reasoning).toHaveValue('off');
  await reasoning.selectOption('medium');
  await editor.getByLabel('Connexion IA').selectOption('ollama');
  await expect(reasoning).toHaveValue('on');
  await editor.getByText('Méthode de correction et modèle décisionnel', { exact: true }).click();
  await editor.getByLabel('Modèle génératif', { exact: true }).fill('qwen3.5:4b');
  await editor.getByLabel('Modèle décisionnel (facultatif)').fill('tev1:4b');
  const method = editor.getByLabel('Méthode de correction', { exact: true });
  await method.selectOption('decision');
  await expect(editor.getByRole('status').first()).toContainText('décisions : tev1:4b');
  await method.selectOption('generative');
  await expect(editor.getByLabel('Modèle génératif', { exact: true })).toHaveValue('qwen3.5:4b');
  await expect(editor.getByLabel('Modèle décisionnel (facultatif)')).toHaveValue('tev1:4b');
  const methodOptions = editor.getByText('Méthode de correction et modèle décisionnel', { exact: true });
  if (!(await method.isVisible())) await methodOptions.click();
  await method.selectOption('decision');
  await editor.getByLabel('Nom de la configuration').fill('Mes deux modèles');
  await editor.getByRole('button', { name: 'Enregistrer la configuration' }).click();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}'), settingsKey)).toMatchObject({
    generativeModel: 'qwen3.5:4b', decisionModel: 'tev1:4b', analysisModel: 'tev1:4b', visionModel: 'qwen3.5:4b', correctionMethod: 'decision', analysisThinking: true,
  });
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), profilesKey);
  expect(saved[0].configuration).toMatchObject({ generativeModel: 'qwen3.5:4b', decisionModel: 'tev1:4b', analysisModel: 'tev1:4b', analysisThinking: true });
  await page.reload();
  await openActiveAssignment(page);
  await page.getByRole('button', { name: /Réglages IA|Configurer l’IA/ }).click();
  const panel = page.locator('#teacher-ai-settings-panel');
  await expect(panel.getByLabel('Modèle génératif', { exact: true })).toHaveValue('qwen3.5:4b');
  await expect(panel.getByLabel('Modèle décisionnel (facultatif)')).toHaveValue('tev1:4b');
  const teacherReasoning = panel.getByLabel('Raisonnement', { exact: true });
  await expect(teacherReasoning).toHaveValue('on');
  await teacherReasoning.selectOption('off');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').analysisThinking, settingsKey)).toBe(false);
  await panel.getByLabel('Méthode de correction', { exact: true }).selectOption('generative');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').analysisModel, settingsKey)).toBe('qwen3.5:4b');
  await page.screenshot({ path: testInfo.outputPath('ai-model-roles-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel.getByLabel('Modèle génératif', { exact: true })).toBeVisible();
  await expect(panel.getByLabel('Raisonnement', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('ai-model-roles-mobile.png'), fullPage: true });
});

test('LM Studio high reasoning effort is saved and restored for biology evaluation profiles', async ({ page }) => {
  await page.goto('/');
  let editor = await openEvaluator(page);
  await editor.getByLabel('Connexion IA').selectOption('lmstudio-chat');
  const effort = editor.getByLabel('Raisonnement', { exact: true });
  await expect(effort).toHaveValue('default');
  await effort.selectOption('high');
  await editor.getByText('Réglages avancés de génération', { exact: true }).click();
  await editor.getByLabel('Plafond de sortie par correction (tokens)').fill('16384');
  await editor.getByLabel('Nom de la configuration').fill('Gemma high');
  await editor.getByRole('button', { name: 'Enregistrer la configuration' }).click();
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]'), profilesKey);
  expect(saved.find((profile: { name: string }) => profile.name === 'Gemma high')?.configuration).toMatchObject({
    apiCompatible: true, analysisThinking: true, analysisReasoningEffort: 'high', gradingOutputTokens: 16384,
  });
  await page.reload();
  editor = await openEvaluator(page);
  await editor.getByLabel('Charger un profil existant').selectOption(saved.find((profile: { name: string }) => profile.name === 'Gemma high').id);
  await expect(editor.getByLabel('Raisonnement', { exact: true })).toHaveValue('high');
  await editor.getByLabel('Raisonnement', { exact: true }).selectOption('default');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').omitReasoningParameter, settingsKey)).toBe(true);
  await expect(editor.getByLabel('Plafond de sortie par correction (tokens)')).toHaveValue('16384');
});

test('teacher can turn off Thinking for LM Studio and keep the choice after reload', async ({ page }) => {
  await page.addInitScript(key => {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, JSON.stringify({
      endpoint: 'https://macmini.local:8443/v1/chat/completions',
      apiCompatible: true,
      generativeModel: 'google/gemma-4-12b-qat',
      analysisModel: 'google/gemma-4-12b-qat',
      visionModel: 'google/gemma-4-12b-qat',
      analysisThinking: true,
      correctionMethod: 'generative',
    }));
  }, settingsKey);
  await page.goto('/');
  await openActiveAssignment(page);
  await page.getByRole('button', { name: /Réglages IA|Configurer l’IA/ }).click();
  let panel = page.locator('#teacher-ai-settings-panel');
  const reasoning = panel.getByLabel('Raisonnement', { exact: true });
  await expect(reasoning).toHaveValue('medium');
  await reasoning.selectOption('off');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}').analysisThinking, settingsKey)).toBe(false);
  await page.reload();
  await openActiveAssignment(page);
  await page.getByRole('button', { name: /Réglages IA|Configurer l’IA/ }).click();
  panel = page.locator('#teacher-ai-settings-panel');
  await expect(panel.getByLabel('Raisonnement', { exact: true })).toHaveValue('off');
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
  await page.getByText('Importer un barème depuis un document', { exact: true }).click();
  await page.locator('#rubric-image-file').setInputFiles({ name: 'bareme.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+afoUAAAAASUVORK5CYII=', 'base64') });
  await expect.poll(() => models).toEqual(['reader', 'generator']);
  await expect(page.locator('.criterion-editor')).toHaveCount(1);
  await expect(page.locator('#rubric-title')).toHaveValue('Biologie');
  await page.getByText('Voir le JSON brut extrait', { exact: true }).click();
  await expect(page.getByText('Réponse de « generator » avant validation', { exact: false })).toBeVisible();
  expect(models).not.toContain('tev1:4b');
});

test('LM Studio detects Gemma before a model is selected and reports its declared capabilities', async ({ page }) => {
  await page.route('**/api/v1/models', route => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*' },
    json: { models: [{ type: 'llm', key: 'google/gemma', capabilities: {
      vision: true, trained_for_tool_use: true, reasoning: { allowed_options: ['off', 'on'] },
    } }] },
  }));
  await page.goto('/');
  await openActiveAssignment(page);
  await page.getByRole('button', { name: /Réglages IA|Configurer l’IA/ }).click();
  const panel = page.locator('#teacher-ai-settings-panel');
  await panel.getByLabel('Connexion IA').selectOption('lmstudio-chat');
  await expect(panel.getByLabel('Modèle génératif')).toBeEmpty();
  await panel.getByRole('button', { name: 'Tester la connexion et détecter les modèles' }).click();
  await expect(panel.getByText(/1 modèle\(s\) disponible\(s\)/)).toBeVisible();
  await panel.getByLabel('Modèle génératif').selectOption('google/gemma');
  await expect(panel.getByText(/vision prise en charge.*appels d’outils/)).toBeVisible();
  await panel.getByLabel('Raisonnement', { exact: true }).selectOption('on');
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '{}'), settingsKey)).toMatchObject({
    analysisModel: 'google/gemma', analysisThinking: true, analysisReasoningEffort: 'on',
  });
  await expect(panel.getByRole('button', { name: /précharger/i })).toHaveCount(0);
});
