import { expect, test } from '@playwright/test';
import { defaultAiModelConfiguration } from '../../src/shared/domain/aiModelProfiles.ts';

test('le benchmark conserve une exécution en navigation et permet un nouvel essai', async ({page}) => {
  await page.goto('/');
  await page.evaluate(configuration => localStorage.setItem('companion-correcteur:ollama-profiles:v1', JSON.stringify([{
    id:'parallel-test', name:'Vision test', mode:'single', updatedAt:new Date().toISOString(),
    configuration:{...configuration,endpoint:location.origin+'/api/v1/chat',analysisModel:'vision',apiCompatible:true},
  }])), defaultAiModelConfiguration);
  await page.reload();
  await page.getByRole('button',{name:'Évaluer les modèles'}).click();
  const nav = page.getByRole('navigation',{name:'Espaces de l’évaluation'});
  const tests = nav.getByRole('button',{name:'Tests',exact:true});
  await tests.click();
  await page.getByRole('group',{name:'Parcours de test'}).getByRole('button',{name:/Schémas scientifiques/}).click();
  const panel = page.getByRole('region',{name:'Parallélisme des schémas'});
  const start = panel.getByRole('button',{name:'Comparer les niveaux de concurrence'});
  let fail = false;
  await page.route('**/api/v1/chat', route => fail ? route.fulfill({status:503,body:'indisponible'}) : undefined);
  await start.click();
  await expect(start).toBeDisabled();
  await nav.getByRole('button',{name:'Radars'}).click();
  await tests.click();
  await panel.getByRole('button',{name:'Arrêter la comparaison'}).click();
  await expect(panel.getByRole('status')).toContainText('arrêtée');
  fail = true;
  await start.click();
  await expect(panel.getByRole('status')).toContainText('Échec');
  await expect(start).toBeEnabled();
});
