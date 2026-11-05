import { expect, test } from '@playwright/test';
import { openActiveAssignment } from './helpers/teacher-workspace';

async function openRubricCriterion(page: import('@playwright/test').Page) {
  await page.goto('/');
  await openActiveAssignment(page);
  await page.getByRole('tab', { name: 'Barème' }).click();
  const criterion = page.locator('.criterion-editor').first();
  if (!(await criterion.evaluate((element) => element.hasAttribute('open')))) await criterion.locator('summary').click();
  return criterion;
}

test('teacher previews and adds expectations with explicitly assigned points', async ({ page }) => {
  const criterion = await openRubricCriterion(page);
  const source = 'Réactifs : CO2 et H2O (2 pts); Énergie : lumière (3 pts); Produit : glucose et O2 (3 pts)';
  await criterion.getByLabel('Description / attendus').fill(source);
  await criterion.getByRole('button', { name: 'Proposer des sous-critères depuis les attendus' }).click();
  const preview = criterion.getByRole('region', { name: 'Proposition de sous-critères' });
  await expect(preview.getByLabel('Intitulé proposé 1')).toHaveValue('Réactifs : CO2 et H2O');
  await expect(preview.getByLabel('Points proposés 2')).toHaveValue('3');
  await expect(preview.getByText('Total après ajout : 8 / 8 points')).toBeVisible();
  await preview.getByRole('button', { name: 'Ajouter 3 sous-critères' }).click();
  await expect(criterion.getByRole('textbox', { name: 'Sous-critère 1 — Connaissances scientifiques', exact: true })).toHaveValue('Réactifs : CO2 et H2O');
  await expect(criterion.getByLabel('Description / attendus')).toHaveValue(source);
  await expect(criterion.locator('.subcriteria-editor .criterion-fields')).toHaveCount(3);
});

test('teacher must distribute unassigned points before confirming and can cancel', async ({ page }) => {
  const criterion = await openRubricCriterion(page);
  await criterion.getByLabel('Description / attendus').fill('Réactifs : CO2 et H2O; Énergie : lumière');
  await criterion.getByRole('button', { name: 'Proposer des sous-critères depuis les attendus' }).click();
  const preview = criterion.getByRole('region', { name: 'Proposition de sous-critères' });
  const add = preview.getByRole('button', { name: 'Ajouter 2 sous-critères' });
  await expect(add).toBeDisabled();
  await expect(preview.locator('.ds-status-notice--warning')).toBeVisible();
  await preview.getByLabel('Points proposés 1').fill('4');
  await preview.getByLabel('Points proposés 2').fill('4');
  await expect(add).toBeEnabled();
  await expect(preview.locator('.ds-status-notice--success')).toBeVisible();
  await preview.getByRole('button', { name: 'Annuler' }).click();
  await expect(preview).not.toBeVisible();
  await expect(criterion.locator('.subcriteria-editor .criterion-fields')).toHaveCount(0);
});

test('a single unstructured statement does not generate speculative subcriteria', async ({ page }) => {
  const criterion = await openRubricCriterion(page);
  await criterion.getByLabel('Description / attendus').fill('Exactitude des notions et du vocabulaire.');
  await criterion.getByRole('button', { name: 'Proposer des sous-critères depuis les attendus' }).click();
  await expect(criterion.getByRole('status')).toContainText('Aucun nouvel attendu distinct');
  await expect(criterion.getByRole('region', { name: 'Proposition de sous-critères' })).toHaveCount(0);
});
