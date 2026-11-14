import { readFile } from 'node:fs/promises';
import { openCustomTests } from './helpers/evaluation-models.ts';
import { expect, test } from '@playwright/test';

test('radar opens on LLM selection and score, while archive tools stay with campaigns', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await openCustomTests(page);

  const navigation = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await navigation.getByRole('button', { name: 'Radars' }).click();
  await page.getByRole('article', { name: 'Schémas scientifiques' }).getByRole('button', { name: 'Détail du radar' }).click();
  const radar = page.getByRole('region', { name: 'Radar des candidats scientifiques' });

  await expect(radar).toBeVisible();
  await expect(radar.getByLabel('Choisir un LLM')).toBeVisible();
  await expect(page.locator('.diagram-lab-history-heading, .diagram-radar-intro')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Importer un ancien JSON' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Actualiser', exact: true })).toHaveCount(0);

  const order = await radar.evaluate((element) => ({
    selector: element.querySelector('.diagram-radar-model-pickers')?.getBoundingClientRect().top ?? Infinity,
    options: element.querySelector('.diagram-radar-toolbar')?.getBoundingClientRect().top ?? -Infinity,
  }));
  expect(order.selector).toBeLessThan(order.options);

  await navigation.getByRole('button', { name: 'Campagnes' }).click();
  await page.getByRole('button', { name: 'Archives scientifiques' }).click();
  await expect(page.getByRole('heading', { name: 'Campagnes de test' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Retour aux campagnes/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Importer un ancien JSON' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Actualiser', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Retour aux campagnes/ }).click();
  await expect(page.getByRole('heading', { name: 'Historique des évaluations' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await navigation.getByRole('button', { name: 'Radars' }).click();
  await page.getByRole('article', { name: 'Schémas scientifiques' }).getByRole('button', { name: 'Détail du radar' }).click();
  await expect(radar.getByLabel('Choisir un LLM')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('reopens two dated scores for the same model and selects the older method', async ({ page }) => {
  const key = 'companion:biology-teacher-radar:v1';
  await page.goto('/');
  await page.evaluate(key => {
    const rows = ['contract', 'standard'].flatMap((protocol, i) =>
      ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(caseId => ({
        id: protocol + caseId, campaignId: protocol, profileId: 'q', profile: 'Qwen',
        model: 'qwen:timeline', method: 'generative', provider: 'ollama', protocol, caseId,
        recordedAt: '2026-11-' + (12 + i) + 'T12:00:00Z', status: 'success',
        referenceScore: 5, score: i ? 3 : 5, decisions: Array.from({length:10}, (_, n) => ({
          id:'q'+n, expected:n % 2, awarded:i && n === 0 ? 1 : n % 2,
        })),
      })));
    localStorage.setItem(key, JSON.stringify(rows));
  }, key);
  await page.reload();
  await page.getByRole('button', {name:'Évaluer les modèles'}).click();
  const home = page.getByRole('region', {name:'Tableau de bord des radars'});
  await home.getByLabel('Choisir un LLM').selectOption('qwen:timeline');
  const bio = home.getByRole('article', {name:'Biologie'});
  await bio.getByRole('button', {name:'Analyse des méthodes'}).click();
  const lab = page.getByRole('region', {name:'Laboratoire des méthodes'});
  await expect(lab.getByRole('img', {name:'Radars superposés des méthodes sur 100'}).locator('g[data-method] polygon')).toHaveCount(2);
  await expect(lab.getByLabel('Méthode A', {exact:true})).not.toHaveValue(await lab.getByLabel('Méthode B', {exact:true}).inputValue());
  const trend = lab.getByRole('figure', {name:/Évolution des notes/});
  const older = trend.getByRole('button', {name:/Contrats par question/});
  await older.click();
  await expect(older).toHaveAttribute('aria-pressed','true');
  await expect(lab.getByLabel('Essai sélectionné')).toHaveValue(/contract/);
  await trend.getByRole('button', {name:/Barème standard/}).focus();
  await page.keyboard.press('Enter');
  await expect(lab.getByLabel('Essai sélectionné')).toHaveValue(/standard/);
  await expect(lab.getByRole('table', {name:'Dernier essai de chaque méthode'}).locator('tbody tr')).toHaveCount(2);
  const downloading = page.waitForEvent('download');
  await lab.getByRole('button', {name:'Exporter l’historique des méthodes'}).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^companion-methodes-biology-qwen-timeline-/);
  const report = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(report.model).toBe('qwen:timeline');
  expect(report.trials.map((p: {biologyMethod: string}) => p.biologyMethod)).toEqual(['contract', 'standard']);
  expect(report.observations).toHaveLength(14);
  await lab.getByLabel('Essai sélectionné').selectOption({index:0});
  await lab.getByRole('button', {name:'Choisir cette méthode pour le prochain essai'}).click();
  await expect(lab.getByLabel('Méthode du prochain essai')).toHaveValue('standard');
  await lab.getByRole('button',{name:'Retour aux radars'}).click();
  await expect(bio.getByRole('button',{name:'Évaluer · Barème standard'})).toBeVisible();
});
