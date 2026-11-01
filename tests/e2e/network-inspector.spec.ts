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
    }]));
  });
  await page.route('**/network-inspector-probe', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ observed: true }) });
  });
  await page.goto('/');
  await page.evaluate(async () => {
    await fetch('/network-inspector-probe', { method: 'GET' });
  });

  await page.getByRole('button', { name: 'Inspecteur réseau' }).click();
  await expect(page.getByRole('heading', { name: 'Inspecteur réseau' })).toBeVisible();
  const request = page.getByRole('listitem').filter({ hasText: 'network-inspector-probe' });
  await expect(request).toBeVisible();
  await expect(request).toContainText('200');
  await expect(request).toContainText('Intention non renseignée');
  await expect(request).toContainText(/\\d{2}:\\d{2}:\\d{2}/);
  await request.click();
  const details = page.getByRole('region', { name: 'Détail de la requête' });
  const intentDetails = details.getByRole('region', { name: 'Intention de la requête' });
  await expect(intentDetails).toContainText('Intention non renseignée');

  const annotatedRequest = page.getByRole('listitem').filter({ hasText: 'network-inspector-intent-fixture' });
  await annotatedRequest.click();
  await expect(intentDetails).toContainText('Vérifier le détail réseau');
  await expect(intentDetails).toContainText('Test Playwright');

  await request.click();
  await page.getByRole('button', { name: 'Response' }).click();
  await expect(page.getByText(/"observed": true/)).toBeVisible();
});
