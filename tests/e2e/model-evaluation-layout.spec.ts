import { expect, test, type Page } from '@playwright/test';

test('evaluation uses unobtrusive view navigation without fake numbered steps', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();

  const navigation = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await expect(navigation.getByRole('button', { name: 'Tests' })).toHaveAttribute('aria-current', 'page');
  await expect(navigation.getByRole('button', { name: 'Exécution', exact: true })).toBeHidden();
  await expect(navigation.getByRole('button', { name: 'Résultats', exact: true })).toBeHidden();
  await expect(navigation.locator('button > span')).toHaveCount(0);

  await expect.poll(() => navigation.getByRole('button', { name: 'Tests' }).evaluate((button) => {
    const selected = getComputedStyle(button);
    const reference = document.createElement('div');
    reference.style.borderBottomColor = 'var(--ds-color-brand-700)';
    reference.style.color = 'var(--ds-color-danger)';
    document.body.append(reference);
    const tokens = getComputedStyle(reference);
    const isSelection = selected.borderBottomColor === tokens.borderBottomColor;
    const notError = selected.borderBottomColor !== tokens.color;
    reference.remove();
    return { isSelection, notError, light: selected.minHeight === '38px' };
  })).toEqual({ isSelection: true, notError: true, light: true });

  await navigation.getByRole('button', { name: 'Campagnes de test' }).click();
  await expect(navigation.getByRole('button', { name: 'Campagnes de test' })).toHaveAttribute('aria-current', 'page');
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
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();

  const navigation = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await expect(navigation.getByRole('button')).toHaveCount(3);
  await expect(navigation.getByRole('button', { name: 'Radar des candidats' })).toBeVisible();

  for (const width of [1440, 1100, 900, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expectUnifiedEvaluationCanvas(page);
  }

  await navigation.getByRole('button', { name: /Campagnes de test/ }).click();
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
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
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


test('semantic Atelier B statuses agree across network, evaluation archive and storage', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.evaluate(() => {
    const fixture = document.createElement('section');
    fixture.className = 'ai-tools-view evaluation-workspace-shell technical-status-fixture';
    fixture.innerHTML = `
      <div class="network-state pending">En attente du serveur</div>
      <div class="network-state error">Requête échouée</div>
      <div class="observability-local-badge"><span></span>Données locales</div>
      <div class="evaluation-archive-feedback is-saving">Enregistrement…</div>
      <div class="evaluation-archive-feedback is-saved">Enregistré</div>
      <div class="evaluation-archive-feedback is-without-images">Espace insuffisant</div>
      <div class="evaluation-archive-feedback is-failed">Échec</div>
      <div class="storage-usage-panel">
        <div class="storage-quota-track"><span style="width:42%"></span></div>
        <p class="storage-usage-notice is-warning">Quota élevé</p>
        <p class="storage-usage-notice is-error">Erreur de mesure</p>
      </div>`;
    document.body.append(fixture);
  });
  const token = (name: string) => page.evaluate((variable) => {
    const probe = document.createElement('div');
    probe.style.color = `var(${variable})`;
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, name);
  const [progress, success, warning, danger, neutral] = await Promise.all([
    token('--ds-color-progress'),
    token('--ds-color-success'),
    token('--ds-color-warning'),
    token('--ds-color-danger'),
    token('--ds-color-text-muted'),
  ]);
  const fixture = page.locator('.technical-status-fixture');
  await expect(fixture.locator('.network-state.pending')).toHaveCSS('color', progress);
  await expect(fixture.locator('.network-state.error')).toHaveCSS('color', danger);
  await expect(fixture.locator('.observability-local-badge span')).toHaveCSS('background-color', neutral);
  await expect(fixture.locator('.evaluation-archive-feedback.is-saving')).toHaveCSS('border-left-color', progress);
  await expect(fixture.locator('.evaluation-archive-feedback.is-saved')).toHaveCSS('border-left-color', success);
  await expect(fixture.locator('.evaluation-archive-feedback.is-without-images')).toHaveCSS('border-left-color', warning);
  await expect(fixture.locator('.evaluation-archive-feedback.is-failed')).toHaveCSS('border-left-color', danger);
  await expect(fixture.locator('.storage-quota-track > span')).toHaveCSS('background-color', progress);
  await expect(fixture.locator('.storage-usage-notice.is-warning')).toHaveCSS('border-left-color', warning);
  await expect(fixture.locator('.storage-usage-notice.is-error')).toHaveCSS('border-left-color', danger);
});
