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

  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Inspecteur réseau/ }).click();
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

  await request.click();
  await page.getByRole('button', { name: 'Response' }).click();
  await expect(page.getByText(/"observed": true/)).toBeVisible();
});


test('pending HTTP requests are informational rather than warnings', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('companion-correcteur:network-inspector:v1', JSON.stringify([{
      id: 'network-pending-palette-fixture',
      method: 'POST',
      url: 'http://127.0.0.1:4173/network-pending-palette-fixture',
      intent: 'Analyse en cours',
      context: 'Palette B',
      startedAt: new Date().toISOString(),
      durationMs: null,
      state: 'pending',
      status: null,
      statusText: '',
      requestHeaders: {},
      responseHeaders: {},
      requestBody: '',
      responseBody: '',
      error: null,
    }]));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Inspecteur réseau/ }).click();
  await page.getByRole('group', { name: 'Filtrer par statut' }).getByRole('button', { name: 'En cours' }).click();
  const progress = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--ds-color-progress)';
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  });
  const row = page.getByRole('listitem').filter({ hasText: 'network-pending-palette-fixture' });
  await expect(row).toBeVisible();
  await expect(row.locator('.network-state.pending')).toHaveCSS('color', progress);
  await expect(page.locator('.network-pending-badge')).toHaveCSS('color', progress);
});
