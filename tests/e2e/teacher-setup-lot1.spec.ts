import { expect, test } from '@playwright/test';

test('creation starts with a concise form, validates the title and then opens the rubric', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Créer un devoir/ }).click();
  await expect(page.getByRole('heading', { name: 'Préparer une évaluation' })).toBeVisible();
  await expect(page.locator('.criterion-editor')).toHaveCount(0);
  await page.getByRole('button', { name: /Créer et préparer le barème/ }).click();
  await expect(page.getByRole('alert')).toContainText('Donnez un nom');
  await page.getByLabel(/Nom du devoir/).fill('Partiel de mitose');
  await page.getByLabel('Niveau', { exact: true }).selectOption('Université — Licence 1');
  await page.getByLabel('Objectif pédagogique').fill('Identifier les étapes de la mitose.');
  await page.getByRole('button', { name: /Créer et préparer le barème/ }).click();
  await expect(page.getByRole('heading', { name: 'Devoir et barème' })).toBeVisible();
  await expect(page.getByLabel('Nom du barème (distinct du devoir)')).toHaveValue('Barème — Partiel de mitose');
  await expect(page.getByRole('button', { name: 'Continuer vers les copies' })).toBeDisabled();

  await page.getByRole('button', { name: 'Mes devoirs' }).click();
  await expect(page.locator('.assignment-overview-card').filter({ hasText: 'Partiel de mitose' })).toBeVisible();
});

test('teachers reuse selected criteria from an existing local assignment without JSON or linked mutations', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Créer un devoir/ }).click();
  await page.getByLabel(/Nom du devoir/).fill('Nouveau partiel');
  await page.getByRole('button', { name: /Créer et préparer le barème/ }).click();

  const reuse = page.locator('.rubric-reuse-panel');
  await expect(reuse.locator('summary')).toBeVisible();
  await reuse.locator('summary').click();
  await expect(reuse.getByLabel('Devoir source')).toContainText('Devoir de biologie');
  const choices = reuse.locator('.rubric-reuse-item input[type="checkbox"]');
  await expect(choices).toHaveCount(3);
  await choices.first().check();
  await reuse.getByRole('button', { name: 'Ajouter au barème' }).click();
  await expect(page.locator('.criterion-editor')).toHaveCount(1);
  await expect(page.locator('.criterion-editor-summary')).toContainText(['Connaissances scientifiques']);
  await expect(reuse.getByRole('status')).toContainText('1 critère(s) ajouté(s)');

  const copied = page.locator('.criterion-editor').first();
  await expect(copied).toHaveAttribute('open', '');
  await copied.locator('.criterion-fields input').first().fill('Critère adapté');
  await page.getByRole('button', { name: 'Mes devoirs' }).click();
  await page.locator('.assignment-overview-card').filter({ hasText: 'Devoir de biologie' }).getByRole('button', { name: /Ouvrir le devoir|Reprendre le devoir/ }).click();
  await page.getByRole('tab', { name: 'Barème' }).click();
  await expect(page.locator('.criterion-editor-summary').filter({ hasText: 'Connaissances scientifiques' })).toHaveCount(1);
  await expect(page.locator('.criterion-editor-summary').filter({ hasText: 'Critère adapté' })).toHaveCount(0);
});

test('teachers duplicate a devoir without copying its corrections and with editable rubric', async ({ page }) => {
  await page.goto('/');
  const source = page.locator('.assignment-overview-card').first();
  await source.locator('.assignment-overview-menu summary').click();
  await source.getByRole('button', { name: 'Dupliquer sans les copies' }).click();
  await expect(page.getByRole('heading', { name: 'Devoir et barème' })).toBeVisible();
  await expect(page.locator('.criterion-editor')).toHaveCount(3);
  await page.getByRole('tab', { name: 'Copies' }).click();
  await expect(page.getByText('Aucune copie pour le moment')).toBeVisible();
  await page.getByRole('button', { name: 'Mes devoirs' }).click();
  await expect(page.locator('.assignment-overview-card')).toHaveCount(2);
  await expect(page.locator('.assignment-overview-card').filter({ hasText: '— copie' })).toBeVisible();
});

