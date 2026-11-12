import { expect, test } from '@playwright/test';

const profilesKey = 'companion-correcteur:ollama-profiles:v1';

test('the evaluator creates, reloads and resets decision-model configurations inside management dialogs', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' }).getByRole('button', { name: 'Tests', exact: true }).click();
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: 'Ma copie' }).click();
  await page.getByRole('button', { name: 'Gérer les configurations' }).click();
  await page.getByRole('dialog', { name: 'Gérer les configurations IA' })
    .getByRole('button', { name: 'Modifier les réglages courants' }).click();

  const editor = page.getByRole('dialog', { name: 'Créer ou modifier une configuration IA' });
  const method = editor.locator('#evaluation-correction-method');
  const byCriterion = editor.locator('#evaluation-criterion-by-criterion');
  await expect(method).toHaveValue('generative');
  await expect(byCriterion).toBeEnabled();

  await editor.getByText('Options avancées du test', { exact: true }).click();
  await editor.locator('#evaluation-profile-name').fill('Laboratoire décisionnel');
  await editor.locator('#evaluation-vision-model').fill('gemma3:4b');
  await editor.locator('#evaluation-analysis-model').fill('qwen3.5:4b');
  await editor.locator('#evaluation-decision-model').fill('tev1:4b');
  await method.selectOption('decision');
  await expect(byCriterion).toBeDisabled();
  await editor.getByRole('button', { name: 'Enregistrer la configuration' }).click();
  await expect(editor).toHaveCount(0);

  const savedProfile = await page.evaluate((key) => {
    const profiles = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{
      id: string; name: string; configuration: { correctionMethod: string; analysisModel: string };
    }>;
    return profiles.find((profile) => profile.name === 'Laboratoire décisionnel') ?? null;
  }, profilesKey);
  expect(savedProfile).toMatchObject({
    name: 'Laboratoire décisionnel',
    configuration: { correctionMethod: 'decision', analysisModel: 'tev1:4b' },
  });
  expect(savedProfile?.id).toBeTruthy();
  await expect(page.getByRole('group', { name: 'Modèles sélectionnés pour les tests' })).toContainText('Laboratoire décisionnel');

  await page.getByRole('button', { name: 'Gérer les configurations' }).click();
  await page.getByRole('dialog', { name: 'Gérer les configurations IA' })
    .getByRole('button', { name: '+ Nouvelle configuration' }).click();
  await expect(method).toHaveValue('generative');
  await expect(byCriterion).toBeEnabled();

  await editor.locator('#evaluation-profile-select').selectOption(savedProfile!.id);
  await expect(method).toHaveValue('decision');
  await expect(byCriterion).toBeDisabled();
  await expect(editor.locator('#evaluation-analysis-model')).toHaveValue('qwen3.5:4b');
  await expect(editor.locator('#evaluation-decision-model')).toHaveValue('tev1:4b');

  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' }).getByRole('button', { name: 'Tests', exact: true }).click();
  await page.getByRole('group', { name: 'Parcours de test' }).getByRole('button', { name: 'Ma copie' }).click();
  await page.getByRole('button', { name: 'Gérer les configurations' }).click();
  await page.getByRole('dialog', { name: 'Gérer les configurations IA' })
    .getByRole('button', { name: 'Modifier', exact: true }).click();
  await expect(editor.locator('#evaluation-correction-method')).toHaveValue('decision');
  await expect(editor.locator('#evaluation-criterion-by-criterion')).toBeDisabled();
});
