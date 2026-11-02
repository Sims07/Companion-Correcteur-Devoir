import { expect, test } from '@playwright/test';
import { openActiveAssignment } from './helpers/teacher-workspace';

test('navigue entre huit copies de statuts variés en gardant compteur et rail synchronisés', async ({ page }) => {
  await page.goto('/');
  await openActiveAssignment(page);

  await page.evaluate(async () => {
    localStorage.setItem('companion-correcteur:auto-background-correction:v1', 'false');
    const request = indexedDB.open('companion-correcteur-devoir', 5);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rubric = { title: 'Biologie', criteria: [{ id: 'c1', title: 'Critère', description: '', maxPoints: 10 }] };
    const image = { fileName: 'copie.png', mimeType: 'image/png', base64: 'aA==' };
    const proposal = { summary: 'Proposition prête à vérifier.', criteria: [{ criterionId: 'c1', points: 8, rationale: 'Raisonnement correct', evidence: 'Élément présent', pageNumber: 1, confidence: 'high' }], questionsForTeacher: [], finalScore: 8 };
    const makeJob = (id: string, status: string, date: string, completedCriteria: number) => ({
      id, assignmentId: 'assignment-default', label: id, question: 'Question de biologie', rubric,
      correctionMode: 'integrated', images: [image], originalImages: [image], subjectImages: [],
      detectTeacherAnnotations: false, annotationInkColor: 'none', annotationInkColorApplied: true,
      visionModel: 'vision', analysisModel: 'analysis', thinking: false, createdAt: date, updatedAt: date,
      status, phase: status === 'processing' ? 'reading' : 'complete', completedPages: 0,
      completedCriteria, totalCriteria: 1, transcription: 'Réponse', partialCriteria: completedCriteria ? proposal.criteria : [],
      proposal: status === 'pending' || status === 'processing' ? null : proposal,
      reviewDraft: [], teacherQuestionsDraft: '', error: null, imageFingerprint: null,
    });
    const transaction = database.transaction(['background-corrections', 'local-corrections'], 'readwrite');
    const jobs = transaction.objectStore('background-corrections');
    jobs.put(makeJob('01-reprendre', 'needs-review', '2026-11-01T08:00:00.000Z', 0));
    jobs.put(makeJob('02-verifier', 'ready', '2026-11-01T08:01:00.000Z', 1));
    jobs.put(makeJob('03-analyse', 'processing', '2026-11-01T08:02:00.000Z', 0));
    jobs.put(makeJob('04-attente', 'pending', '2026-11-01T08:03:00.000Z', 0));
    const corrections = transaction.objectStore('local-corrections');
    for (let index = 5; index <= 8; index += 1) {
      const date = '2026-11-0' + (index - 4) + 'T09:00:00.000Z';
      corrections.put({
        id: '0' + index + '-archive', label: '0' + index + '-archivée', rubricTitle: rubric.title,
        rubricFingerprint: 'fingerprint', createdAt: date, updatedAt: date,
        assignmentId: 'assignment-default', assignmentTitle: 'Devoir de biologie',
        snapshot: {
          assignmentTitle: 'Devoir de biologie', question: 'Question de biologie', rubric, proposal,
          review: [{ criterionId: 'c1', points: 8, teacherPoints: 8, teacherComment: '', decision: 'accepted', confidence: 'high', rationale: 'Correct', evidence: 'Présent' }],
          teacherQuestions: '', images: [image], originalImages: [image], subjectImages: [],
          subjectTranscription: null, transcription: 'Réponse', correctionMode: 'integrated', maximumPoints: 10,
        },
      });
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  });

  await page.reload();
  await openActiveAssignment(page);
  await page.getByRole('tab', { name: /Copies/ }).click();
  await page.locator('.copy-overview-filters').getByRole('button', { name: /À vérifier/ }).click();
  await page.locator('.copy-overview-grid li').filter({ hasText: '01-reprendre' }).getByRole('button', { name: 'Ouvrir', exact: true }).click();

  await expect(page.getByText('Copie 1 sur 8')).toBeVisible();
  await expect(page.locator('.teacher-copy-rail-list button[aria-current="page"]')).toContainText('01-reprendre');
  const expectedLabels = ['02-verifier', '03-analyse', '04-attente', '08-archivée', '07-archivée', '06-archivée', '05-archivée'];
  for (let index = 0; index < expectedLabels.length; index += 1) {
    await page.getByRole('button', { name: 'Copie suivante' }).click();
    await expect(page.locator('.copy-review-position strong')).toHaveText('Copie ' + (index + 2) + ' sur 8');
    await expect(page.locator('.teacher-copy-rail-list button[aria-current="page"]')).toContainText(expectedLabels[index]);
    await expect(page.locator('.teacher-copy-rail-list button[aria-current="page"]')).toContainText(expectedLabels[index]);
  }
  await expect(page.getByRole('button', { name: 'Copie suivante' })).toBeDisabled();
});
