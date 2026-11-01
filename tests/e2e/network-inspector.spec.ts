import { expect, test } from '@playwright/test';

test('Debug exposes live HTTP requests and their response details', async ({ page }) => {
  await page.route('**/network-inspector-probe', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ observed: true }) });
  });
  await page.goto('/');
  await page.evaluate(async () => {
    const { annotateNetworkRequest } = await import('/src/ports/networkRequestMetadata.ts');
    await fetch('/network-inspector-probe', annotateNetworkRequest({ method: 'GET' }, 'Vérifier le détail réseau', 'Test Playwright'));
  });

  await page.getByRole('button', { name: 'Inspecteur réseau' }).click();
  await expect(page.getByRole('heading', { name: 'Inspecteur réseau' })).toBeVisible();
  const request = page.getByRole('listitem').filter({ hasText: 'network-inspector-probe' });
  await expect(request).toBeVisible();
  await expect(request).toContainText('200');
  await expect(request).toContainText('Intention non renseignée');
  await expect(request).toContainText(/\d{2}:\d{2}:\d{2}/);
  await request.click();
  const details = page.getByRole('region', { name: 'Détail de la requête' });
  await expect(details.getByRole('region', { name: 'Intention de la requête' })).toContainText('Vérifier le détail réseau');
  await expect(details.getByRole('region', { name: 'Intention de la requête' })).toContainText('Test Playwright');
  await page.getByRole('button', { name: 'Response' }).click();
  await expect(page.getByText(/"observed": true/)).toBeVisible();
});
