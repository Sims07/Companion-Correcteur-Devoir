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
      responseBody: JSON.stringify({ message: { thinking: 'Je vérifie la cohérence scientifique.' }, done: false }) + '\n' +
        JSON.stringify({ message: { content: '{"score":' }, done: false }) + '\n' +
        JSON.stringify({ message: { content: '10}' }, done: false }) + '\n',
      thinkingBody: 'Je vérifie la cohérence scientifique.\n'.repeat(100),
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

  await page.setViewportSize({ width: 1440, height: 1150 });
  const thinkingRequest = page.getByRole('listitem').filter({ hasText: 'Vérifier et clarifier le barème' });
  await thinkingRequest.click();
  await page.getByRole('button', { name: 'Thinking' }).click();
  await expect(details.getByRole('heading', { name: 'Thinking reçu du modèle' })).toBeVisible();
  await expect(details).toContainText('Je vérifie la cohérence scientifique.');
  // A long streamed thinking trace fills the available panel instead of stopping at 330 px.
  const thinkingArea = details.locator('.network-detail-section pre');
  const thinkingSize = await thinkingArea.evaluate((pre) => {
    const panel = pre.closest('.network-request-details')!.getBoundingClientRect();
    const content = pre.getBoundingClientRect();
    return { height: content.height, bottomGap: panel.bottom - content.bottom, scrollHeight: pre.scrollHeight, clientHeight: pre.clientHeight };
  });
  expect(thinkingSize.height).toBeGreaterThan(330);
  expect(thinkingSize.bottomGap).toBeLessThan(36);
  expect(thinkingSize.scrollHeight).toBeGreaterThan(thinkingSize.clientHeight);
  await page.getByRole('button', { name: 'Message' }).click();
  await expect(details.getByRole('heading', { name: 'Message reçu du modèle' })).toBeVisible();
  await expect(details).toContainText('"score": 10');
  const messageBottomGap = await details.locator('.network-detail-section pre').evaluate((pre) =>
    pre.closest('.network-request-details')!.getBoundingClientRect().bottom - pre.getBoundingClientRect().bottom);
  expect(messageBottomGap).toBeLessThan(36);

  // The live browser observer must decode local LM Studio SSE instead of
  // showing empty Message/Thinking tabs while Response contains data frames.
  const sse = [
    { choices: [{ delta: { role: 'assistant', content: '' } }] },
    { choices: [{ delta: { reasoning_content: 'Raisonnement local' } }] },
    { choices: [{ delta: { content: '{"grade":9.5}' }, finish_reason: 'stop' }] },
  ].map(event => 'data: ' + JSON.stringify(event) + '\n\n').join('') + 'data: [DONE]\n\n';
  await page.route('**/v1/chat/completions', async (route) => {
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse });
  });
  await page.evaluate(async () => {
    await fetch('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'google/gemma-4-12b-qat', stream: true, reasoning_effort: 'none',
        messages: [{ role: 'user', content: 'Note la copie' }] }),
    }).then(response => response.text());
  });
  const lmStudioRequest = page.getByRole('listitem').filter({ hasText: '/v1/chat/completions' });
  await expect(lmStudioRequest).toBeVisible();
  await lmStudioRequest.click();
  await expect(intentDetails).toContainText('Raisonnement demandé');
  await expect(intentDetails).toContainText('reasoning_effort: none');
  await page.getByRole('button', { name: 'Message' }).click();
  await expect(details.getByRole('heading', { name: 'Message reçu du modèle' })).toBeVisible();
  await expect(details.locator('.network-detail-section pre')).toContainText('"grade": 9.5');
  await page.getByRole('button', { name: 'Thinking' }).click();
  await expect(details.locator('.network-detail-section pre')).toContainText('Raisonnement local');

  await request.click();
  await page.getByRole('button', { name: 'Response' }).click();
  await expect(page.getByText(/"observed": true/)).toBeVisible();
});
