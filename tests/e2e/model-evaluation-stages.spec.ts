import { expect, test } from '@playwright/test';

test('the model laboratory exposes independent Vision and Analysis experiments', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluation des modèles' }).click();

  const stagePicker = page.getByRole('group', { name: 'Type d’évaluation' });
  await expect(stagePicker).toBeVisible();
  await expect(stagePicker.getByRole('button', { name: /Vision seule/ })).toBeVisible();
  await expect(stagePicker.getByRole('button', { name: /Analyse seule/ })).toBeVisible();
  await expect(stagePicker.getByRole('button', { name: /Parcours complet/ })).toBeVisible();

  await stagePicker.getByRole('button', { name: /Vision seule/ }).click();
  await expect(stagePicker.getByRole('button', { name: /Vision seule/ })).toHaveAttribute('aria-pressed', 'true');

  await stagePicker.getByRole('button', { name: /Analyse seule/ }).click();
  await expect(page.getByRole('heading', { name: 'Transcription à noter' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Transcription de référence pour l’évaluation de l’analyse' })).toBeVisible();
});
