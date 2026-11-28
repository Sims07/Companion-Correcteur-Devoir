import { expect, test } from '@playwright/test';
import { defaultAiModelConfiguration } from '../../src/shared/domain/aiModelProfiles.ts';

test('le benchmark conserve une exécution en navigation et permet un nouvel essai', async ({page}) => {
  test.setTimeout(60_000);
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

  await page.unroute('**/api/v1/chat');
  let calls = 0;
  let attempts = 0;
  let transientFailures = 1;
  const requests: Array<{ id: string; previous?: string; hasImage: boolean; preparation: boolean }> = [];
  await page.route('**/api/v1/chat', async route => {
    attempts += 1;
    if (transientFailures > 0) {
      transientFailures -= 1;
      return route.fulfill({ status: 503, body: 'serveur temporairement occupé' });
    }
    const body = route.request().postDataJSON();
    const id = 'resp_' + ++calls;
    const prompt = body.input.find((item: { type: string }) => item.type === 'text').content;
    const preparation = prompt.startsWith('Conserve ces pages');
    requests.push({ id, previous: body.previous_response_id,
      hasImage: body.input.some((item: { type: string }) => item.type === 'image'), preparation });
    let answer = 'OK';
    if (!preparation) {
      const schema = JSON.parse(prompt.split('Schéma JSON de la réponse attendue :\n').at(-1));
      const criteria = schema.properties.criteria.properties;
      const key = Object.keys(criteria)[0];
      const leaves = criteria[key].properties.subcriteria.properties;
      const subcriteria = Object.fromEntries(Object.keys(leaves).map(sub => [sub, {
        points: 0, evidence: 'Non observé', ...(leaves[sub].properties.observations
          ? { observations: { underlined:false, framed:false, uppercase:false } } : {}),
      }]));
      answer = JSON.stringify({criteria:{[key]:{evidence:'Non observé',confidence:'high',questionForTeacher:'',subcriteria}}});
    }
    const events = [{ type:'message.delta', content:answer },
      { type:'chat.end', result:{response_id:id, stats:{input_tokens:100,total_output_tokens:30}} }];
    await route.fulfill({contentType:'text/event-stream',body:events.map(e => 'data: '+JSON.stringify(e)+'\n\n').join('')});
  });
  await panel.getByLabel('Concurrence maximale').selectOption('2');
  await start.click();
  await expect(panel.getByRole('status')).toContainText('Comparaison terminée.', {timeout:20_000});
  // Warm-up and A/B/C at level 1 keep four cumulative conversations.
  // A/B/C at level 2 start twelve independent image-bearing requests.
  expect(attempts).toBe(29);
  expect(requests).toHaveLength(28);
  expect(requests.every(request => !request.preparation)).toBe(true);
  for (let offset = 0; offset < 16; offset += 4) {
    const group = requests.slice(offset, offset + 4);
    expect(group.map(request => request.hasImage)).toEqual([true, false, false, false]);
    expect(group[0]!.previous ?? null).toBeNull();
    for (let i = 1; i < group.length; i++) expect(group[i]!.previous).toBe(group[i - 1]!.id);
  }
  for (const request of requests.slice(16)) {
    expect(request.hasImage).toBe(true);
    expect(request.previous ?? null).toBeNull();
  }
  await expect(panel.getByRole('row')).toHaveCount(7);
  await expect(panel.getByRole('button',{name:'Exporter la comparaison JSON'})).toBeEnabled();
});
