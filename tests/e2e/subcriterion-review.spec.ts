import { expect, test } from '@playwright/test';
import { openActiveAssignment } from './helpers/teacher-workspace.ts';

test('the teacher can arbitrate only the doubtful subcriterion without erasing its reliable sibling', async ({ page }) => {
  await page.goto('/');
  await openActiveAssignment(page);
  await page.evaluate(async () => {
    const request = indexedDB.open('companion-correcteur-devoir', 5);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const subcriteria = [
      { subcriterionId:'unit-1', title:'Pression mesurée', points:1, maxPoints:1, evidence:'La pression est relevée.', assessmentStatus:'evaluated', evidenceStatus:'located' },
      { subcriterionId:'unit-2', title:'Température relevée', points:1, maxPoints:1, evidence:'Preuve à vérifier sur la copie.', assessmentStatus:'not-evaluated', evidenceStatus:'needs-review', questionForTeacher:'Retrouver le relevé de température.' },
    ];
    const proposalCriterion = {
      criterionId:'measurements', points:2, rationale:'Vérification ciblée du relevé de température.',
      evidence:'La pression est relevée.', confidence:'low', assessmentStatus:'not-evaluated',
      questionForTeacher:'Retrouver le relevé de température.', subcriteria,
    };
    const rubric = {
      title:'Barème de physique',
      criteria:[{ id:'measurements', title:'Mesures expérimentales', description:'Relever les deux paramètres.', maxPoints:2,
        subcriteria:[
          {id:'unit-1',title:'Pression mesurée',description:'Pression mesurée',maxPoints:1},
          {id:'unit-2',title:'Température relevée',description:'Température mesurée',maxPoints:1},
        ],
      }],
    };
    const proposal = { summary:'Un sous-critère doit être vérifié.', criteria:[proposalCriterion], questionsForTeacher:[proposalCriterion.questionForTeacher], finalScore:2, scoreIncomplete:true };
    const snapshot = {
      assignmentTitle:'Essai de revue', question:'Quelles sont les mesures ?', rubric, proposal,
      review:[{ ...proposalCriterion, teacherPoints:2, teacherComment:'', decision:'pending' }],
      teacherQuestions:proposalCriterion.questionForTeacher,
      images:[{ base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMQ6dH4DwADSAHIPzDQUwAAAABJRU5ErkJggg==', mimeType:'image/png', fileName:'copie.png' }],
      originalImages:[], transcription:'La pression est relevée.', subjectImages:[], subjectTranscription:null,
      correctionMode:'integrated', maximumPoints:2, hasScientificDiagrams:false,
    };
    const transaction = database.transaction('local-corrections','readwrite');
    transaction.objectStore('local-corrections').put({
      id:'review-subcriteria-case', label:'Copie sous-critères',
      rubricTitle:rubric.title, rubricFingerprint:'rubric-verification-test',
      createdAt:'2026-11-06T12:00:00.000Z', updatedAt:'2026-11-06T12:00:00.000Z',
      assignmentId:'assignment-default', assignmentTitle:'Essai de revue', snapshot,
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
    localStorage.setItem('companion-correcteur:assignments:v1',JSON.stringify([{
      id:'assignment-default',title:'Essai de revue',
      question:'Quelles sont les mesures ?', correctionMode:'integrated', rubric,
    }]));
    localStorage.setItem('companion-correcteur:active-assignment:v1','assignment-default');
  });
  await page.reload();
  await openActiveAssignment(page);
  await page.getByRole('tab', { name: /Copies/ }).click();
  await page.locator('.copy-overview-filters').getByRole('button', { name:/Corrigées/ }).click();
  await page.getByRole('button', { name:'Consulter la correction' }).click();
  const card = page.locator('.review-card').filter({ has: page.getByRole('heading', { name:'Mesures expérimentales' }) });
  await expect(card.getByText('1 à vérifier sur 2')).toBeVisible();
  await expect(card.getByText('La pression est relevée.')).toBeVisible();
  await expect(card.getByRole('group', { name:'Arbitrage du sous-critère Pression mesurée' })).toHaveCount(0);
  const pending = card.getByRole('group', { name:'Arbitrage du sous-critère Température relevée' });
  await expect(pending.getByRole('button', { name:'Confirmer 1 pt' })).toBeVisible();
  await pending.getByRole('button', { name:'Refuser · 0 pt' }).click();
  await expect(card.getByText('1 / 2', { exact:true }).first()).toBeVisible();
  await expect(card.getByText('2 évalués')).toBeVisible();
  await expect(card.getByText('Vérifié par le professeur')).toBeVisible();
  await expect(card.getByRole('group', { name:'Arbitrage du sous-critère Température relevée' })).toHaveCount(0);
});
