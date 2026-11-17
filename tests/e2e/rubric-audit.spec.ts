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