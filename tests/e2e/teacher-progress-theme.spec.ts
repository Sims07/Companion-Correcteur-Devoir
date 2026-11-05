import { expect, test } from '@playwright/test';

test('la progression de correction utilise les surfaces Atelier plutôt que le dégradé vert historique', async ({ page }) => {
  await page.goto('/');

  // Le style doit rester cohérent en préparation, lecture et correction,
  // sans lancer une inférence de modèle local dans le test visuel.
  await page.evaluate(() => {
    const shell = document.createElement('div');
    shell.className = 'teacher-flow-shell teacher-progress-theme-fixture';
    shell.innerHTML = `
      <section class="analysis-progress teacher-progress-card">
        <div class="analysis-spinner"></div>
        <div class="analysis-progress-copy">
          <p class="eyebrow">Correction en cours</p>
          <h3>Lecture de la copie</h3>
          <p>La copie est en cours de lecture.</p>
          <div class="teacher-progress-phases">
            <div class="teacher-progress-phase complete"><span>✓</span></div>
            <div class="teacher-progress-phase current"><span>2</span></div>
            <div class="teacher-progress-phase"><span>3</span></div>
          </div>
          <div class="analysis-steps">
            <div class="analysis-step current"><span class="analysis-step-number">1</span></div>
          </div>
        </div>
      </section>
    `;
    document.body.appendChild(shell);
  });

  const shell = page.locator('.teacher-progress-theme-fixture');
  await expect(shell.locator('.analysis-progress')).toHaveCSS('background-color', 'rgb(255, 253, 249)');
  await expect(shell.locator('.analysis-progress')).toHaveCSS('background-image', 'none');
  await expect(shell.locator('.analysis-progress')).toHaveCSS('border-top-color', 'rgb(233, 225, 213)');
  await expect(shell.locator('.analysis-spinner')).toHaveCSS('border-top-color', 'rgb(161, 77, 55)');
  await expect(shell.locator('.teacher-progress-phase.current')).toHaveCSS('background-color', 'rgb(247, 232, 220)');
  await expect(shell.locator('.analysis-step.current')).toHaveCSS('background-color', 'rgb(247, 232, 220)');
  await expect(shell.locator('.teacher-progress-phase.complete > span')).toHaveCSS('color', 'rgb(39, 98, 58)');
  await expect(shell.locator('.teacher-progress-phase.complete')).toHaveCSS('background-color', 'rgb(251, 248, 242)');
});
