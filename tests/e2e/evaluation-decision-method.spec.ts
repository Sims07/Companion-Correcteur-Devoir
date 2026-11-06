import { expect, test } from '@playwright/test';

const profilesKey = 'companion-correcteur:ollama-profiles:v1';

test('the evaluator creates, reloads and resets decision-model configurations', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();

  const method = page.locator('#evaluation-correction-method');
  const byCriterion = page.locator('#evaluation-criterion-by-criterion');
  await expect(method).toHaveValue('generative');
  await expect(byCriterion).toBeEnabled();

  await page.locator('#evaluation-profile-name').fill('Laboratoire décisionnel');
  await page.locator('#evaluation-vision-model').fill('gemma3:4b');
  await page.locator('#evaluation-analysis-model').fill('tev1:4b');
  await method.selectOption('decision');
  await expect(byCriterion).toBeDisabled();
  await page.getByRole('button', { name: 'Enregistrer la configuration' }).click();

  const savedProfile = await page.evaluate((key) => {
    const profiles = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{
      id: string;
      name: string;
      configuration: { correctionMethod: string; analysisModel: string };
    }>;
    return profiles.find((profile) => profile.name === 'Laboratoire décisionnel') ?? null;
  }, profilesKey);
  expect(savedProfile).toMatchObject({
    name: 'Laboratoire décisionnel',
    configuration: { correctionMethod: 'decision', analysisModel: 'tev1:4b' },
  });
  expect(savedProfile?.id).toBeTruthy();
  await expect(page.getByRole('group', { name: 'Configurations à exécuter' })
    .getByText('Laboratoire décisionnel')).toBeVisible();

  await page.getByRole('button', { name: /Nouvelle configuration/ }).click();
  await expect(method).toHaveValue('generative');
  await expect(byCriterion).toBeEnabled();

  await page.locator('#evaluation-profile-select').selectOption(savedProfile!.id);
  await expect(method).toHaveValue('decision');
  await expect(byCriterion).toBeDisabled();
  await expect(page.locator('#evaluation-analysis-model')).toHaveValue('tev1:4b');

  await page.reload();
  await page.getByRole('button', { name: 'Outils IA' }).click();
  await page.getByRole('button', { name: /Évaluation des modèles/ }).click();
  await page.locator('#evaluation-profile-select').selectOption(savedProfile!.id);
  await expect(page.locator('#evaluation-correction-method')).toHaveValue('decision');
  await expect(page.locator('#evaluation-criterion-by-criterion')).toBeDisabled();
});
