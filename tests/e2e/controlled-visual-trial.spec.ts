import { expect,test } from '@playwright/test';
import { defaultAiModelConfiguration } from '../../src/shared/domain/aiModelProfiles.ts';
import { chooseEvaluationModel } from './helpers/evaluation-models.ts';

test('les lectures synthétiques reprennent la conversation et offrent arrêt et réessai',async ({page}) => {
  await page.goto('/');
  await page.evaluate(cfg => localStorage.setItem('companion-correcteur:ollama-profiles:v1',JSON.stringify([{
    id:'native-local',name:'Vision locale',mode:'single',updatedAt:new Date().toISOString(),
    configuration:{...cfg,endpoint:location.origin+'/api/v1/chat',analysisModel:'test-vision',apiCompatible:true,omitReasoningParameter:true},
  }])),defaultAiModelConfiguration);
  await page.reload();
  await page.getByRole('button',{name:'Évaluer les modèles'}).click();
  const nav=page.getByRole('navigation',{name:'Espaces de l’évaluation'});
  await nav.getByRole('button',{name:'Tests',exact:true}).click();
  await page.getByRole('group',{name:'Parcours de test'}).getByRole('button',{name:/Schémas scientifiques/}).click();
  await chooseEvaluationModel(page,'Vision locale');
  const toggle = page.getByText('Essai contrôlé · titre et trait de rappel',{exact:true});
  await toggle.click();
  let mode = 'fail',calls=0,images=0;
  await page.route('**/api/v1/chat',async route => {
    if (mode === 'fail') return route.fulfill({status:503,body:'indisponible'});
    if (mode === 'wait') return;
    const body = route.request().postDataJSON();
    calls++;
    expect(body.reasoning).toBeUndefined();
    expect(body.max_output_tokens).toBeUndefined();
    const image = body.input.some((i:{type:string}) => i.type === 'image');
    if (image) images++;
    expect(image).toBe(!body.previous_response_id);
    const events = [{type:'message.delta',content:JSON.stringify({verdict:'oui',preuve:'trait observé'})},
      {type:'chat.end',result:{response_id:'resp_'+calls}}];
    await route.fulfill({contentType:'text/event-stream',body:events.map(e => 'data: '+JSON.stringify(e)+'\n\n').join('')});
  });
  const start=page.getByRole('button',{name:'Lancer les lectures contrôlées'});
  await start.click();
  await expect(page.getByRole('alert').filter({hasText:'HTTP 503'})).toBeVisible();
  mode='wait';
  await start.click();
  await expect(start).toBeDisabled();
  await nav.getByRole('button',{name:'Radars'}).click();
  await nav.getByRole('button',{name:'Tests',exact:true}).click();
  if (!await page.getByRole('button',{name:'Arrêter les lectures'}).isVisible()) await toggle.click();
  await page.getByRole('button',{name:'Arrêter les lectures'}).click();
  await expect(page.getByText(/Essai arrêté · 0\/16/)).toBeVisible();
  mode='success';
  await start.click();
  await expect(page.getByText(/Essai terminé · 16\/16/)).toBeVisible();
  expect(calls).toBe(16);
  expect(images).toBe(8);
  await page.getByText('Essais enregistrés',{exact:true}).click();
  await expect(page.getByRole('button',{name:'Exporter',exact:true})).toBeVisible();
});