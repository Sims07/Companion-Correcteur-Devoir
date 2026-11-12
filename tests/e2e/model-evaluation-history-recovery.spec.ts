import { openCustomTests } from './helpers/evaluation-models.ts';
import { expect, test } from '@playwright/test';

test('two compact local evaluations remain comparable after a page reload without their image payloads', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluer les modèles' }).waitFor();

  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('companion-correcteur-devoir', 6);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const record = (id: string, name: string, model: string, score: number) => ({
      id, completedAt: id === 'archive-tev' ? '2026-11-05T18:00:00.000Z' : '2026-11-05T17:00:00.000Z',
      assignmentId: 'biology-test', assignmentTitle: 'Test de biologie',
      question: 'Répondre aux questions de biologie',
      rubricSnapshot: {title: 'Biologie',criteria:[{id:'q1',title:'Photosynthèse',description:'',maxPoints:20}]},
      correctionMode:'integrated',
      images:[],subjectImages:[],subjectTranscription:null,
      originalImagesArchived:false,originalImageCount:1,
      imageSignatures:['image/jpeg:20000:abcdef01:ffffffff'],subjectImageSignatures:[],
      configurations:[{id:'profile-'+id,name,endpoint:'http://localhost:11434',visionModel:'gemma3:4b',analysisModel:model,thinking:false}],
      results:[{
        profileId:'profile-'+id,profileName:name,status:'success',
        elapsedMs:210000,readingMs:24000,analysisMs:186000,
        readingTokens:1000,analysisTokens:2500,tokens:3500,
        transcription:'La lumière intervient dans la photosynthèse.',raw:'{"criteria":[]}',
        score,
        proposal:{
          summary:'',finalScore:score,questionsForTeacher:[],
          criteria:[{criterionId:'q1',points:score,rationale:'',evidence:'La lumière intervient',confidence:'medium'}],
        },
        diagnosticRuns:[{kind:'model',stage:'analysis',model,raw:'{"answers":{}}',elapsedMs:186000}],
      }],
      stage:'integrated',
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('model-evaluations','readwrite');
      transaction.objectStore('model-evaluations').put(record('archive-d1','D1 3B','d1:3b',11.75));
      transaction.objectStore('model-evaluations').put(record('archive-tev','TEV 4B','tev1:4b',12.5));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });

  await page.reload();
  await page.getByRole('button', { name: 'Évaluer les modèles' }).click();
  await openCustomTests(page);
  await page.getByRole('button', { name: /Campagnes/ }).click();
  await page.getByRole('button', { name: 'Comparer les essais sur copie' }).click();

  const comparisons = page.getByRole('group', { name: 'Expériences à comparer' });
  await expect(comparisons.getByRole('checkbox')).toHaveCount(2);
  await comparisons.getByRole('checkbox').nth(0).check();
  await comparisons.getByRole('checkbox').nth(1).check();
  await expect(page.getByRole('heading', { name: 'Comparer les notes par critère' })).toBeVisible();
  await expect(page.getByText('11.75 / 20').first()).toBeVisible();
  await expect(page.getByText('12.5 / 20').first()).toBeVisible();
  await expect(page.getByText(/sans images originales/).first()).toBeVisible();

  await page.getByRole('button', { name: 'Consulter les résultats' }).first().click();
  await expect(page.getByRole('heading', { name: 'Résultats du parcours complet' })).toBeVisible();
  await expect(page.getByText(/les images de cette expérience ne pourront pas être restaurées/)).toBeVisible();
});
