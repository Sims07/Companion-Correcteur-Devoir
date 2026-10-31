import { expect, test } from '@playwright/test';

test('Debug exposes live HTTP requests and their response details', async ({ page }) => {
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
  await request.click();
  await page.getByRole('button', { name: 'Response' }).click();
  await expect(page.getByText(/"observed": true/)).toBeVisible();
});
