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
  await page.getByText('Oui, un titre commun', { exact: true }).click();
  await page.getByRole('button', { name: 'Enregistrer ma précision' }).click();
  await expect(page.getByText(/Décision enregistrée/)).toBeVisible();
  await page.getByRole('button', { name: /Appliquer 1 précision/ }).click();
  await expect.poll(async () => page.evaluate(() => {
    const profiles = JSON.parse(localStorage.getItem('companion-correcteur:assignments:v1') ?? '[]');
    return profiles.find((item: { id: string }) => item.id === 'assignment-default')?.rubric.criteria[0].description;
  })).toContain('Oui, un titre commun');
  await page.reload();
  await page.getByRole('button', { name: /Reprendre le devoir/ }).click();
  await page.getByRole('tab', { name: 'Barème' }).click();
  await expect(page.getByText(/Historique des clarifications/)).toBeVisible();
});