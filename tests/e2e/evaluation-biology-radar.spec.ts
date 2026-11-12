import { expect, test } from '@playwright/test';
import { defaultAiModelConfiguration } from '../../src/domain/aiModelProfiles.ts';

test('evaluation opens on both radars and keeps the chosen LLM across tests and reload', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(cfg => localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify(
    ['alpha', 'beta'].map(name => ({ id: name, name, mode: 'single', updatedAt: new Date().toISOString(),
      configuration: { ...cfg, analysisModel: name, visionModel: name } })))), defaultAiModelConfiguration);
  await page.reload();
  const open = page.getByRole('button', { name: 'Évaluer les modèles' });
  await open.click();
  const home = page.getByRole('region', { name: 'Tableau de bord des radars' });
  const nav = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await expect(nav.getByRole('button', { name: 'Radars' })).toHaveAttribute('aria-current','page');
  await home.getByLabel('Choisir un LLM').selectOption('beta');
  await expect(home.getByText('À évaluer', { exact: true })).toHaveCount(2);
  await expect(home.getByRole('img')).toHaveCount(2);
  await nav.getByRole('button', { name: 'Tests' }).click();
  await expect(page.getByRole('group', { name: 'Modèles sélectionnés pour les tests' })).toContainText('beta');
  await nav.getByRole('button', { name: 'Campagnes' }).click();
  await expect(page.getByRole('region', { name: 'Campagnes d’évaluation' })).toBeVisible();
  await page.reload();
  await open.click();
  await expect(home.getByLabel('Choisir un LLM')).toHaveValue('beta');
  await page.setViewportSize({ width: 390, height: 844 });
  const bio = home.getByRole('article', { name: 'Biologie' });
  await bio.getByRole('button', { name: 'Afficher le graphique' }).click();
  await expect(bio.getByRole('img')).toBeVisible();
  await expect(home.getByRole('article', { name: 'Schémas scientifiques' }).getByRole('img')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({path:'test-results/radars-mobile.png', fullPage:true});
  await page.setViewportSize({width:1440,height:900});
  await page.screenshot({path:'test-results/radars-desktop.png', fullPage:true});
});

test('a notification reopens its biological campaign after another run and a reload', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const date = new Date().toISOString();
    const histories = ['ancien', 'récent'].map((name, index) => ({
      campaignId: name, id: 'obs-' + name, model: 'LLM ' + name, profile: name, profileId: name,
      method: 'generative', provider: 'ollama', protocol: 'contract', caseId: 'A', recordedAt: date,
      status: 'success', score: index + 1, referenceScore: 8, decisions: [],
    }));
    localStorage.setItem('companion:biology-teacher-radar:v1', JSON.stringify(histories));
    localStorage.setItem('companion-correcteur:notifications:v1', JSON.stringify([{
      id: 'old-result', campaignId: 'ancien', title: 'Ancienne campagne terminée', message: 'Biologie',
      createdAt: date, kind: 'success', target: 'evaluation', journey: 'biology', read: false,
    }]));
  });
  await page.reload();
  await page.getByRole('button', { name: /Notifications,/ }).click();
  await page.getByRole('button', { name: /^Ancienne campagne terminée/ }).click();
  const list = page.getByRole('region', { name: 'Campagnes d’évaluation' });
  await expect(list.getByRole('heading', { name: 'Historique des évaluations' })).toBeVisible();
  await expect(list.locator('.campaign-index-item')).toHaveCount(1);
  await expect(list.getByRole('heading', { name: 'Notes par copie' })).toBeVisible();
  await expect(list.locator('.campaign-index-detail')).toContainText('LLM ancien');
  await expect(list.locator('.campaign-index-detail')).toContainText('1/10');
  await list.getByRole('button', { name: 'Toutes les campagnes' }).click();
  await expect(list.locator('.campaign-index-item')).toHaveCount(2);
  await list.getByRole('button', { name: /LLM récent/ }).click();
  await expect(list.locator('.campaign-index-detail')).toContainText('2/10');
});


test('comparison overlays LLMs on both radar cards instead of pushing charts below a table', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const rows = ['alpha:4b', 'beta:4b'].flatMap((model) =>
      ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((caseId) => ({
        id: model + ':' + caseId, campaignId: model, model, profileId: model, profile: model,
        provider: 'ollama', method: 'generative', protocol: 'contract', caseId,
        recordedAt: '2026-11-12T08:00:00Z', status: 'success',
        score: model === 'alpha:4b' ? 8 : 6, referenceScore: 8,
        decisions: Array.from({ length: 10 }, (_, i) => {
          const expected = caseId === 'A' ? 1 : caseId === 'B' ? 0 : i < 5 ? 1 : 0;
          return { id: 'q' + i, expected, awarded: model === 'beta:4b' && i === 0 ? 1 - expected : expected };
        }),
      })));
    localStorage.setItem('companion:biology-teacher-radar:v1', JSON.stringify(rows));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  const home = page.getByRole('region', { name: 'Tableau de bord des radars' });
  await home.getByLabel('Choisir un LLM').selectOption('alpha:4b');
  await home.getByRole('button', { name: 'Comparer les LLM' }).click();

  const biology = home.getByRole('article', { name: 'Biologie' });
  const science = home.getByRole('article', { name: 'Schémas scientifiques' });
  await expect(home.getByRole('group', { name: 'Modèles à superposer' })).toContainText('beta:4b');
  await expect(biology.locator('[data-radar-model]')).toHaveCount(2);
  await expect(biology.locator('[data-radar-model] polygon')).toHaveCount(2);
  await expect(biology.locator('.radar-home-legend-item')).toHaveCount(2);
  await expect(science.getByRole('img')).toBeVisible();
  await expect(home.locator('.radar-comparison table')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/radars-comparison-desktop.png', fullPage: true });

  // Selecting the compared model as primary swaps roles rather than clearing the overlay.
  await home.getByLabel('Choisir un LLM').selectOption('beta:4b');
  await expect(home.getByRole('group', { name: 'Modèles à superposer' })).toContainText('alpha:4b');
  await expect(biology.locator('[data-radar-model]')).toHaveCount(2);

  await page.setViewportSize({ width: 390, height: 844 });
  await biology.getByRole('button', { name: 'Afficher le graphique' }).click();
  await expect(biology.getByRole('img')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/radars-comparison-mobile.png', fullPage: true });

  await home.getByRole('button', { name: 'Masquer la comparaison' }).click();
  await expect(home.locator('.radar-home-legend')).toHaveCount(0);
  await expect(biology.getByRole('img')).toBeVisible();
});
