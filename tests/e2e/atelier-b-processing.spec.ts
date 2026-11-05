import { expect, test } from '@playwright/test';

test('correction en cours : la copie reste grande et les cartes suivent le style B', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.addStyleTag({ content: '#root { display:none !important; }' });

  // Fixture purement fictive : aucun professeur, étudiant ou LLM réel n'est utilisé.
  await page.evaluate(() => {
    const image = `<svg xmlns="http://www.w3.org/2000/svg" width="750" height="980" viewBox="0 0 750 980">
      <rect width="750" height="980" fill="#fff"/>
      <text x="65" y="85" font-size="23" fill="#23435b" font-family="serif">Mitose : copie d'exemple</text>
      <path d="M65 102H680" stroke="#bccbd3"/>
      <text x="65" y="165" font-size="21" fill="#415b75" font-family="serif">Les phases de la mitose</text>
      <text x="65" y="214" font-size="15" fill="#415b75">Prophase : condensation des chromosomes</text>
      <text x="65" y="252" font-size="15" fill="#415b75">Métaphase : alignement au centre</text>
      <text x="65" y="290" font-size="15" fill="#415b75">Anaphase : séparation des chromatides</text>
      <text x="65" y="328" font-size="15" fill="#415b75">Télophase : deux noyaux se forment</text>
      <g stroke="#456c97" fill="none" stroke-width="3"><circle cx="180" cy="530" r="75"/><circle cx="375" cy="530" r="75"/><circle cx="570" cy="530" r="75"/>
      <path d="M145 490L210 555M210 490L145 555M345 485L405 575M405 485L345 575M540 500L590 565M590 500L540 565"/></g>
      <text x="65" y="775" font-size="17" fill="#415b75">Résumé : les cellules filles reçoivent les chromosomes.</text>
      <path d="M65 830H680M65 865H680M65 900H630" stroke="#e1e7eb"/>
    </svg>`;
    const imageSrc = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(image);
    const fixture = document.createElement('div');
    fixture.className = 'teacher-flow-shell atelier-processing-test-fixture';
    fixture.innerHTML = `
      <header class="topbar"><span class="brand-mark">CC</span><div><p class="eyebrow">ASSISTANT PÉDAGOGIQUE LOCAL</p><h1>Compagnon Correcteur de Devoirs</h1></div></header>
      <div class="teacher-content-column">
        <aside class="atelier-assignment-sidebar" aria-label="Navigation du devoir">
          <p class="atelier-sidebar-back">← Tous mes devoirs</p>
          <div class="atelier-sidebar-assignment"><strong>Partiel de biologie cellulaire</strong><small>Université · Licence 2 · 20 points</small></div>
          <div class="atelier-sidebar-section"><span class="eyebrow">MON DEVOIR</span><div class="atelier-sidebar-tabs"><button>Préparer le barème</button><button class="is-active">Suivre les copies</button></div></div>
        </aside>
        <section class="atelier-processing-workspace">
          <header class="atelier-processing-heading">
            <div><p class="eyebrow">COPIE EN COURS</p><h2>Correction en cours</h2><p class="atelier-processing-student">Copie 1 · biologie cellulaire</p></div>
            <p class="atelier-processing-current" role="status"><span class="atelier-processing-indicator"></span>Lecture de la copie</p>
          </header>
          <ol class="atelier-processing-phases" aria-label="Progression de la correction">
            <li class="is-complete"><span class="atelier-processing-phase-number">✓</span><span class="atelier-processing-phase-label">Préparation</span><small>Terminée</small></li>
            <li class="is-current" aria-current="step"><span class="atelier-processing-phase-number">2</span><span class="atelier-processing-phase-label">Lecture de la copie</span><small>1 / 2 pages lues</small></li>
            <li class="is-pending"><span class="atelier-processing-phase-number">3</span><span class="atelier-processing-phase-label">Correction des réponses</span><small>À venir</small></li>
          </ol>
          <div class="atelier-processing-columns">
            <section class="atelier-processing-source">
              <div class="atelier-processing-source-heading"><h3>Copie de l'étudiant</h3><span>2 pages</span></div>
              <div class="atelier-processing-pages">
                <figure class="atelier-processing-page"><div class="atelier-processing-page-stage"><img src="${imageSrc}" alt="Page 1 de la copie en cours de correction"/></div><figcaption><span>PAGE 1</span><span>copie-exemple.png</span></figcaption></figure>
              </div>
            </section>
            <section class="background-copy-activity">
              <header class="background-copy-activity-heading"><h4>Critères du barème</h4><strong class="background-copy-activity-counter">1 / 4</strong></header>
              <div class="background-copy-activity-track" role="progressbar" aria-label="Critères du barème traités" aria-valuemin="0" aria-valuemax="4" aria-valuenow="1"><span style="width:25%"></span></div>
              <ol class="background-copy-activity-criteria">
                <li class="is-complete"><span class="background-copy-activity-marker">✓</span><span class="background-copy-activity-title">Qualité du dessin</span><small>Analysé</small></li>
                <li class="is-active"><span class="background-copy-activity-marker">●</span><span class="background-copy-activity-title">Titre</span><small>En cours</small></li>
                <li class="is-pending"><span class="background-copy-activity-marker">·</span><span class="background-copy-activity-title">Légendes</span><small>À venir</small></li>
                <li class="is-pending"><span class="background-copy-activity-marker">·</span><span class="background-copy-activity-title">Compréhension</span><small>À venir</small></li>
              </ol>
            </section>
          </div>
        </section>
      </div>
    `;
    document.body.appendChild(fixture);
  });

  const surface = page.locator('.atelier-processing-test-fixture');
  const left = surface.locator('.atelier-processing-source');
  const right = surface.locator('.background-copy-activity');
  await expect(left).toBeVisible();
  await expect(right).toBeVisible();
  await expect(left).toHaveCSS('border-radius', '3px');
  await expect(right).toHaveCSS('border-radius', '3px');
  await expect(surface.locator('.background-copy-activity-criteria li').first()).toHaveCSS('border-radius', '0px');
  await expect(surface.locator('.atelier-processing-phases .is-current')).toHaveCSS('border-bottom-color', 'rgb(161, 77, 55)');
  const leftBox = await left.boundingBox();
  const rightBox = await right.boundingBox();
  const imageBox = await surface.locator('.atelier-processing-page img').boundingBox();
  expect(leftBox).not.toBeNull();
  expect(rightBox).not.toBeNull();
  expect(imageBox).not.toBeNull();
  expect(leftBox!.x + leftBox!.width).toBeLessThanOrEqual(rightBox!.x);
  expect(leftBox!.width / rightBox!.width).toBeGreaterThan(0.8);
  expect(leftBox!.width / rightBox!.width).toBeLessThan(1.3);
  expect(imageBox!.height).toBeGreaterThanOrEqual(450);
  await page.screenshot({ path: testInfo.outputPath('atelier-b-processing-desktop.png'), fullPage: true, animations: 'disabled' });

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileLeft = await left.boundingBox();
  const mobileRight = await right.boundingBox();
  expect(mobileLeft).not.toBeNull();
  expect(mobileRight).not.toBeNull();
  expect(mobileRight!.y).toBeGreaterThan(mobileLeft!.y);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath('atelier-b-processing-mobile.png'), fullPage: true, animations: 'disabled' });
});
