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
      visionModel: 'qwen-local', analysisModel: 'qwen-local', analysisThinking: true,
    }));
  });

  let requests = 0;
  const modes: boolean[] = [];
  const tokenBudgets: Array<{ num_predict: number; num_ctx?: number }> = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/chat', async (route) => {
    requests += 1;
    const payload = route.request().postDataJSON() as {
      think: boolean; stream: boolean; options: { num_predict: number; num_ctx?: number };
    };
    expect(payload.stream).toBe(true);
    modes.push(payload.think);
    tokenBudgets.push(payload.options);
    await gate; // Ollama can take several minutes; inspect feedback while waiting.
    try {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ done: true,
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
  await expect(page.locator('.rubric-audit-privacy')).toContainText('Thinking : activé pour cette vérification');
  await expect(page.locator('.rubric-audit-privacy')).toContainText(/16[^0-9]*384 tokens/);
  await expect(page.locator('.rubric-audit-privacy')).toContainText(/24[^0-9]*576 tokens/);
  await launch.click();

  try {
    await expect(page.locator('.rubric-audit-live').getByText('Vérification du barème en cours', { exact: true })).toBeVisible();
    await expect(page.locator('.rubric-audit-live')).toContainText('Thinking demandé au modèle');
    await expect(launch).toBeDisabled();
    await expect(launch).toContainText('Vérification en cours');
    await expect(page.locator('.rubric-audit-elapsed')).toContainText(/\d\d:\d\d/);
    await expect(page.getByRole('button', { name: 'Arrêter la vérification' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continuer vers les copies/ })).toBeDisabled();
    await expect.poll(() => requests).toBe(1);
    expect(modes).toEqual([true]);
    expect(tokenBudgets).toEqual([{ temperature: 0, num_predict: 16384, num_ctx: 24576 }]);

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
    try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ done: true, message: { content: '{"issues":[]}' } }) }); }
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
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ done: true,
        message: { content: JSON.stringify({ issues: [
          { ref: 'C1.S1', priority: 'high',
            reason: 'Critère subjectif sans seuil de tolérance.',
            question: 'Quels éléments spécifiques rendent un dessin propre ?',
            options: ['Aucune trace de gommage', 'Légères traces acceptées'],
            suggestion: 'Le dessin ne présente pas de ratures gênant la lecture.' },
          { ref: 'C1.S2', priority: 'medium',
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


test('teacher can recover an already completed Ollama JSON response without spending another model run', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('companion-correcteur:assignments:v1', JSON.stringify([{
      id: 'assignment-default', title: 'Mitose L2', question: 'Schéma scientifique',
      correctionMode: 'integrated', kind: 'scientific-diagram',
      rubric: { title: 'Mitose L2', criteria: [{
        id: 'drawing', title: 'Qualité du dessin', description: '', maxPoints: 2,
        analysisMode: 'scientific-diagram',
        subcriteria: [{ id: 'drawing-clean', title: 'Impression générale propre', description: 'Dessin sans traces gênantes', maxPoints: 2 }],
      }] },
    }]));
    localStorage.setItem('companion-correcteur:active-assignment:v1', 'assignment-default');
  });
  let requests = 0;
  await page.route('**/api/chat', async (route) => {
    requests += 1;
    await route.abort();
  });
  await page.reload();
  await page.getByRole('button', { name: /Reprendre le devoir/ }).click();
  await page.getByRole('tab', { name: 'Barème' }).click();
  await page.getByText('Récupérer une analyse déjà terminée dans le diagnostic').click();
  const recovered = {
    model: 'gemma4:12b', message: { content: JSON.stringify({ issues: [
      { criterionId: 'drawing-clean', subcriterionId: null, priority: 'high',
        reason: 'Le critère de propreté n’a pas de tolérance explicite.',
        question: 'Des traces légères de gommage sont-elles autorisées ?',
        options: ['Oui', 'Non'], suggestion: 'Tolérer des traces qui ne nuisent pas à la lecture.' },
    ] }) },
  };
  await page.getByLabel('Réponse du modèle (JSON brut ou réponse complète Ollama)').fill(JSON.stringify(recovered));
  await page.getByRole('button', { name: 'Charger les questions déjà générées' }).click();
  await expect(page.getByText('Résultat récupéré : les questions de l’IA sont disponibles ci-dessous.')).toBeVisible();
  await expect(page.getByText('Des traces légères de gommage sont-elles autorisées ?')).toBeVisible();
  await expect(page.locator('.rubric-audit-conversation-heading').getByText('Qualité du dessin / Impression générale propre')).toBeVisible();
  expect(requests).toBe(0);
  await page.reload();
  await page.getByRole('button', { name: /Reprendre le devoir/ }).click();
  await page.getByRole('tab', { name: 'Barème' }).click();
  await expect(page.getByText('Des traces légères de gommage sont-elles autorisées ?')).toBeVisible();
});


test('teacher confirms restoration of the original rubric without losing historical enrichments', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const original = { title: 'Schéma initial', criteria: [{
      id: 'bio', title: 'Biologie', description: 'Description du professeur',
      maxPoints: 2, analysisMode: 'scientific-diagram',
    }] };
    const altered = { title: 'Schéma enrichi', criteria: [{
      id: 'bio', title: 'Biologie', description: 'Description modifiée manuellement',
      maxPoints: 3, analysisMode: 'scientific-diagram',
      scientificExpectations: ['Référence IA acceptée'],
    }] };
    localStorage.setItem('companion-correcteur:assignments:v1', JSON.stringify([{
      id: 'assignment-default', title: 'Devoir mitose', question: 'Schéma scientifique',
      correctionMode: 'integrated', kind: 'scientific-diagram', rubric: altered,
    }]));
    localStorage.setItem('companion-correcteur:active-assignment:v1', 'assignment-default');
    localStorage.setItem('companion-correcteur:rubric-baseline:v1:assignment-default',
      JSON.stringify({ source: 'initial', rubric: original }));
    localStorage.setItem('companion-correcteur:rubric-versions:v1:assignment-default', JSON.stringify([{
      appliedAt: '2026-11-17T10:00:00Z', model: 'gemma-local', original,
      clarified: altered, originalSignature: 'original', clarifiedSignature: 'enriched',
      decisions: [{ issueId: 'title', choice: 'Oui', decision: 'accepted' }],
    }]));
  });
  await page.reload();
  await page.getByRole('button', { name: /Reprendre le devoir/ }).click();
  await page.getByRole('tab', { name: 'Barème' }).click();
  const aside = page.getByRole('complementary', { name: 'Synthèse du barème' });
  const restore = aside.getByRole('button', { name: 'Restaurer le barème initial' });
  await expect(restore).toBeVisible();
  await expect(page.locator('.rubric-audit-cumulative')).not.toHaveAttribute('open', '');
  await expect(page.getByRole('button', { name: 'Restaurer le barème initial' })).toHaveCount(1);
  await restore.click();
  await expect(page.getByRole('group', { name: 'Confirmer la restauration du barème' })).toContainText('modifications manuelles');
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Confirmer la restauration du barème' })).toHaveCount(0);
  await restore.click();
  await page.getByRole('button', { name: 'Confirmer la restauration' }).click();
  await expect(page.getByText('Barème initial actuellement utilisé.')).toBeVisible();
  await expect(page.getByText('Le barème actuel a évolué depuis la dernière application IA.')).toHaveCount(0);
  const result = await page.evaluate(() => ({
    rubric: JSON.parse(localStorage.getItem('companion-correcteur:assignments:v1') ?? '[]')[0].rubric,
    original: JSON.parse(localStorage.getItem('companion-correcteur:rubric-baseline:v1:assignment-default') ?? '{}').rubric,
    versions: JSON.parse(localStorage.getItem('companion-correcteur:rubric-versions:v1:assignment-default') ?? '[]').length,
  }));
  expect(result.rubric).toEqual(result.original);
  expect(result.versions).toBe(1);
  await page.reload();
  await page.getByRole('button', { name: /Reprendre le devoir/ }).click();
  await page.getByRole('tab', { name: 'Barème' }).click();
  await expect(page.getByText('Barème initial actuellement utilisé.')).toBeVisible();
});


