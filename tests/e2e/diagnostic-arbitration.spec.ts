import { expect, test } from '@playwright/test';

test('multi-model experiment is available in Diagnostic IA only', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Diagnostic IA' }).click();

  const strategy = page.getByLabel('Stratégie de comparaison');
  await expect(strategy).toBeVisible();
  await expect(strategy).toHaveValue('single');

  await strategy.selectOption('arbitrate');
  await expect(page.getByLabel('Second modèle d’analyse')).toBeVisible();
  await expect(page.getByLabel('Modèle arbitre')).toBeVisible();

  await page.getByRole('button', { name: 'Correction', exact: true }).click();
  await expect(page.getByLabel('Stratégie de comparaison')).toHaveCount(0);
});

test('diagnostic presents a guided journey and a useful empty results state', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Diagnostic IA' }).click();

  await expect(page.getByRole('navigation', { name: 'Parcours d’évaluation des modèles' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Préparer l’expérience/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Analyser les résultats/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Comparer dans le temps/ })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Aucun résultat pour le moment' })).toBeVisible();
  await expect(page.getByText(/comparez les modèles dès maintenant et ajoutez une référence plus tard/i)).toBeVisible();

  await page.getByRole('button', { name: /Analyser les résultats/ }).click();
  await expect(page.getByRole('heading', { name: 'Résultats de l’expérience multi-modèles' })).toBeInViewport();

  await page.getByRole('button', { name: /Préparer l’expérience/ }).click();
  await expect(page.getByRole('heading', { name: 'Préparer le barème' })).toBeInViewport();
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
      diagnosticStrategy: 'compare',
      diagnosticRuns: [
        { kind: 'vision', stage: 'reading', model: 'qwen3.5:4b', raw: '', elapsedMs: 4000, promptTokens: 1000, generatedTokens: 250, totalTokens: 1250, generationMs: 2000, loadMs: 300, promptEvaluationMs: 100, tokensPerSecond: 125 },
        { kind: 'model', stage: 'analysis', model: 'gemma3:4b', raw: '{"summary":"ok","criteria":[],"questionsForTeacher":[]}', elapsedMs: 8000, promptTokens: 3000, generatedTokens: 500, totalTokens: 3500, generationMs: 5000, loadMs: 500, promptEvaluationMs: 200, tokensPerSecond: 100 }
      ]
    }]));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Diagnostic IA' }).click();

  await expect(page.getByRole('heading', { name: 'Historique des essais' })).toBeVisible();
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
      diagnosticStrategy: 'compare',
    };
    localStorage.setItem('companion-correcteur:timing-history:v1', JSON.stringify([
      {
        ...base, id: 'compare-a', completedAt: '2026-10-29T12:00:00.000Z',
        visionModel: 'qwen3.5:4b', analysisModel: 'gemma3:4b', totalSeconds: 10, modelScore: 8,
        diagnosticRuns: [
          { kind: 'vision', stage: 'reading', model: 'qwen3.5:4b', raw: '', elapsedMs: 3000, promptTokens: 1000, generatedTokens: 100, totalTokens: 1100 },
          { kind: 'model', stage: 'analysis', model: 'gemma3:4b', raw: '', elapsedMs: 7000, promptTokens: 2000, generatedTokens: 400, totalTokens: 2400 },
        ],
      },
      {
        ...base, id: 'compare-b', completedAt: '2026-10-29T13:00:00.000Z',
        visionModel: 'phi-mini', analysisModel: 'qwen3.5:4b', totalSeconds: 18, modelScore: 6,
        diagnosticRuns: [
          { kind: 'vision', stage: 'reading', model: 'phi-mini', raw: '', elapsedMs: 6000, promptTokens: 1200, generatedTokens: 200, totalTokens: 1400 },
          { kind: 'model', stage: 'analysis', model: 'qwen3.5:4b', raw: '', elapsedMs: 12000, promptTokens: 3000, generatedTokens: 700, totalTokens: 3700 },
        ],
      },
    ]));
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Diagnostic IA' }).click();

  await expect(page.getByRole('heading', { name: 'Comparer deux essais' })).toBeVisible();
  await page.getByRole('checkbox', { name: /Sélectionner l’essai phi-mini/ }).check();
  await page.getByRole('checkbox', { name: /Sélectionner l’essai qwen3.5:4b \/ gemma3:4b/ }).check();

  await expect(page.getByRole('heading', { name: 'Comparaison de deux essais' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Temps total' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tokens d’entrée' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tokens générés' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Temps et tokens par modèle / étape' })).toBeVisible();
  await expect(page.getByText('Essai A')).toBeVisible();
  await expect(page.getByText('Essai B')).toBeVisible();
});
