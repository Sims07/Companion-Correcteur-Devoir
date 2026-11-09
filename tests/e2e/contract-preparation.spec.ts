import { expect, test } from '@playwright/test';
import { openActiveAssignment } from './helpers/teacher-workspace';

test('prepare from exam without correction, review provenance and apply contracts without changing points', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/chat', async route => {
    calls++;
    const payload = route.request().postDataJSON();
    const prompt = payload.messages[0].content as string;
    const id = JSON.parse(prompt.match(/IDENTIFIANT EXACT : ("[^"\n]+")/)![1]);
    const empty = { value: '', source: 'missing', quote: '' };
    const proposal = { criterionId: id, scope: 'question', fields: { questionId: { value: '1', source: 'subject', quote: 'Question 1' }, instruction: { value: 'Expliquer le mécanisme.', source: 'subject', quote: 'Expliquer le mécanisme.' }, expectedRelation: { value: 'Relation proposée', source: 'suggestion', quote: '' }, acceptedAlternatives: empty, contradictions: empty }, warning: 'Aucun corrigé fourni.' };
    await route.fulfill({ json: { message: { content: JSON.stringify(proposal) }, done: true } });
  });
  await page.goto('/'); await openActiveAssignment(page);
  await page.getByRole('tab', { name: 'Barème' }).click();
  const points = await page.locator('.points-field input').evaluateAll(nodes => nodes.map(node => (node as HTMLInputElement).value));
  await page.getByText('Préparer les contrats depuis la feuille d’examen', { exact: true }).click();
  const panel = page.getByRole('region', { name: 'Préparation automatique des contrats' });
  await panel.locator('#contract-subject-file').setInputFiles({ name: 'examen.txt', mimeType: 'text/plain', buffer: Buffer.from('Question 1\nExpliquer le mécanisme.') });
  await expect(panel.getByText('Document lu. Son texte sera réutilisé pour préparer les contrats.')).toBeVisible();
  await panel.getByText('Utiliser un autre modèle pour cette préparation', { exact: true }).click();
  await panel.getByLabel('Modèle de préparation (génératif)').fill('local-generative');
  await panel.getByRole('button', { name: 'Préparer les contrats', exact: true }).click();
  const proposals = panel.getByRole('region', { name: 'Propositions de contrats' });
  await expect(proposals).toBeVisible();
  await proposals.getByText('Relire et ajuster la proposition', { exact: true }).first().click();
  await expect(proposals.getByText('Consigne — Extrait du sujet', { exact: true }).first()).toBeVisible();
  await expect(proposals.getByText('Équivalences acceptées — Non renseigné dans les documents', { exact: true }).first()).toBeVisible();
  await expect(proposals.getByText('Relation ou raisonnement attendu — Proposition à valider', { exact: true }).first()).toBeVisible();
  await proposals.getByRole('button', { name: /Appliquer les \d+ contrats sélectionnés/ }).click();
  await expect(panel.getByText('Contrats appliqués. Les critères, sous-critères et points ont été conservés.')).toBeVisible();
  expect(calls).toBeGreaterThan(0);
  expect(await page.locator('.points-field input').evaluateAll(nodes => nodes.map(node => (node as HTMLInputElement).value))).toEqual(points);
  const criterion = page.locator('.criterion-editor').first();
  if (!(await criterion.evaluate(el => el.hasAttribute('open')))) await criterion.locator('summary').click();
  await expect(criterion.getByLabel('Numéro de question')).toHaveValue('1');
  await expect(criterion.getByLabel('Formulations équivalentes acceptées')).toHaveValue('');
});