test('the compact rubric keeps advanced criterion details collapsed and can open each one', async ({ page }) => {
  await page.goto('/');
  await page.locator('.assignment-overview-card').first().getByRole('button', { name: /Reprendre le devoir/ }).click();
  await page.getByRole('tab', { name: 'Barème' }).click();
  const criteria = page.locator('.criterion-editor');
  await expect(criteria).toHaveCount(3);
  await expect(criteria.first()).not.toHaveAttribute('open', '');
  await expect(criteria.nth(1)).not.toHaveAttribute('open', '');
  await criteria.first().locator('summary').click();
  await expect(criteria.first()).toHaveAttribute('open', '');
  await criteria.nth(1).locator('summary').click();
  await expect(criteria.nth(1)).toHaveAttribute('open', '');
  await expect(criteria.first()).not.toHaveAttribute('open', '');
  await expect(criteria.nth(1).locator('.criterion-fields input').first()).toBeVisible();
});

test('Atelier pédagogique is visible from assignment library through rubric preparation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const card = page.locator('.assignment-overview-card').first();
  await expect(card).toHaveCSS('border-top-color', 'rgb(161, 77, 55)');
  await expect(card).toHaveCSS('border-top-width', '3px');
  await expect(card).toHaveCSS('background-color', 'rgb(255, 253, 249)');
  await expect(page.getByRole('heading', { name: 'Mes devoirs' })).toHaveCSS('font-family', /Georgia/);

  await page.getByRole('button', { name: /Créer un devoir/ }).click();
  await expect(page.locator('.assignment-creation-panel')).toHaveCSS('border-top-color', 'rgb(161, 77, 55)');
  await page.getByLabel(/Nom du devoir/).fill('Atelier de mitose');
  await page.getByRole('button', { name: /Créer et préparer le barème/ }).click();
  await expect(page.getByRole('heading', { name: 'Devoir et barème' })).toBeVisible();
  await page.getByRole('button', { name: '＋ Ajouter un critère' }).click();
  await expect(page.locator('.criterion-editor').first()).toBeVisible();
  await expect(page.locator('.criterion-editor').first()).toHaveCSS('background-color', 'rgb(255, 253, 249)');
});

test('Atelier B rubric shows compact numbered criteria and a live synthesis at desktop and mobile sizes', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.locator('.assignment-overview-card').first().getByRole('button', { name: /Reprendre le devoir/ }).click();
  await page.getByRole('tab', { name: 'Barème' }).click();
  const summary = page.getByRole('complementary', { name: 'Synthèse du barème' });
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('3 critères');
  await expect(summary).toContainText('20 points');
  const indices = page.locator('.atelier-criterion-index');
  await expect(indices).toHaveText(['01', '02', '03']);
  await page.screenshot({ path: testInfo.outputPath('atelier-b-rubric-desktop.png'), animations: 'disabled' });
  await summary.getByRole('button', { name: /Voir les critères disponibles/ }).click();
  await expect(page.locator('.rubric-reuse-panel')).toHaveAttribute('open', '');

  const firstCriterion = page.locator('.criterion-editor').first();
  await expect(firstCriterion).not.toHaveAttribute('open', '');
  await firstCriterion.locator('summary').click();
  await expect(firstCriterion).toHaveAttribute('open', '');
  await firstCriterion.locator('.criterion-fields input').first().fill('Connaissances scientifiques — précisions');
  await expect(firstCriterion.locator('.criterion-editor-summary')).toContainText('Connaissances scientifiques — précisions');
  await page.getByRole('button', { name: /Ajouter un critère/ }).click();
  await expect(summary).toContainText('4 critères');
  await expect(page.locator('.atelier-criterion-index')).toHaveText(['01', '02', '03', '04']);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(summary).toBeVisible();
  const editorRect = await page.locator('.atelier-rubric-editor').boundingBox();
  const summaryRect = await summary.boundingBox();
  expect(editorRect).not.toBeNull();
  expect(summaryRect).not.toBeNull();
  expect(summaryRect!.y).toBeGreaterThan(editorRect!.y);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('atelier-b-rubric-mobile.png'), animations: 'disabled' });
});
