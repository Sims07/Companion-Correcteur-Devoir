import { expect, test } from '@playwright/test';
import { defaultAiModelConfiguration } from '../../src/domain/aiModelProfiles.ts';

test('a biology evaluation launched from the radar replaces the previous custom test screen', async ({ page }) => {
  await page.goto('/');
  await page.evaluate((configuration) => {
    localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([{
      id: 'bio-radar-profile',
      name: 'Biology radar candidate',
      mode: 'single',
      updatedAt: new Date().toISOString(),
      configuration: { ...configuration, analysisModel: 'bio-radar-model', visionModel: 'bio-radar-model' },
    }]));
  }, defaultAiModelConfiguration);
  await page.reload();

  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  const navigation = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await navigation.getByRole('button', { name: 'Tests' }).click();
  const families = page.getByRole('group', { name: 'Parcours de test' });
  await families.getByRole('button', { name: 'Ma copie' }).click();
  await page.getByRole('group', { name: 'Type d’évaluation' }).getByRole('button', { name: 'Analyse seule' }).click();
  await expect(page.getByRole('heading', { name: 'Transcription à noter' })).toBeVisible();

  await navigation.getByRole('button', { name: 'Radars' }).click();
  const home = page.getByRole('region', { name: 'Tableau de bord des radars' });
  await home.getByLabel('Choisir un LLM').selectOption('bio-radar-model');
  const start = home.getByRole('article', { name: 'Biologie' }).getByRole('button', { name: 'Évaluer en biologie' });
  await expect(start).toBeEnabled();
  await start.click();

  await expect(navigation.getByRole('button', { name: 'Tests' })).toHaveAttribute('aria-current', 'page');
  await expect(families.getByRole('button', { name: 'Biologie' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: 'Protocole de test guidé' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Type d’évaluation' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Transcription à noter' })).toBeHidden();
  await expect(page.getByRole('region', { name: 'Avancement automatique de la biologie' })
    .or(page.getByRole('region', { name: 'Protocole variante B par question' }))).toBeVisible();
});