test('legacy assignments can restore the earliest retained rubric from the summary without expanding history', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const firstRetained = { title: 'Version conservée', criteria: [{
      id: 'title', title: 'Titre commun', description: 'Texte professeur', maxPoints: 2,
      analysisMode: 'scientific-diagram',
    }] };
    const modified = { title: 'Version enrichie', criteria: [{
      id: 'title', title: 'Titre commun', description: 'Texte modifié', maxPoints: 2,
      analysisMode: 'scientific-diagram',
      scientificExpectations: ['Référence scientifique validée'],
    }] };
    localStorage.setItem('companion-correcteur:assignments:v1', JSON.stringify([{
      id: 'assignment-default', title: 'Devoir ancien', question: 'Schéma',
      correctionMode: 'integrated', kind: 'scientific-diagram', rubric: modified,
    }]));
    localStorage.setItem('companion-correcteur:active-assignment:v1', 'assignment-default');
    localStorage.removeItem('companion-correcteur:rubric-baseline:v1:assignment-default');
    localStorage.setItem('companion-correcteur:rubric-versions:v1:assignment-default', JSON.stringify([{
      appliedAt: '2026-11-17T10:00:00Z', model: 'local', original: firstRetained,
      clarified: modified, originalSignature: 'previous', clarifiedSignature: 'changed', decisions: [],
    }]));
  });
  await page.reload();
  await page.getByRole('button', { name: /Reprendre le devoir/ }).click();
  await page.getByRole('tab', { name: 'Barème' }).click();
  const aside = page.getByRole('complementary', { name: 'Synthèse du barème' });
  const restore = aside.getByRole('button', { name: 'Restaurer la première version conservée' });
  await expect(restore).toBeVisible();
  await expect(aside).toContainText('l’origine exacte n’est pas garantie');
  await restore.click();
  await aside.getByRole('button', { name: 'Confirmer la restauration' }).click();
  await expect(aside.getByText('Première version conservée utilisée.')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const assignments = JSON.parse(localStorage.getItem('companion-correcteur:assignments:v1') ?? '[]');
    return assignments[0]?.rubric?.title;
  })).toBe('Version conservée');
});
