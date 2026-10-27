import { useState } from 'react';
import { validateRubric, type Rubric } from '../domain/rubric.ts';

const initialRubric: Rubric = {
  title: 'Barème de biologie — exemple',
  criteria: [
    { id: 'knowledge', title: 'Connaissances scientifiques', description: 'Exactitude des notions et du vocabulaire.', maxPoints: 8 },
    { id: 'reasoning', title: 'Raisonnement', description: 'Qualité de l’argumentation et des liens logiques.', maxPoints: 7 },
    { id: 'clarity', title: 'Clarté de la réponse', description: 'Structure et lisibilité de la réponse.', maxPoints: 5 },
  ],
};

export function App() {
  const [rubric] = useState(initialRubric);
  const validation = validateRubric(rubric);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true">CC</div>
        <div>
          <p className="eyebrow">ASSISTANT PÉDAGOGIQUE LOCAL</p>
          <h1>Companion Correcteur Devoir</h1>
        </div>
        <span className="local-badge"><span /> Mode local prioritaire</span>
      </header>

      <section className="welcome">
        <div className="welcome-copy">
          <p className="eyebrow">ESPACE ENSEIGNANT · BIOLOGIE</p>
          <h2>Une correction plus claire.<br /><em>Vous gardez la décision.</em></h2>
          <p className="intro">Préparez un barème, analysez les réponses et révisez les propositions de l’assistant. Les notes ne sont jamais validées automatiquement.</p>
        </div>
        <div className="illustration" aria-hidden="true">
          <div className="paper"><span /><span /><span /><b>✓</b></div>
          <div className="leaf leaf-one" /><div className="leaf leaf-two" />
        </div>
      </section>

      <section className="privacy-strip">
        <span className="privacy-icon">⌂</span>
        <div><strong>Vos copies restent privées</strong><p>Aucun envoi réseau n’est effectué par cette fondation. Ollama, l’OCR et l’import des copies seront raccordés dans les prochaines étapes.</p></div>
        <span className="privacy-status">LOCAL D’ABORD</span>
      </section>

      <div className="workspace-heading">
        <div><p className="eyebrow">VOTRE ESPACE DE TRAVAIL</p><h2>Préparer une correction</h2></div>
        <span className="step-count">ÉTAPE 1 SUR 3</span>
      </div>

      <section className="setup-grid">
        <article className="panel rubric-panel">
          <div className="panel-heading"><span className="number">01</span><div><h3>Barème de notation</h3><p>Point de départ pour la correction.</p></div><span className="status-pill">Exemple</span></div>
          <div className="rubric-title">{rubric.title}</div>
          <div className="criteria-list">
            {rubric.criteria.map((criterion) => <div className="criterion" key={criterion.id}><div><strong>{criterion.title}</strong><p>{criterion.description}</p></div><span>{criterion.maxPoints} pts</span></div>)}
          </div>
          <div className="rubric-total"><span>Total du barème</span><strong>{validation.maximumPoints} points</strong></div>
          <p className={validation.valid ? 'validation valid' : 'validation invalid'}>{validation.valid ? '✓ Barème cohérent' : validation.errors.join(' ')}</p>
          <button className="secondary-button" disabled>Configurer mon barème · prochaine étape</button>
        </article>

        <article className="panel copy-panel">
          <div className="panel-heading"><span className="number">02</span><div><h3>Copies à corriger</h3><p>Photographies ou scans des réponses.</p></div></div>
          <div className="upload-placeholder"><div className="upload-icon">↑</div><strong>Import des copies</strong><p>JPG, PNG ou PDF · traitement local prévu</p><button disabled className="primary-button">Importer des copies</button><span className="coming-soon">Disponible dans une prochaine PR</span></div>
          <div className="panel-footnote">Les images ne seront pas envoyées à un service cloud par défaut.</div>
        </article>
      </section>

      <footer><span>Companion Correcteur Devoir</span><span>Une suggestion d’IA reste une suggestion. <strong>La décision est humaine.</strong></span></footer>
    </main>
  );
}
