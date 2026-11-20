import { expect, test } from '@playwright/test';
import { openActiveAssignment } from './helpers/teacher-workspace';

test('teacher can distinguish rubric primary and secondary actions on a pale background', async ({ page }) => {
  await page.goto('/');
  await openActiveAssignment(page);
  await page.getByRole('tab', { name: 'Barème' }).click();

  const addCriterion = page.getByRole('button', { name: 'Ajouter un critère' });
  await expect(addCriterion).toBeVisible();
  await expect(addCriterion).toHaveCSS('background-color', 'rgb(161, 77, 55)');
  await expect(addCriterion).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(addCriterion).toHaveCSS('min-height', '44px');

  const criterion = page.locator('.criterion-editor').first();
  if (!(await criterion.evaluate((element) => element.hasAttribute('open')))) {
    await criterion.locator('summary').click();
  }

  const addSubcriterion = criterion.getByRole('button', { name: 'Ajouter un sous-critère' });
  const suggest = criterion.getByRole('button', { name: 'Proposer des sous-critères depuis les attendus' });
  for (const action of [addSubcriterion, suggest]) {
    await expect(action).toBeVisible();
    await expect(action).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    await expect(action.locator('svg')).toBeVisible();
    await expect(action).toHaveCSS('box-shadow', 'none');
    await expect(action).toHaveCSS('border-top-width', '0px');
    await expect(action).toHaveCSS('min-height', '44px');
  }

  const distribute = criterion.getByRole('button', { name: 'Répartir également' });
  await expect(distribute).toHaveCSS('border-top-width', '0px');
  await addSubcriterion.focus();
  await expect(addSubcriterion).toBeFocused();
});

test('secondary rubric actions remain clear on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await openActiveAssignment(page);
  await page.getByRole('tab', { name: 'Barème' }).click();
  const criterion = page.locator('.criterion-editor').first();
  if (!(await criterion.evaluate((element) => element.hasAttribute('open')))) {
    await criterion.locator('summary').click();
  }
  const suggest = criterion.getByRole('button', { name: 'Proposer des sous-critères depuis les attendus' });
  await expect(suggest).toBeVisible();
  await expect(suggest).toHaveCSS('border-top-width', '0px');
  await expect(suggest).toHaveCSS('min-height', '44px');
});
