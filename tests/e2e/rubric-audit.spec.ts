import { expect, test } from '@playwright/test';

test('teacher audits a rubric locally and retains their choice after refresh', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('companion-correcteur:assignments:v1', JSON.stringify([{
      id: 'assignment-default', title: 'Dessin de mitose', question: 'Observer les phases',
      correctionMode: 'integrated', kind: 'scientific-diagram',
      rubric: { title: 'Mitose', criteria: [{ id: 'title', title: 'Titre principal',
        description: '', analysisMode: 'scientific-diagram', maxPoints: 2 }] },
    }]));
    localStorage.setItem('companion-correcteur:active-assignment:v1', 'assignment-default');
    localStorage.setItem('companion-correcteur:ollama-configuration:v1', JSON.stringify({
      endpoint: 'http://localhost:11434', apiCompatible: false,
      visionModel: 'qwen', analysisModel: 'qwen',
    }));
  });
  await page.route('**/api/chat', async (route) => {
    const payload = route.request().postDataJSON() as { messages: Array<{ content: string }> };
    expect(payload.messages[0].content).toContain('Mitose');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      message: { content: JSON.stringify({ issues: [{
        criterionId: 'title', subcriterionId: null, priority: 'high',
        reason: 'Un sous-titre peut être confondu avec un titre global.',
        question: 'Faut-il un titre principal commun à tous les schémas ?',
        options: ['Oui, un titre commun', 'Non, les sous-titres suffisent'],
        suggestion: 'Un titre commun est attendu.',
      }] }) },
    }) });
  });
  await page.reload();
  await page.getByRole('button', { name: /Reprendre le devoir/ }).click();
  await page.getByRole('tab', { name: 'Barème' }).click();
  await page.getByRole('button', { name: 'Vérifier avec l’IA locale' }).click();
  await expect(page.getByText('Faut-il un titre principal commun à tous les schémas ?')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Questions à discuter avec le professeur' })).toBeVisible();
  await expect(page.getByText('Un titre commun est attendu.', { exact: true })).toBeVisible();
  await page.getByText('Oui, un titre commun', { exact: true }).click();
  await page.getByRole('button', { name: 'Valider ma réponse' }).click();
  await expect(page.getByText(/Règle retenue/)).toBeVisible();
  await page.getByRole('button', { name: /Appliquer 1 précision/ }).click();
  const applied = page.getByLabel('Version active du barème clarifié');
  await expect(applied.getByText('Voici ce qui a changé dans votre barème')).toBeVisible();
  await expect(applied.getByText('Utilisé pour les prochaines corrections')).toBeVisible();
  await expect(applied.getByText('Titre principal', { exact: true })).toBeVisible();
  await expect(applied.getByText('Aucune précision renseignée.')).toBeVisible();
  await expect(applied.getByText(/Décision du professeur : Oui, un titre commun/)).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const profiles = JSON.parse(localStorage.getItem('companion-correcteur:assignments:v1') ?? '[]');
    return profiles.find((item: { id: string }) => item.id === 'assignment-default')?.rubric.criteria[0].description;
  })).toContain('Oui, un titre commun');
  await page.reload();
  await page.getByRole('button', { name: /Reprendre le devoir/ }).click();
  await page.getByRole('tab', { name: 'Barème' }).click();
  await expect(page.getByLabel('Version active du barème clarifié')).toBeVisible();
  await expect(page.getByLabel('Version active du barème clarifié').getByText(/Oui, un titre commun/)).toBeVisible();
  await page.getByText(/Historique des clarifications/).click();
  await page.getByText('Comparer le barème initial et la version appliquée').click();
  await expect(page.locator('.rubric-audit-history .rubric-audit-change-comparison')).toBeVisible();
  await expect(page.locator('.rubric-audit-history').getByText('Ajout validé par le professeur')).toBeVisible();
});

