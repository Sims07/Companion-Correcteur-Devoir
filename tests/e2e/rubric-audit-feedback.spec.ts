import { expect, test } from '@playwright/test';

test('rubric audit stays visible across diagnostics, blocks duplicates and completes with feedback', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('companion-correcteur:assignments:v1', JSON.stringify([{
      id: 'assignment-default', title: 'Mitose L2', question: 'Schéma scientifique',
      correctionMode: 'integrated', kind: 'scientific-diagram',
      rubric: { title: 'Mitose L2', criteria: [{
        id: 'title', title: 'Titre principal', description: 'Titre commun',
        analysisMode: 'scientific-diagram', maxPoints: 2,
      }] },
    }]));
    localStorage.setItem('companion-correcteur:active-assignment:v1', 'assignment-default');
    localStorage.setItem('companion-correcteur:ollama-configuration:v1', JSON.stringify({
      endpoint: 'http://localhost:11434', apiCompatible: false,
      visionModel: 'qwen-local', analysisModel: 'qwen-local',
    }));
  });

  let requests = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/chat', async (route) => {
    requests += 1;
    await gate; // Ollama can take several minutes; inspect feedback while waiting.
    try {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        message: { content: JSON.stringify({ issues: [] }) },
      }) });
    } catch { /* A teacher may cancel the pending browser request. */ }
  });
  await page.reload();
  await page.getByRole('button', { name: /Reprendre le devoir/ }).click();
  await page.getByRole('tab', { name: 'Barème' }).click();

  const launch = page.locator('.rubric-audit-launch');
  await expect(launch).toBeVisible();
  await expect(launch).toContainText('Vérifier avec l’IA locale');
  await launch.click();

  try {
    await expect(page.locator('.rubric-audit-live').getByText('Vérification du barème en cours', { exact: true })).toBeVisible();
    await expect(launch).toBeDisabled();
    await expect(launch).toContainText('Vérification en cours');
    await expect(page.locator('.rubric-audit-elapsed')).toContainText(/\d\d:\d\d/);
    await expect(page.getByRole('button', { name: 'Arrêter la vérification' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continuer vers les copies/ })).toBeDisabled();
    await expect.poll(() => requests).toBe(1);

    await page.getByRole('button', { name: 'Suivi & diagnostic' }).click();
    await page.getByRole('button', { name: 'Correction', exact: true }).click();
    await page.getByRole('tab', { name: 'Barème' }).click();
    await expect(page.locator('.rubric-audit-live').getByText('Vérification du barème en cours', { exact: true })).toBeVisible();
    await expect(launch).toBeDisabled();
    expect(requests).toBe(1);
  } finally {
    release();
  }

  await expect(page.getByText('Vérification terminée')).toBeVisible();
  await expect(launch).toContainText('Relancer la vérification');
  await expect(launch).toBeEnabled();
  await expect(page.getByText('Aucune ambiguïté signalée par le modèle.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Continuer vers les copies/ })).toBeEnabled();
});

test('teacher can cancel a pending rubric audit and retains the option to retry', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('companion-correcteur:assignments:v1', JSON.stringify([{
      id: 'assignment-default', title: 'Mitose L2', question: 'Schéma scientifique',
      correctionMode: 'integrated', kind: 'scientific-diagram',
      rubric: { title: 'Mitose L2', criteria: [{
        id: 'title', title: 'Titre principal', description: 'Titre commun',
        analysisMode: 'scientific-diagram', maxPoints: 2,
      }] },
    }]));
    localStorage.setItem('companion-correcteur:active-assignment:v1', 'assignment-default');
    localStorage.setItem('companion-correcteur:ollama-configuration:v1', JSON.stringify({
      endpoint: 'http://localhost:11434', apiCompatible: false,
      visionModel: 'qwen-local', analysisModel: 'qwen-local',
    }));
  });

  let requests = 0;
  await page.route('**/api/chat', async (route) => {
    requests += 1;
    if (requests === 1) {
      await new Promise<void>((resolve) => {
        route.request().failure() ? resolve() : setTimeout(resolve, 2200);
      });
    }
    try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: { content: '{"issues":[]}' } }) }); }
    catch { /* Canceled request. */ }
  });
  await page.reload();
  await page.getByRole('button', { name: /Reprendre le devoir/ }).click();
  await page.getByRole('tab', { name: 'Barème' }).click();
  await page.getByRole('button', { name: 'Vérifier avec l’IA locale' }).click();
  await expect(page.locator('.rubric-audit-live')).toBeVisible();
  await page.getByRole('button', { name: 'Arrêter la vérification' }).click();
  await expect(page.getByText('Vérification arrêtée.')).toBeVisible();
  await expect(page.locator('.rubric-audit-launch')).toBeEnabled();
  await page.locator('.rubric-audit-launch').click();
  await expect(page.getByText('Vérification terminée')).toBeVisible();
  expect(requests).toBe(2);
});


