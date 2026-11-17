import { expect, test } from '@playwright/test';

test('a saved correction always exposes every criterion and its evidence after navigating between archives', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const request = indexedDB.open('companion-correcteur-devoir', 7);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('local-corrections')) {
          const store = request.result.createObjectStore('local-corrections', { keyPath: 'id' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
    });
    const rubric = {
      title: 'Barème scientifique archivé',
      criteria: [
        { id: 'title', title: 'Titre principal', description: '', maxPoints: 2 },
        { id: 'legends', title: 'Légendes du schéma', description: '', maxPoints: 2 },
      ],
    };
    const criteria = [
      {
        criterionId: 'title', points: 2, teacherPoints: 2,
        rationale: 'Le titre principal correspond aux quatre sous-schémas.',
        evidence: 'Un titre général est présent sous le dessin.',
        confidence: 'high', teacherComment: '', decision: 'accepted',
        subcriteria: [{
          subcriterionId: 'title-placement', title: 'Emplacement du titre',
          points: 2, maxPoints: 2, evidence: 'Le titre est placé sous le dessin.',
          assessmentStatus: 'evaluated',
        }],
      },
      {
        criterionId: 'legends', points: 2, teacherPoints: 2,
        rationale: 'Les traits de rappel pointent les structures correspondantes.',
        evidence: 'Les légendes sont alignées en colonne.',
        confidence: 'high', teacherComment: 'Bonne présentation.', decision: 'accepted',
      },
    ];
    const image = {
      base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMQ6dH4DwADSAHIPzDQUwAAAABJRU5ErkJggg==',
      mimeType: 'image/png', fileName: 'schema.png',
    };
    const store = database.transaction('local-corrections', 'readwrite').objectStore('local-corrections');
    for (const [id, label] of [['copy-a', 'Copie A'], ['copy-b', 'Copie B']]) {
      store.put({
        id, label, rubricTitle: rubric.title, rubricFingerprint: 'scientific-rubric',
        createdAt: '2026-11-15T09:00:00.000Z', updatedAt: '2026-11-15T10:00:00.000Z',
        assignmentId: 'assignment-default', assignmentTitle: 'Biologie',
        snapshot: {
          assignmentTitle: 'Biologie', question: 'Dessiner un schéma.',
          rubric, proposal: { summary: 'Schéma correctement légendé.', criteria, finalScore: 4, questionsForTeacher: [] },
          review: criteria, teacherQuestions: '', images: [image], originalImages: [image],
          transcription: null, subjectImages: [], subjectTranscription: null,
          correctionMode: 'integrated', maximumPoints: 4, hasScientificDiagrams: true,
        },
      });
    }
    await new Promise<void>((resolve, reject) => {
      store.transaction.oncomplete = () => resolve();
      store.transaction.onerror = () => reject(store.transaction.error);
      store.transaction.onabort = () => reject(store.transaction.error);
    });
    database.close();
    localStorage.setItem('companion-correcteur:assignments:v1', JSON.stringify([{
      id: 'assignment-default', title: 'Biologie', question: 'Dessiner un schéma.',
      correctionMode: 'integrated', kind: 'scientific-diagram',
      rubric,
    }]));
    localStorage.setItem('companion-correcteur:active-assignment:v1', 'assignment-default');
    localStorage.setItem('companion-correcteur:auto-background-correction:v1', 'false');
  });
  await page.reload();
  await page.getByRole('button', { name: /Reprendre le devoir/ }).click();

  async function inspectArchivedCopy(label: string) {
    await page.locator('.copy-overview-filters').getByRole('button', { name: /Corrigées/ }).click();
    await page.locator('.correction-series-card').filter({ hasText: label })
      .getByRole('button', { name: 'Consulter la correction' }).click();
    await expect(page.getByText('Correction enregistrée ouverte en lecture et vérification locale.')).toBeVisible();
    await expect(page.locator('.review-card')).toHaveCount(2);
    await expect(page.locator('.review-safe-summary')).toHaveCount(0);
    const titleCard = page.locator('.review-card').filter({ has: page.getByRole('heading', { name: 'Titre principal' }) });
    const legendsCard = page.locator('.review-card').filter({ has: page.getByRole('heading', { name: 'Légendes du schéma' }) });
    await expect(titleCard).toBeVisible();
    await expect(legendsCard).toBeVisible();
    await titleCard.locator('details.review-explanation > summary').click();
    await expect(titleCard.getByText('Un titre général est présent sous le dessin.')).toBeVisible();
    await expect(titleCard.getByText('Le titre principal correspond aux quatre sous-schémas.')).toBeVisible();
    await titleCard.locator('details.review-quality-details > summary').click();
    await expect(titleCard.getByText('Emplacement du titre')).toBeVisible();
    await expect(titleCard.getByText('Le titre est placé sous le dessin.')).toBeVisible();
    await legendsCard.locator('details.review-explanation > summary').click();
    await expect(legendsCard.getByText('Les légendes sont alignées en colonne.')).toBeVisible();
    await expect(legendsCard.getByText('Les traits de rappel pointent les structures correspondantes.')).toBeVisible();
    await page.getByRole('button', { name: 'Voir les copies corrigées' }).click();
  }

  await inspectArchivedCopy('Copie A');
  // The prior archived copy remains finalized. Switching to another archive
  // used to re-enable the exception-only filter and hide every green criterion.
  await inspectArchivedCopy('Copie B');
  await inspectArchivedCopy('Copie A');
});
