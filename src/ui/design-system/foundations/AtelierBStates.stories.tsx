import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { StatusNotice } from '../components/StatusNotice.tsx';
import { TeacherReviewAlert } from '../../components/TeacherReviewAlert.tsx';

const blocks = [
  { name: 'Action / sélection', token: '--ds-color-brand-700', note: 'Bouton, onglet, profil choisi' },
  { name: 'En cours', token: '--ds-color-progress', note: 'Lecture, correction ou sauvegarde active' },
  { name: 'En attente', token: '--ds-color-text-muted', note: 'Aucune action requise' },
  { name: 'À examiner', token: '--ds-color-warning', note: 'Une intervention du professeur est utile' },
  { name: 'Terminé', token: '--ds-color-success', note: 'Action réussie' },
  { name: 'Échec', token: '--ds-color-danger', note: 'Erreur réellement constatée' },
] as const;

function Entete() {
  return <>
    <p className="eyebrow">CONTRAT VISUEL · ATELIER B</p>
    <h2 style={{ font: '700 28px var(--ds-font-editorial)', margin: '0 0 8px' }}>Une couleur, une intention</h2>
    <p style={{ color: 'var(--ds-color-text-muted)', maxWidth: 760, lineHeight: 1.5 }}>
      La terre cuite est réservée aux actions et sélections. Une opération en cours ne signifie ni erreur ni avertissement.
    </p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(175px,1fr))', gap: 12, margin: '20px 0' }}>
      {blocks.map((item) => <div key={item.name} className="panel" style={{ padding: 14 }}>
        <div aria-hidden="true" style={{ height: 8, borderRadius: 'var(--ds-radius-sm)', background: 'var(' + item.token + ')' }} />
        <strong style={{ display: 'block', marginTop: 10 }}>{item.name}</strong>
        <small style={{ color: 'var(--ds-color-text-muted)' }}>{item.note}</small>
      </div>)}
    </div>
  </>;
}

function Professeur() {
  return <div className="teacher-flow-shell">
    <Entete />
    <section className="review-main-column" style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))' }}>
      <article className="panel review-card" style={{ margin: 0 }}>
        <strong>Critère sans alerte</strong><p>Aucune couleur d’urgence ou de succès.</p>
      </article>
      <article className="panel review-card is-flagged" style={{ margin: 0 }}>
        <strong>Critère à vérifier</strong>
        <TeacherReviewAlert reasons={['Confiance à vérifier']} rationale="La légende du schéma est ambiguë." questionForTeacher="La légende est-elle correcte ?" />
      </article>
      <article className="panel review-card-pending is-active" style={{ margin: 0 }}>
        <strong>Critère en cours d’analyse</strong>
        <p className="review-pending-status">En cours</p>
      </article>
    </section>
    <section style={{ marginTop: 20 }}>
      <h3>Étapes d’import de barème</h3>
      <ol className="rubric-import-steps">
        <li className="rubric-import-step is-complete"><span className="rubric-import-step-number">✓</span><div className="rubric-import-step-content"><strong>Lecture terminée</strong><p>Étape réussie</p></div></li>
        <li className="rubric-import-step is-active"><span className="rubric-import-step-number">2</span><div className="rubric-import-step-content"><strong>Extraction en cours</strong><p>Traitement actif, sans erreur</p></div></li>
        <li className="rubric-import-step"><span className="rubric-import-step-number">3</span><div className="rubric-import-step-content"><strong>Vérification à venir</strong><p>Étape neutre</p></div></li>
      </ol>
    </section>
    <section style={{ marginTop: 20 }}>
      <h3>Messages communs</h3>
      <StatusNotice tone="info">La copie est en cours de lecture.</StatusNotice>
      <StatusNotice tone="warning">Un critère nécessite une vérification.</StatusNotice>
      <StatusNotice tone="success">La correction a été enregistrée.</StatusNotice>
      <StatusNotice tone="error">Le service IA n’a pas répondu.</StatusNotice>
    </section>
  </div>;
}

function Technique() {
  const [active, setActive] = useState(1);
  const titles = ['Configuration', 'Exécution', 'Résultats', 'Analyse & historique'];
  return <div className="ai-tools-view evaluation-workspace-shell">
    <Entete />
    <nav className="evaluation-step-nav" aria-label="Étapes fictives de l’évaluation">
      {titles.map((label, index) => <button type="button" key={label}
        className={active === index ? 'is-active' : ''} aria-current={active === index ? 'step' : undefined}
        onClick={() => setActive(index)}>
        <span>{index + 1}</span><strong>{label}</strong><small>{active === index ? 'En cours' : 'À venir'}</small>
      </button>)}
    </nav>
    <section style={{ marginTop: 24 }}>
      <h3>Exécution des modèles</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        {[
          ['is-active', 'En cours', 'Recherche des critères'],
          ['is-complete', 'Terminée', 'Lecture effectuée'],
          ['has-failed', 'Échec', 'Service non disponible'],
        ].map(([state, name, detail], index) => <article key={state} className={'evaluation-configuration-step ' + state} style={{ padding: 16 }}>
          <span className="evaluation-configuration-step-index">{index + 1}</span>
          <div><strong>{name}</strong><small>{detail}</small></div>
        </article>)}
      </div>
    </section>
    <section style={{ marginTop: 24 }}>
      <h3>Requêtes réseau et historique</h3>
      <div className="network-inspector-summary" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <span>Attente HTTP : <strong className="network-state pending">en cours</strong></span>
        <span>Réponse : <strong className="network-state success">200 OK</strong></span>
        <span>Erreur : <strong className="network-state error">500</strong></span>
      </div>
      <div className="evaluation-archive-feedback is-saving"><div><strong>Enregistrement en cours</strong><p>Pas d’alerte tant que le stockage travaille.</p></div></div>
      <div className="evaluation-archive-feedback is-saved"><div><strong>Résultats enregistrés</strong><p>Sauvegarde confirmée.</p></div></div>
      <div className="evaluation-archive-feedback is-without-images"><div><strong>Attention</strong><p>Espace de stockage à surveiller.</p></div></div>
      <div className="evaluation-archive-feedback is-failed"><div><strong>Échec de sauvegarde</strong><p>L’enregistrement doit être relancé.</p></div></div>
    </section>
  </div>;
}

function EtatsB({ contexte }: { contexte: 'professeur' | 'technique' }) {
  return <main style={{ maxWidth: 1120, margin: '0 auto', padding: 20 }}>
    {contexte === 'professeur' ? <Professeur /> : <Technique />}
  </main>;
}

const meta = {
  title: 'Fondations/Contrat des états B',
  component: EtatsB,
  tags: ['autodocs'],
  args: { contexte: 'professeur' },
  parameters: {
    docs: { description: { component: 'Référence des états sémantiques de la maquette B. Tous les exemples sont fictifs, sans copie réelle ni requête IA.' } },
  },
} satisfies Meta<typeof EtatsB>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ParcoursProfesseur: Story = {};
export const OutilsTechniques: Story = { args: { contexte: 'technique' } };
