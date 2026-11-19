import { openCustomTests } from './helpers/evaluation-models.ts';
import { expect, test } from '@playwright/test';

test('Debug exposes live HTTP requests and their response details', async ({ page }) => {
  await page.addInitScript(() => {
    const startedAt = new Date().toISOString();
    window.localStorage.setItem('companion-correcteur:network-inspector:v1', JSON.stringify([{
      id: 'network-inspector-intent-fixture',
      method: 'POST',
      url: 'http://127.0.0.1:4173/network-inspector-intent-fixture',
      intent: 'Vérifier le détail réseau',
      context: 'Test Playwright',
      startedAt,
      durationMs: 12,
      state: 'success',
      status: 200,
      statusText: 'OK',
      requestHeaders: {},
      responseHeaders: {},
      requestBody: '',
      responseBody: '',
      error: null,
    }, {
      id: 'network-inspector-timeout-fixture',
      method: 'POST',
      url: 'http://127.0.0.1:4173/ollama-timeout-fixture',
      intent: 'Évaluer les attendus du schéma',
      context: 'Modèle gemma4:12b',
      startedAt,
      durationMs: 1_200_000,
      state: 'error',
      status: null,
      statusText: '',
      requestHeaders: {},
      responseHeaders: {},
      requestBody: '',
      responseBody: '',
      error: 'Le modèle n’a pas envoyé de première réponse après 20 minutes.',
    }, {
      id: 'network-inspector-thinking-fixture',
      method: 'POST',
      url: 'https://localhost:11435/api/chat',
      intent: 'Vérifier et clarifier le barème',
      context: 'Modèle local : gemma4:12b',
      startedAt,
      durationMs: 5000,
      state: 'success',
      status: 200,
      statusText: 'OK',
      requestHeaders: {},
      responseHeaders: {},
      requestBody: '{"think":true,"stream":true}',
      responseBody: JSON.stringify({ message: { thinking: 'Je vérifie la cohérence scientifique.' }, done: false }) + '\n',
      thinkingBody: 'Je vérifie la cohérence scientifique.',
      error: null,
    }]));
  });
  await page.route('**/network-inspector-probe', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ observed: true }) });
  });
  await page.goto('/');
  await page.evaluate(async () => {
    await fetch('/network-inspector-probe', { method: 'GET' });
  });

  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await openCustomTests(page);
  await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('button', { name: 'Suivi & diagnostic' }).click();
  await page.getByRole('navigation', { name: 'Détails du suivi' }).getByRole('button', { name: 'Inspecteur réseau' }).click();
  await expect(page.getByRole('heading', { name: 'Inspecteur réseau' })).toBeVisible();
  const request = page.getByRole('listitem').filter({ hasText: 'network-inspector-probe' });
  await expect(request).toBeVisible();
  await expect(request).toContainText('200');
  await expect(request).toContainText('Intention non renseignée');
  await expect(request).toContainText(/\d{2}:\d{2}:\d{2}/);
  await request.click();
  const details = page.getByRole('region', { name: 'Détail de la requête' });
  const intentDetails = details.getByRole('region', { name: 'Intention de la requête' });
  await expect(intentDetails).toContainText('Intention non renseignée');

  const annotatedRequest = page.getByRole('listitem').filter({ hasText: 'network-inspector-intent-fixture' });
  await annotatedRequest.click();
  await expect(intentDetails).toContainText('Vérifier le détail réseau');
  await expect(intentDetails).toContainText('Test Playwright');

  const abortedRequest = page.getByRole('listitem').filter({ hasText: 'ollama-timeout-fixture' });
  await abortedRequest.click();
  await page.getByRole('button', { name: 'Payload' }).click();
  await expect(intentDetails.getByRole('alert')).toContainText('première réponse après 20 minutes');
  await expect(intentDetails.getByRole('alert')).toContainText('sans réponse HTTP');

  const thinkingRequest = page.getByRole('listitem').filter({ hasText: 'Vérifier et clarifier le barème' });
  await thinkingRequest.click();
  await page.getByRole('button', { name: 'Thinking' }).click();
  await expect(details.getByRole('heading', { name: 'Thinking reçu du modèle' })).toBeVisible();
  await expect(details).toContainText('Je vérifie la cohérence scientifique.');

  await request.click();
  await page.getByRole('button', { name: 'Response' }).click();
  await expect(page.getByText(/"observed": true/)).toBeVisible();
});
