import { expect, test } from '@playwright/test';
import { openCustomTests } from './helpers/evaluation-models.ts';

async function openModelEditor(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await openCustomTests(page);
  await page.getByRole('button', { name: 'Gérer les configurations' }).click();
  await page.getByRole('dialog', { name: 'Gérer les configurations IA' })
    .getByRole('button', { name: 'Modifier les réglages courants' }).click();
  return page.getByRole('dialog', { name: 'Créer ou modifier une configuration IA' });
}

test('configuration button calls Ollama /api/tags and shows the discovered models', async ({ page }) => {
  await page.goto('/');
  let calls = 0;
  await page.route('http://localhost:11434/api/tags', async (route) => {
    calls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({
      models: [{ name: 'test-vision:4b' }, { name: 'test-decision:3b' }],
    }) });
  });
  const editor = await openModelEditor(page);
  await editor.getByRole('button', { name: 'Tester la connexion et détecter les modèles' }).click();
  await expect(editor.locator('.ds-status-notice--success')).toContainText('2 modèle(s) disponible(s)');
  await expect(editor.locator('#evaluation-analysis-model option')).toContainText(['Choisir un modèle', 'test-vision:4b', 'test-decision:3b']);
  expect(calls).toBe(1);
});

test('blocked browser connection is reported beside the button in the modal', async ({ page }) => {
  await page.goto('/');
  await page.route('http://localhost:11434/api/tags', route => route.abort('blockedbyclient'));
  const editor = await openModelEditor(page);
  await editor.getByRole('button', { name: 'Tester la connexion et détecter les modèles' }).click();
  await expect(editor.locator('.ds-status-notice--error')).toContainText('Impossible de joindre le serveur IA');
  await expect(editor.getByRole('button', { name: 'Tester la connexion et détecter les modèles' })).toBeEnabled();
});

test('teacher settings reports connection failure inline instead of a distant error banner', async ({ page }) => {
  await page.goto('/');
  await page.locator('.assignment-overview-card').first()
    .getByRole('button', { name: /Reprendre le devoir/ }).click();
  await page.getByRole('button', { name: /Réglages IA|Configurer l’IA/ }).click();
  await page.route('http://localhost:11434/api/tags', route => route.abort('failed'));
  const panel = page.locator('#teacher-ai-settings-panel');
  await panel.getByRole('button', { name: 'Tester la connexion et détecter les modèles' }).click();
  await expect(panel.locator('.ds-status-notice--error')).toContainText('Impossible de joindre le serveur IA');
  await expect(panel.getByRole('button', { name: 'Tester la connexion et détecter les modèles' })).toBeEnabled();
});

test('LM Studio Responses lists models when the native catalogue hangs behind the HTTPS proxy', async ({ page }) => {
  await page.goto('/');
  const editor = await openModelEditor(page);
  const origin = 'https://macmini.example:8443';
  const requests: string[] = [];
  let releaseNativeRequest!: () => void;
  const nativeRequest = new Promise<void>(resolve => { releaseNativeRequest = resolve; });
  await page.route(origin + '/**', async route => {
    const path = new URL(route.request().url()).pathname;
    requests.push(route.request().method() + ' ' + path);
    if (path === '/api/v1/models') {
      await nativeRequest;
      await route.abort().catch(() => {});
      return;
    }
    await route.fulfill({ json: { data: [{ id: 'gemma-local' }] }, headers: { 'access-control-allow-origin': '*' } });
  });
  await editor.getByLabel('Connexion IA').selectOption('lmstudio-chat');
  await editor.getByLabel('URL de l’API IA').fill(origin + '/v1/responses');
  await editor.getByLabel('Modèle génératif', { exact: true }).fill('modele-manuel');
  try {
    await editor.getByRole('button', { name: 'Tester la connexion et détecter les modèles' }).dblclick();
    await expect(editor.getByRole('button', { name: 'Connexion en cours…' })).toBeDisabled();
    await expect(editor.locator('.ds-status-notice--success')).toContainText('1 modèle(s) disponible(s)');
    await expect(editor.locator('#evaluation-analysis-model option')).toContainText(['Choisir un modèle', 'modele-manuel', 'gemma-local']);
    await expect(editor.locator('#evaluation-analysis-model')).toHaveValue('modele-manuel');
    expect(requests).toEqual(['GET /api/v1/models', 'GET /v1/models']);
  } finally {
    releaseNativeRequest();
  }
});

test('cancels catalogue discovery and keeps the configured model', async ({ page }) => {
  await page.goto('/');
  const editor = await openModelEditor(page);
  let releaseResponse!: () => void;
  const pendingResponse = new Promise<void>(resolve => { releaseResponse = resolve; });
  await page.route('http://localhost:11434/api/tags', async route => {
    await pendingResponse;
    await route.fulfill({ json: { models: [{ name: 'reponse-tardive' }] }, headers: { 'access-control-allow-origin': '*' } })
      .catch(() => {});
  });
  await editor.getByLabel('Modèle génératif', { exact: true }).fill('modele-manuel');
  try {
    const request = page.waitForRequest('http://localhost:11434/api/tags');
    await editor.getByRole('button', { name: 'Tester la connexion et détecter les modèles' }).click();
    await request;
    await editor.getByRole('button', { name: 'Annuler le test de connexion' }).click();
    await expect(editor.getByText('Test de connexion annulé.')).toBeVisible();
    await expect(editor.getByRole('button', { name: 'Tester la connexion et détecter les modèles' })).toBeEnabled();
    await expect(editor.locator('#evaluation-analysis-model')).toHaveValue('modele-manuel');
  } finally {
    releaseResponse();
  }
});
