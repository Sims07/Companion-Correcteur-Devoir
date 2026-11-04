import { expect, test } from '@playwright/test';
import { openActiveAssignment } from './helpers/teacher-workspace';

test('scientific page routing is automatic and is no longer configured per assignment', async ({ page }) => {
  await page.goto('/');
  await openActiveAssignment(page);
  await page.getByRole('tab', { name: 'Barème' }).click();
  await expect(page.getByRole('checkbox', { name: /Ce devoir comporte des schémas scientifiques à évaluer/ })).toHaveCount(0);
});


test('a rubric criterion can be explicitly routed to scientific diagram Vision analysis', async ({ page }) => {
  await page.goto('/');
  await openActiveAssignment(page);
  await page.getByRole('button', { name: 'Mes devoirs' }).click();
  await page.getByRole('button', { name: /Créer un devoir/ }).click();
  await page.getByLabel('Nom du devoir', { exact: true }).fill('Schéma de cellule');
  await page.getByLabel('Objectif pédagogique').fill('Évaluer un schéma scientifique.');
  await page.getByRole('button', { name: /Créer et préparer le barème/ }).click();
  await page.getByRole('button', { name: /Ajouter un critère/ }).click();
  const diagramCheckbox = page.getByRole('checkbox', { name: /Analyse de schéma scientifique/ }).first();
  await expect(diagramCheckbox).toBeVisible();
  await diagramCheckbox.check();
  await expect(diagramCheckbox).toBeChecked();
  await diagramCheckbox.uncheck();
  await expect(diagramCheckbox).not.toBeChecked();
});

test('all rubric criteria can expose teacher-defined subcriteria with an exact equal distribution', async ({ page }) => {
  await page.goto('/');
  await openActiveAssignment(page);
  await page.getByRole('button', { name: 'Mes devoirs' }).click();
  await page.getByRole('button', { name: /Créer un devoir/ }).click();
  await page.getByLabel('Nom du devoir', { exact: true }).fill('Schéma avec attendus');
  await page.getByRole('button', { name: /Créer et préparer le barème/ }).click();
  await page.getByRole('button', { name: /Ajouter un critère/ }).click();
  await page.getByRole('checkbox', { name: /Analyse de schéma scientifique/ }).first().uncheck();
  await expect(page.getByRole('button', { name: '+ Ajouter un sous-critère' })).toBeVisible();
  await page.getByRole('button', { name: '+ Ajouter un sous-critère' }).click();
  await page.getByRole('button', { name: '+ Ajouter un sous-critère' }).click();
  await page.getByRole('button', { name: '+ Ajouter un sous-critère' }).click();
  const firstLabel = page.getByLabel('Sous-critère 1 — Nouveau critère', { exact: true });
  await firstLabel.fill('Membrane');
  await page.getByLabel('Sous-critère 2 — Nouveau critère', { exact: true }).fill('Noyau');
  await page.getByLabel('Sous-critère 3 — Nouveau critère', { exact: true }).fill('Cytoplasme');
  await page.getByRole('button', { name: 'Répartir également' }).click();
  await expect(page.getByText('Total des sous-critères : 1 / 1 points')).toBeVisible();
  await expect(page.getByText(/Le total doit correspondre au maximum/)).toHaveCount(0);
});
