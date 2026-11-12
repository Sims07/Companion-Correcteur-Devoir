import { expect, test } from '@playwright/test';

test('publishes an installable manifest and icons while keeping the teacher app usable', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('#root')).toBeVisible();

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBe('/manifest.webmanifest');
  const response = await request.get(manifestHref!);
  expect(response.ok()).toBe(true);
  const manifest = await response.json() as {
    name: string;
    display: string;
    icons: Array<{ src: string; sizes: string }>;
  };
  expect(manifest.name).toContain('Compagnon');
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) {
    const iconResponse = await request.get(new URL(icon.src, response.url()).toString());
    expect(iconResponse.ok()).toBe(true);
    expect(iconResponse.headers()['content-type']).toContain('image/png');
  }
});
