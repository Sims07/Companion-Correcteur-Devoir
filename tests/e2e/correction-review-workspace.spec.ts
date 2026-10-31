import { expect, test } from '@playwright/test';

test('review workspace keeps original evidence beside grading criteria on desktop and stacks on mobile', async ({ page }) => {
  await page.goto('/');

  await page.evaluate(async () => {
    const request = indexedDB.open('companion-correcteur-devoir', 3);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('local-memory')) {
          const memory = db.createObjectStore('local-memory', { keyPath: 'id' });
          memory.createIndex('correctionId', 'correctionId', { unique: false });
          memory.createIndex('rubricFingerprint', 'rubricFingerprint', { unique: false });
          memory.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('local-corrections')) {
          const corrections = db.createObjectStore('local-corrections', { keyPath: 'id' });
          corrections.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('model-evaluations')) {
          const evaluations = db.createObjectStore('model-evaluations', { keyPath: 'id' });
          evaluations.createIndex('completedAt', 'completedAt', { unique: false });
          evaluations.createIndex('assignmentId', 'assignmentId', { unique: false });
        }
      };
    });
    const transaction = database.transaction('local-corrections', 'readwrite');
    transaction.objectStore('local-corrections').put({
      id: 'design-review-copy',
      label: 'Copie de test',
      rubricTitle: 'Barème de membrane',
      rubricFingerprint: 'rubric-design-test',
      createdAt: '2026-10-29T08:00:00.000Z',
      updatedAt: '2026-10-29T08:00:00.000Z',
      assignmentTitle: 'Biologie cellulaire',
      snapshot: {
        assignmentTitle: 'Biologie cellulaire',
        question: 'Expliquez le rôle de la membrane plasmique.',
        rubric: {
          title: 'Barème de membrane',
          criteria: [
            { id: 'membrane', title: 'Rôle de la membrane', description: 'Expliquer la barrière sélective.', maxPoints: 4, analysisMode: 'scientific-diagram' },
            { id: 'transport', title: 'Transport membranaire', description: 'Identifier un transport sélectif.', maxPoints: 2 },
          ],
        },
        proposal: {
          summary: 'La réponse mentionne la membrane mais manque de précision.',
          criteria: [
              { criterionId: 'membrane', points: 2, rationale: 'Le mécanisme est partiellement expliqué.', evidence: 'La réponse mentionne la membrane.', annotationSuggestion: 'Précise le rôle de la membrane.', pageNumber: 1, confidence: 'medium' },
              { criterionId: 'transport', points: 2, rationale: 'Le transport sélectif est identifié.', evidence: 'La membrane contrôle les échanges.', pageNumber: 1, confidence: 'high' },
            ],
          questionsForTeacher: [],
          finalScore: 4,
        },
        review: [
          { criterionId: 'membrane', points: 2, rationale: 'Le mécanisme est partiellement expliqué.', evidence: 'La réponse mentionne la membrane.', annotationSuggestion: 'Précise le rôle de la membrane.', pageNumber: 1, confidence: 'medium', teacherPoints: 2, teacherComment: '', decision: 'pending' },
          { criterionId: 'transport', points: 2, rationale: 'Le transport sélectif est identifié.', evidence: 'La membrane contrôle les échanges.', pageNumber: 1, confidence: 'high', teacherPoints: 2, teacherComment: '', decision: 'pending' },
        ],
        teacherQuestions: '',
        images: [{ base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/9ioAAAAASUVORK5CYII=', mimeType: 'image/png', fileName: 'page-1.png' }],
        transcription: 'La membrane plasmique constitue une barrière sélective.',
        subjectImages: [],
        subjectTranscription: null,
        correctionMode: 'integrated',
        maximumPoints: 6,
        hasScientificDiagrams: true,
        scientificPageClassifications: [{ pageNumber: 1, kind: 'scientific-diagram', confidence: 0.96, reason: 'Schéma de cellule' }],
        scientificDiagramAnalysis: { diagrams: [{ id: 'diagram-1', pageNumber: 1, bounds: { x: 0.1, y: 0.2, width: 0.5, height: 0.4 }, diagramType: 'Cellule', summary: 'Schéma de cellule végétale', criteria: [{ criterionId: 'membrane', title: 'Rôle de la membrane', points: 3, maxPoints: 4, evidence: 'La membrane est représentée.', confidence: 0.8, requiresTeacherReview: false }], uncertainties: [] }], overallUncertainties: [] },
      },
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
    localStorage.setItem('companion-correcteur:ollama-configuration:v1', JSON.stringify({ endpoint: 'https://ai.example', apiCompatible: true, apiKey: 'test-token', visionModel: 'vision-model', analysisModel: 'analysis-model' }));
  });

  await page.reload();
  await page.getByRole('button', { name: /Corrections enregistrées/ }).click();
  await page.getByRole('button', { name: 'Consulter la correction' }).click();

  await expect(page.getByRole('heading', { name: 'Analyse des schémas scientifiques' })).toBeVisible();
  const diagramPanel = page.locator('.scientific-diagram-analysis');
  await expect(diagramPanel.getByRole('checkbox')).toHaveCount(0);
  const diagramAnalyzeButton = page.getByRole('button', { name: /Analyser les schémas avec Vision|Relancer l’analyse des schémas/ });
  await expect(diagramAnalyzeButton).toBeEnabled();
  await expect(page.getByRole('img', { name: 'Page 1 contenant le schéma détecté' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Zone du schéma repérée par Vision' })).toBeVisible();

  await expect(page.getByRole('complementary', { name: 'Copie de référence' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rôle de la membrane' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Transport membranaire' })).toBeVisible();
  const flaggedCard = page.locator('.review-card').filter({ has: page.getByRole('heading', { name: 'Rôle de la membrane' }) });
  await expect(flaggedCard.getByText('Point retiré', { exact: true })).toBeVisible();
  await expect(flaggedCard.getByText('Confiance à vérifier', { exact: true })).toBeVisible();
  await expect(flaggedCard.getByText('Le mécanisme est partiellement expliqué.')).toBeVisible();
  await expect(flaggedCard.getByText('Précise le rôle de la membrane.')).toBeVisible();
  await expect(flaggedCard.locator('details.review-explanation')).not.toHaveAttribute('open', '');
  await page.getByRole('button', { name: 'Afficher uniquement les points à examiner' }).click();
  const safeSummary = page.locator('details.review-safe-summary');
  await expect(safeSummary).toBeVisible();
  await safeSummary.locator('summary').click();
  await expect(safeSummary.getByText('Transport membranaire')).toBeVisible();
  await expect(safeSummary.getByText('La membrane contrôle les échanges.')).toBeVisible();
  const bulkConfirm = page.getByRole('button', { name: 'Confirmer les critères sans alerte (1)' });
  await expect(bulkConfirm).toBeVisible();
  await bulkConfirm.click();
  await expect(page.getByText('1 critère(s) confirmé(s)')).toBeVisible();
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByText('Confirmation groupée annulée. Les critères sont de nouveau en attente.')).toBeVisible();
  const explanation = page.locator('details.review-explanation');
  await expect(explanation).toHaveCount(1);
  await expect(explanation).not.toHaveAttribute('open', '');
  await explanation.locator('summary').click();
  await expect(explanation.getByText('La réponse mentionne la membrane.')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Page originale 1 de la copie' })).toBeVisible();
  await expect(page.getByText('Texte reconnu par l’IA')).toBeVisible();
  const locateEvidence = page.getByRole('button', { name: 'Repérer la preuve du critère Rôle de la membrane sur la page 1' });
  await expect(locateEvidence).toBeVisible();
  await locateEvidence.click();
  await expect(page.locator('#review-copy-page-1')).toHaveClass(/evidence-page-focused/);

  const sourcePane = page.locator('.review-source-pane');
  await expect(sourcePane).toHaveCSS('position', 'sticky');

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(sourcePane).toHaveCSS('position', 'static');
  await expect(page.locator('.review-workspace')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Rôle de la membrane' })).toBeVisible();

  await page.evaluate(async () => {
    const request = indexedDB.open('companion-correcteur-devoir', 3);
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction('local-corrections', 'readwrite');
    const store = transaction.objectStore('local-corrections');
    const correction = await new Promise<any>((resolve, reject) => {
      const get = store.get('design-review-copy');
      get.onsuccess = () => resolve(get.result);
      get.onerror = () => reject(get.error);
    });
    correction.snapshot.review = [correction.snapshot.review.find((item: { criterionId: string }) => item.criterionId === 'transport')];
    store.put(correction);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await page.reload();
  await page.getByRole('button', { name: /Corrections enregistrées/ }).click();
  await page.getByRole('button', { name: 'Consulter la correction' }).click();
  const incompleteBulkConfirm = page.getByRole('button', { name: 'Confirmer les critères sans alerte (1)' });
  await expect(incompleteBulkConfirm).toBeVisible();
  await expect(incompleteBulkConfirm).toBeDisabled();
});