test('scientific enrichment is reviewed beside the original, previewed, applied and persisted', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('companion-correcteur:assignments:v1', JSON.stringify([{
      id: 'assignment-default', title: 'Mitose végétale', question: 'Phases de la mitose',
      correctionMode: 'integrated', kind: 'scientific-diagram',
      rubric: { title: 'Mitose', criteria: [{
        id: 'biology', title: 'Compréhension', description: 'Structures cohérentes avec la phase',
        analysisMode: 'scientific-diagram', maxPoints: 2,
        subcriteria: [{ id: 'phases', title: 'Respect biologique', description: 'Conformité biologique', maxPoints: 2 }],
      }] },
    }]));
    localStorage.setItem('companion-correcteur:active-assignment:v1', 'assignment-default');
    localStorage.setItem('companion-correcteur:ollama-configuration:v1', JSON.stringify({
      endpoint: 'http://localhost:11434', apiCompatible: false,
      visionModel: 'qwen-local', analysisModel: 'qwen-local',
    }));
  });
  let calls = 0;
  await page.route('**/api/chat', async route => {
    calls++;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      message: { content: JSON.stringify({ issues: [
        { kind: 'scientific', criterionId: 'biology', subcriterionId: 'phases', priority: 'high',
          reason: 'Les attendus biologiques ne sont pas définis.',
          question: 'Souhaitez-vous détailler les phases ?',
          options: ['Oui', 'Adapter'],
          suggestion: 'En métaphase, l’enveloppe nucléaire est absente.' },
        { kind: 'clarification', criterionId: 'biology', subcriterionId: null, priority: 'medium',
          reason: 'Le calcul partiel est imprécis.',
          question: 'Comment attribuer les points partiels ?',
          options: ['Selon les éléments corrects', 'Seulement si toutes les phases sont exactes'],
          suggestion: 'Attribuer un partiel selon les éléments corrects.' },
      ] }) },
    }) });
  });
  await page.reload();
  await page.getByRole('button', { name: /Reprendre le devoir/ }).click();
  await page.getByRole('tab', { name: 'Barème' }).click();
  await page.getByRole('button', { name: 'Vérifier avec l’IA locale' }).click();
  await expect(page.getByRole('heading', { name: 'Clarifications et enrichissements scientifiques' })).toBeVisible();
  await expect(page.getByText('Conformité biologique', { exact: false })).toBeVisible();
  await expect(page.getByText('Référence scientifique proposée par l’IA · non appliquée')).toBeVisible();
  await page.getByText('Oui, mais l’adapter').click();
  await page.getByLabel('Modifier la référence à valider').fill('En métaphase, l’enveloppe nucléaire a disparu.');
  await page.getByRole('button', { name: 'Valider cet enrichissement' }).click();
  const preview = page.getByLabel('Aperçu du barème avant application');
  await expect(preview).toContainText('En métaphase, l’enveloppe nucléaire a disparu.');
  await expect(preview).toContainText('Références scientifiques avant');
  await expect(preview).toContainText('Texte original du professeur · conservé');
  await expect(preview).toContainText('Conformité biologique');
  await page.getByText('Selon les éléments corrects', { exact: true }).click();
  await page.getByRole('button', { name: 'Valider ma réponse' }).click();
  await expect(preview).toContainText('Selon les éléments corrects');
  await page.getByRole('button', { name: /Appliquer 2 modifications/ }).click();
  const applied = page.getByLabel('Version active du barème clarifié');
  await expect(applied).toBeVisible();
  await expect(applied).toContainText('En métaphase, l’enveloppe nucléaire a disparu.');
  expect(calls).toBe(1);
  await expect.poll(async () => page.evaluate(() => {
    const items = JSON.parse(localStorage.getItem('companion-correcteur:assignments:v1') ?? '[]');
    return items[0]?.rubric?.criteria?.[0]?.subcriteria?.[0]?.scientificExpectations?.[0];
  })).toBe('En métaphase, l’enveloppe nucléaire a disparu.');
  await page.reload();
  await page.getByRole('button', { name: /Reprendre le devoir/ }).click();
  await page.getByRole('tab', { name: 'Barème' }).click();
  await expect(page.getByLabel('Version active du barème clarifié')).toContainText('En métaphase, l’enveloppe nucléaire a disparu.');
  await expect(page.getByLabel('Version active du barème clarifié')).toContainText('Références scientifiques validées');
  await expect(page.getByText(/Bilan cumulé/)).toBeVisible();
  const editor = page.locator('.criterion-editor').first();
  await editor.locator('summary').click();
  const enrichments = editor.getByLabel('Enrichissements du critère Compréhension');
  await expect(enrichments).toContainText('En métaphase, l’enveloppe nucléaire a disparu.');
  await expect(enrichments).toContainText('Application 1');
  await enrichments.getByRole('button', { name: 'Retirer cet ajout' }).first().click();
  await expect(enrichments.getByText('Retirer uniquement cet ajout pour les prochaines corrections ?')).toBeVisible();
  await enrichments.getByRole('button', { name: 'Confirmer le retrait' }).click();
  await expect.poll(async () => page.evaluate(() => {
    const profiles = JSON.parse(localStorage.getItem('companion-correcteur:assignments:v1') ?? '[]');
    return profiles[0]?.rubric?.criteria?.[0]?.subcriteria?.[0]?.scientificExpectations?.length ?? 0;
  })).toBe(0);
  await expect(page.getByText(/Historique des clarifications/)).toBeVisible();
});