test('AI recommendations become a guided teacher dialogue even if the result arrives in diagnostics', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('companion-correcteur:assignments:v1', JSON.stringify([{
      id: 'assignment-default', title: 'Mitose L2', question: 'Schéma scientifique',
      correctionMode: 'integrated', kind: 'scientific-diagram',
      rubric: { title: 'Mitose L2', criteria: [
        { id: 'drawing', title: 'Qualité du dessin', description: '', maxPoints: 4,
          analysisMode: 'scientific-diagram',
          subcriteria: [
            { id: 'drawing-clean', title: 'Impression générale propre', description: 'Dessin propre', maxPoints: 2 },
            { id: 'drawing-proportions', title: 'Proportions respectées', description: 'Proportions fidèles', maxPoints: 2 },
          ] },
      ] },
    }]));
    localStorage.setItem('companion-correcteur:active-assignment:v1', 'assignment-default');
    localStorage.setItem('companion-correcteur:ollama-configuration:v1', JSON.stringify({
      endpoint: 'http://localhost:11434', apiCompatible: false,
      visionModel: 'qwen-local', analysisModel: 'qwen-local',
    }));
  });

  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let requests = 0;
  await page.route('**/api/chat', async (route) => {
    requests += 1;
    await gate;
    try {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        message: { content: JSON.stringify({ issues: [
          { criterionId: 'drawing-clean', subcriterionId: null, priority: 'high',
            reason: 'Critère subjectif sans seuil de tolérance.',
            question: 'Quels éléments spécifiques rendent un dessin propre ?',
            options: ['Aucune trace de gommage', 'Légères traces acceptées'],
            suggestion: 'Le dessin ne présente pas de ratures gênant la lecture.' },
          { criterionId: 'drawing-proportions', subcriterionId: null, priority: 'medium',
            reason: 'Aucune référence de proportion n’est précisée.',
            question: 'Comment apprécier la fidélité des proportions ?',
            options: ['Comparaison visuelle', 'Échelle explicitement exigée'],
            suggestion: 'Les proportions sont comparées aux structures observées.' },
        ] }) },
      }) });
    } catch { /* User may cancel. */ }
  });

  await page.reload();
  await page.getByRole('button', { name: /Reprendre le devoir/ }).click();
  await page.getByRole('tab', { name: 'Barème' }).click();
  await page.locator('.rubric-audit-launch').click();

  await page.getByRole('button', { name: 'Suivi & diagnostic' }).click();
  try {
    release(); // The model finishes while the teacher is on another screen.
    await expect.poll(() => requests).toBe(1);
    await page.getByRole('button', { name: 'Correction', exact: true }).click();
    await page.getByRole('tab', { name: 'Barème' }).click();
    await expect(page.getByRole('heading', { name: 'Questions à discuter avec le professeur' })).toBeVisible();
    await expect(page.getByText('Quels éléments spécifiques rendent un dessin propre ?')).toBeVisible();
    await expect(page.getByText('Le dessin ne présente pas de ratures gênant la lecture.')).toBeVisible();
    await expect(page.getByText('0 / 2 questions traitées')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Valider ma réponse' })).toBeDisabled();
    await page.getByRole('button', { name: 'Utiliser cette reformulation comme réponse' }).click();
    await page.getByRole('button', { name: 'Valider ma réponse' }).click();
    await expect(page.getByText('Comment apprécier la fidélité des proportions ?')).toBeVisible();
    await page.getByText('Comparaison visuelle', { exact: true }).click();
    await page.getByRole('button', { name: 'Valider ma réponse' }).click();
    await expect(page.getByRole('heading', { name: 'Récapitulatif des décisions' })).toBeVisible();
    await expect(page.getByText('2 / 2 questions traitées')).toBeVisible();
    await expect(page.getByRole('button', { name: /Appliquer 2 précisions/ })).toBeEnabled();
    await page.reload();
    await page.getByRole('button', { name: /Reprendre le devoir/ }).click();
    await page.getByRole('tab', { name: 'Barème' }).click();
    await expect(page.getByText('2 / 2 questions traitées')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Récapitulatif des décisions' })).toBeVisible();
    expect(requests).toBe(1);
  } finally {
    release();
  }
});
