import { expect, test, type Page } from '@playwright/test';

test('active evaluation navigation is informational rather than a red error or brand accent', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();

  const navigation = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  for (const label of [/Configuration/, /Exécution/, /Résultats/]) {
    await navigation.getByRole('button', { name: label }).click();
    const state = await page.evaluate(() => {
      const active = document.querySelector<HTMLElement>('.evaluation-step-nav [aria-current="step"]');
      const probe = document.createElement('div');
      probe.style.background = 'var(--ds-color-progress-surface)';
      probe.style.border = '1px solid var(--ds-color-progress-border)';
      probe.style.color = 'var(--ds-color-danger)';
      document.body.append(probe);
      const current = active ? getComputedStyle(active) : null;
      const expected = getComputedStyle(probe);
      const result = {
        active: Boolean(active),
        background: current?.backgroundColor,
        border: current?.borderTopColor,
        expectedBackground: expected.backgroundColor,
        expectedBorder: expected.borderTopColor,
        error: expected.color,
      };
      probe.remove();
      return result;
    });
    expect(state.active).toBe(true);
    expect(state.background).toBe(state.expectedBackground);
    expect(state.border).toBe(state.expectedBorder);
    expect(state.border).not.toBe(state.error);
  }
});

async function expectUnifiedEvaluationCanvas(page: Page): Promise<void> {
  const layout = await page.evaluate(() => {
    const selectors = [
      '.evaluation-step-nav',
      '.evaluation-config-workspace',
      '#evaluation-rubric',
      '.rubric-editor',
      '#evaluation-copy',
      '.setup-grid',
      '.evaluation-launch-panel',
    ];
    const boxes = selectors.map((selector) => {
      const node = document.querySelector<HTMLElement>(selector);
      if (!node) return { selector, missing: true, left: 0, right: 0, top: 0, bottom: 0 };
      const rect = node.getBoundingClientRect();
      return { selector, missing: false, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
    const nav = document.querySelector<HTMLElement>('.evaluation-step-nav');
    return {
      boxes,
      float: nav ? getComputedStyle(nav).float : '',
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
    };
  });
  expect(layout.float).toBe('none');
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
  expect(layout.boxes.filter((box) => box.missing)).toEqual([]);
  const [navigation, ...sections] = layout.boxes;
  expect(navigation).toBeDefined();
  for (const section of sections) {
    expect(Math.abs(section.left - navigation.left), section.selector + ' left alignment').toBeLessThanOrEqual(2);
    expect(Math.abs(section.right - navigation.right), section.selector + ' right alignment').toBeLessThanOrEqual(2);
  }
  for (let index = 1; index < layout.boxes.length; index += 1) {
    expect(layout.boxes[index].top, layout.boxes[index].selector + ' overlaps previous section')
      .toBeGreaterThanOrEqual(layout.boxes[index - 1].bottom - 2);
  }
}

test('model evaluation uses one aligned, non-floating canvas from profiles to launch', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();

  const navigation = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await expect(navigation.getByRole('button')).toHaveCount(4);

  for (const width of [1440, 1100, 900, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expectUnifiedEvaluationCanvas(page);
  }

  await navigation.getByRole('button', { name: /Analyse & historique/ }).click();
  await expect(page.locator('.evaluation-results-workspace')).toHaveAttribute('data-evaluation-step', 'history');
  const historicalLayout = await page.evaluate(() => {
    const nav = document.querySelector('.evaluation-step-nav')!.getBoundingClientRect();
    const workspace = document.querySelector('.evaluation-results-workspace')!.getBoundingClientRect();
    return { left: Math.abs(nav.left - workspace.left), right: Math.abs(nav.right - workspace.right), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  expect(historicalLayout.left).toBeLessThanOrEqual(2);
  expect(historicalLayout.right).toBeLessThanOrEqual(2);
  expect(historicalLayout.overflow).toBeLessThanOrEqual(0);
});

test('analysis-only experiment asks for a transcription instead of an irrelevant copy upload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  await page.getByRole('group', { name: 'Type d’évaluation' }).getByRole('button', { name: /Analyse seule/ }).click();

  await expect(page.getByRole('heading', { name: 'Transcription à noter' })).toBeVisible();
  await expect(page.locator('#evaluation-copy')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Préparer le barème de correction' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Lancer l’expérience' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Lancer l’expérience' }).getByRole('button', { name: /Évaluer le modèle d’analyse/ })).toBeDisabled();

  await page.getByRole('group', { name: 'Type d’évaluation' }).getByRole('button', { name: /Vision seule/ }).click();
  await expect(page.locator('#evaluation-copy')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Lancer l’expérience' })).toBeVisible();
});
