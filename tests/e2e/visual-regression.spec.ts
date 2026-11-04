import { expect, test, type Page, type TestInfo } from '@playwright/test';

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => {
    const viewport = document.documentElement.clientWidth;
    const overflowingElements = [...document.querySelectorAll<HTMLElement>('body *')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          element: element.tagName.toLowerCase(),
          className: typeof element.className === 'string' ? element.className : '',
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter((element) => element.right > viewport + 1 && element.width > 0)
      .sort((left, right) => right.right - left.right)
      .slice(0, 6);

    return {
      viewport,
      document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      overflowingElements,
    };
  });

  expect(
    dimensions.document,
    `Unexpected horizontal overflow: document ${dimensions.document}px, viewport ${dimensions.viewport}px`,
  ).toBeLessThanOrEqual(dimensions.viewport);
}

async function captureVisualEvidence(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: true,
    animations: 'disabled',
  });
}

async function expectSharedSurfaceTokens(page: Page, selector: string): Promise<void> {
  const styles = await page.locator(selector).first().evaluate((element) => {
    const computed = getComputedStyle(element);
    return {
      backgroundColor: computed.backgroundColor,
      borderRadius: computed.borderRadius,
      borderColor: computed.borderColor,
    };
  });

  expect(styles.backgroundColor).toBe('rgb(255, 255, 255)');
  expect(styles.borderRadius).toBe('14px');
  expect(['rgb(223, 232, 222)', 'rgb(125, 169, 132)']).toContain(styles.borderColor);
}

test.describe('visual regression contracts', () => {
  test('teacher library and copy workspace remain readable at desktop and mobile widths', async ({ page }, testInfo) => {
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');

      await expect(page.getByRole('heading', { name: 'Mes devoirs' })).toBeVisible();
      await expect(page.locator('.assignment-overview-card')).toBeVisible();
      await expectSharedSurfaceTokens(page, '.assignment-overview-card');
      await expectNoHorizontalOverflow(page);
      await captureVisualEvidence(page, testInfo, `teacher-library-${viewport.name}.png`);

      await page.locator('.assignment-overview-card').getByRole('button', { name: /Reprendre le devoir/ }).click();
      await expect(page.getByRole('heading', { name: 'Suivi des copies' })).toBeVisible();
      await expect(page.locator('.teacher-workspace-navigation')).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await captureVisualEvidence(page, testInfo, `teacher-copies-${viewport.name}.png`);
    }
  });

  test('model evaluation keeps its shared surface language at desktop and mobile widths', async ({ page }, testInfo) => {
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      await page.getByRole('button', { name: 'Évaluation des modèles' }).click();

      await expect(page.getByRole('heading', { name: 'Évaluation des modèles' })).toBeVisible();
      await expect(page.locator('.evaluation-workspace-shell')).toBeVisible();
      await expect(page.locator('.evaluation-config-workspace')).toBeVisible();
      await expectSharedSurfaceTokens(page, '.evaluation-config-workspace');
      await expectNoHorizontalOverflow(page);
      await captureVisualEvidence(page, testInfo, `model-evaluation-${viewport.name}.png`);
    }
  });

  test('observability remains readable at desktop and mobile widths', async ({ page }, testInfo) => {
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');
      await page.getByRole('button', { name: 'Observabilité' }).click();

      await expect(page.getByRole('heading', { name: 'Observabilité' })).toBeVisible();
      await expect(page.locator('.observability-workspace')).toBeVisible();
      await expect(page.locator('.observability-kpi').first()).toBeVisible();
      await expectSharedSurfaceTokens(page, '.observability-panel');
      await expectNoHorizontalOverflow(page);
      await captureVisualEvidence(page, testInfo, `observability-${viewport.name}.png`);
    }
  });

  test('reduced-motion preference removes non-essential card transitions', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    await page.getByRole('button', { name: 'Observabilité' }).click();
    await expect(page.locator('.observability-kpi').first()).toBeVisible();

    const reducedMotion = await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const transitionDuration = await page.locator('.observability-kpi').first().evaluate(
      (element) => getComputedStyle(element).transitionDuration,
    );

    expect(reducedMotion).toBe(true);
    expect(transitionDuration.split(',').every((duration) => Number.parseFloat(duration) <= 0.00001)).toBe(true);
  });
});
