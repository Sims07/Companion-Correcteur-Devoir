import { expect, test } from '@playwright/test';

test('advanced multi-model strategy is available in Debug, not in Correction', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Debug', exact: true }).click();

  const strategy = page.getByLabel('Stratégie de comparaison');
  await expect(strategy).toBeVisible();
  await expect(strategy).toHaveValue('single');
  await strategy.selectOption('arbitrate');
  await expect(page.getByLabel('Second modèle d’analyse')).toBeVisible();
  await expect(page.getByLabel('Modèle arbitre')).toBeVisible();

  await page.getByRole('button', { name: 'Correction', exact: true }).click();
  await expect(page.getByLabel('Stratégie de comparaison')).toHaveCount(0);
});

test('evaluation presents four focused spaces and keeps launch disabled until the test copy is ready', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluation des modèles' }).click();

  const navigation = page.getByRole('navigation', { name: 'Espaces de l’évaluation' });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole('button', { name: /Configuration/ })).toHaveAttribute('aria-current', 'step');
  await expect(navigation.getByRole('button', { name: /Exécution/ })).toBeVisible();
  await expect(navigation.getByRole('button', { name: /Résultats/ })).toBeVisible();
  await expect(navigation.getByRole('button', { name: /Analyse & historique/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choisir les configurations à comparer' })).toBeVisible();
  await expect(page.getByText('Il faut au moins deux configurations.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Préparer le barème de correction' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ajouter une copie' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lancer et comparer les résultats' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Lancer l’expérience' })).toBeDisabled();

  await navigation.getByRole('button', { name: /Exécution/ }).click();
  await expect(page.getByRole('heading', { name: 'Lancer et comparer les résultats' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Préparer le barème de correction' })).toHaveCount(0);
  await navigation.getByRole('button', { name: /Résultats/ }).click();
  await expect(navigation.getByRole('button', { name: /Résultats/ })).toHaveAttribute('aria-current', 'step');
  await navigation.getByRole('button', { name: /Analyse & historique/ }).click();
  await expect(navigation.getByRole('button', { name: /Analyse & historique/ })).toHaveAttribute('aria-current', 'step');
});

test('diagnostic history exposes per-model time and Ollama token usage', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('companion-correcteur:timing-history:v1', JSON.stringify([{
      id: 'usage-fixture',
      completedAt: '2026-10-29T13:00:00.000Z',
      visionModel: 'qwen3.5:4b',
      analysisModel: 'gemma3:4b',
      thinking: false,
      correctionMode: 'integrated',
      pageCount: 1,
      readingSeconds: 4,
      analysisSeconds: 8,
      totalSeconds: 13,
      outcome: 'success',
      modelScore: 8,
      criterionScores: [{ criterionId: 'science', title: 'Exactitude', points: 8, maxPoints: 10 }],
      assignmentId: 'biology-midterm',
      assignmentTitle: 'Contrôle de biologie',
      rubricSnapshot: { title: 'Barème de biologie', criteria: [{ id: 'science', title: 'Exactitude', description: 'Exactitude scientifique', maxPoints: 10 }] },
      diagnosticStrategy: 'compare',
      diagnosticRuns: [
        { kind: 'vision', stage: 'reading', model: 'qwen3.5:4b', raw: '', elapsedMs: 4000, promptTokens: 1000, generatedTokens: 250, totalTokens: 1250, generationMs: 2000, loadMs: 300, promptEvaluationMs: 100, tokensPerSecond: 125 },
        { kind: 'model', stage: 'analysis', model: 'gemma3:4b', raw: '{"summary":"ok","criteria":[],"questionsForTeacher":[]}', elapsedMs: 8000, promptTokens: 3000, generatedTokens: 500, totalTokens: 3500, generationMs: 5000, loadMs: 500, promptEvaluationMs: 200, tokensPerSecond: 100 }
      ]
    }]));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Debug', exact: true }).click();
  await page.getByText('Historique et comparaison des performances').click();

  await expect(page.getByRole('heading', { name: 'Tableau de bord des expériences' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Tokens consommés' })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Usage par modèle' })).toBeVisible();
  await expect(page.getByText('Modèles observés')).toBeVisible();
  await expect(page.getByText('Temps cumulé des appels')).toBeVisible();
  await expect(page.getByText('Tokens mesurés (entrée + sortie)')).toBeVisible();

  await page.getByText('2 groupe(s) modèle / étape').click();
  await expect(page.getByText('qwen3.5:4b').first()).toBeVisible();
  await expect(page.getByText('gemma3:4b').first()).toBeVisible();
  await expect(page.getByText(/Tokens d’entrée : 1\s?000/)).toBeVisible();
});


test('diagnostic history compares two saved experiments with visual charts', async ({ page }) => {
  await page.addInitScript(() => {
    const base = {
      thinking: false,
      correctionMode: 'integrated',
      pageCount: 1,
      readingSeconds: 3,
      analysisSeconds: 7,
      outcome: 'success',
      criterionScores: [{ criterionId: 'science', title: 'Exactitude', points: 8, maxPoints: 10 }],
      assignmentId: 'biology-midterm',
      assignmentTitle: 'Contrôle de biologie',
      rubricSnapshot: { title: 'Barème de biologie', criteria: [{ id: 'science', title: 'Exactitude', description: 'Exactitude scientifique', maxPoints: 10 }] },
      diagnosticStrategy: 'compare',
    };
    localStorage.setItem('companion-correcteur:timing-history:v1', JSON.stringify([
      {
        ...base, id: 'compare-a', completedAt: '2026-10-29T12:00:00.000Z', referenceScores: [{ criterionId: 'science', points: 7 }],
        visionModel: 'qwen3.5:4b', analysisModel: 'gemma3:4b', totalSeconds: 10, modelScore: 8,
        diagnosticRuns: [
          { kind: 'vision', stage: 'reading', model: 'qwen3.5:4b', raw: '', elapsedMs: 3000, promptTokens: 1000, generatedTokens: 100, totalTokens: 1100 },
          { kind: 'model', stage: 'analysis', model: 'gemma3:4b', raw: JSON.stringify({ summary: 'Réponse pertinente', criteria: [{ criterionId: 'science', points: 8, rationale: 'Bonne réponse', evidence: 'Passage identifié', confidence: 'high' }], questionsForTeacher: [], finalScore: 8 }), elapsedMs: 7000, promptTokens: 2000, generatedTokens: 400, totalTokens: 2400 },
        ],
      },
      {
        ...base, id: 'compare-b', completedAt: '2026-10-29T13:00:00.000Z',
        visionModel: 'phi-mini', analysisModel: 'qwen3.5:4b', totalSeconds: 18, modelScore: 6,
        diagnosticRuns: [
          { kind: 'vision', stage: 'reading', model: 'phi-mini', raw: '', elapsedMs: 6000, promptTokens: 1200, generatedTokens: 200, totalTokens: 1400 },
          { kind: 'model', stage: 'analysis', model: 'qwen3.5:4b', raw: JSON.stringify({ summary: 'Réponse partielle', criteria: [{ criterionId: 'science', points: 6, rationale: 'Partiellement juste', evidence: 'Passage identifié', confidence: 'medium' }], questionsForTeacher: [], finalScore: 6 }), elapsedMs: 12000, promptTokens: 3000, generatedTokens: 700, totalTokens: 3700 },
        ],
      },
    ]));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Debug', exact: true }).click();
  await page.getByText('Historique et comparaison des performances').click();

  await expect(page.getByRole('heading', { name: 'Comparer deux essais' })).toBeVisible();
  await page.getByRole('checkbox', { name: /Sélectionner l’essai phi-mini/ }).check();
  await page.getByRole('checkbox', { name: /Sélectionner l’essai qwen3.5:4b \/ gemma3:4b/ }).check();

  await expect(page.getByRole('heading', { name: 'Comparaison de deux essais' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Temps total' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tokens d’entrée' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tokens générés' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Compromis entre qualité et temps' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Qualité, coût et vitesse par modèle' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Graphique Proximité de la référence/ })).toBeVisible();
  await expect(page.getByText('Erreur moyenne').first()).toBeVisible();
  await expect(page.getByText('Essai A').first()).toBeVisible();
  await expect(page.getByText('Essai B').first()).toBeVisible();
});


test('model evaluation and raw debug are separate workspaces', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Évaluation des modèles' }).click();

  await expect(page.getByRole('heading', { name: 'Choisir les configurations à comparer' })).toBeVisible();
  await expect(page.getByText('Il faut au moins deux configurations.')).toBeVisible();

  await page.getByRole('button', { name: 'Debug', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Debug des appels IA locaux' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Choisir les configurations à comparer' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Sorties brutes des modèles (0)' })).toBeVisible();

  await page.getByRole('button', { name: 'Évaluation des modèles' }).click();
  await expect(page.getByRole('heading', { name: 'Choisir les configurations à comparer' })).toBeVisible();
});
