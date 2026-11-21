import { expect, test } from '@playwright/test';
import { defaultAiModelConfiguration } from '../../src/shared/domain/aiModelProfiles.ts';

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
  await expect(page.locator('#evaluation-configurations')).toHaveAttribute('data-journey', 'biology');
  await expect(page.getByRole('region', { name: 'Protocole de test guidé' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Type d’évaluation' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Transcription à noter' })).toBeHidden();
  const running = page.getByRole('region', { name: 'Avancement automatique de la biologie' });
  await expect(running.or(page.getByRole('region', { name: 'Protocole variante B par question' }))).toBeVisible();
  // The family picker is deliberately replaced by the live monitor while a call runs.
  if (await running.isVisible()) {
    await expect(page.getByRole('group', { name: 'Parcours de test' })).toHaveCount(0);
    await expect(running.getByRole('progressbar', { name: 'Progression de l’étape biologique' })).toBeVisible();
    await expect(running.getByRole('button', { name: 'Arrêter après l’appel en cours' })).toBeVisible();
  } else {
    await expect(families.getByRole('button', { name: 'Biologie' })).toHaveAttribute('aria-pressed', 'true');
  }
});

test('le radar modifie le raisonnement du profil LM Studio choisi pour un même modèle', async ({ page }) => {
  const key = 'companion-correcteur:ollama-profiles:v1';
  await page.goto('/');
  await page.evaluate(({ configuration, key }) => {
    localStorage.setItem(key, JSON.stringify(['habituel', 'essai'].map(id => ({
      id, name: id, mode: 'single', updatedAt: new Date().toISOString(),
      configuration: { ...configuration, analysisModel: 'gemma', visionModel: 'gemma',
        apiCompatible: true, analysisThinking: true, analysisReasoningEffort: 'medium', correctionMethod: 'generative' },
    }))));
  }, { configuration: defaultAiModelConfiguration, key });
  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await page.getByRole('navigation', { name: 'Espaces de l’évaluation' }).getByRole('button', { name: 'Radars' }).click();
  const bio = page.getByRole('article', { name: 'Biologie' });
  await bio.getByLabel('Profil du prochain essai').selectOption('essai');
  const reasoning = bio.getByLabel('Raisonnement du profil essai');
  for (const mode of ['low', 'medium', 'high', 'off']) {
    await reasoning.selectOption(mode);
    await expect(reasoning).toHaveValue(mode);
    const profiles = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key);
    expect(profiles[0].configuration.analysisReasoningEffort).toBe('medium');
    expect(profiles[1].configuration.analysisThinking).toBe(mode !== 'off');
    expect(profiles[1].configuration.analysisReasoningEffort).toBe(mode === 'off' ? 'high' : mode);
  }
});
