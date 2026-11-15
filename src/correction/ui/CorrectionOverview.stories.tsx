import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import type { BackgroundJobSummary } from '../domain/backgroundCorrection.ts';
import type { CopyOverviewFilter } from '../domain/copyOverview.ts';
import { CorrectionOverview } from './CorrectionOverview.tsx';

const createdAt = '2026-11-05T10:00:00.000Z';
const base: BackgroundJobSummary = {
  id: 'copie-01', assignmentId: 'mitose', label: 'Copie 01 · Mitose',
  status: 'pending', phase: 'preparation', studentIdentity: null,
  progress: { completedPages: 0, totalPages: 2, completedCriteria: 0, totalCriteria: 4 },
  score: null, maximumPoints: 20, pageCount: 2,
  createdAt, updatedAt: createdAt, error: null,
};

/** Real CorrectionOverview with fictional jobs: no student content or AI connection. */
const pending: BackgroundJobSummary = { ...base };
const running: BackgroundJobSummary = {
  ...base, id: 'copie-02', label: 'Copie 02 · Mitose',
  status: 'processing', phase: 'grading',
  progress: { ...base.progress, completedPages: 2, completedCriteria: 2 },
};
const ready: BackgroundJobSummary = {
  ...base, id: 'copie-03', label: 'Copie 03 · Mitose',
  status: 'ready', phase: 'complete', score: 15,
  progress: { ...base.progress, completedPages: 2, completedCriteria: 4 },
};
const failed: BackgroundJobSummary = {
  ...base, id: 'copie-04', label: 'Copie 04 · Mitose',
  status: 'failed', phase: 'reading',
  progress: { ...base.progress, completedPages: 1 },
  error: 'Le modèle local n’a pas répondu',
};

type Mode = 'ensemble' | 'en-cours' | 'a-verifier';
const mockSets: Record<Mode, BackgroundJobSummary[]> = {
  ensemble: [pending, running, ready, failed],
  'en-cours': [pending, running],
  'a-verifier': [ready, failed],
};

function SuiviFictif({ mode }: { mode: Mode }) {
  const [filter, setFilter] = useState<CopyOverviewFilter>('all');
  const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState(false);
  const jobs = mockSets[mode];
  const signal = (action: string) => setMessage('Action de démonstration : ' + action);
  return <main className="teacher-flow-shell" style={{ maxWidth: 1160, padding: 24, margin: '0 auto' }}>
    <CorrectionOverview
      jobs={jobs}
      corrections={[]}
      currentCopy={mode === 'ensemble' ? {
        label: 'Copie 05 · corrigée', status: 'completed', pageCount: 2,
        score: 17, maximumPoints: 20, updatedAt: createdAt,
      } : null}
      filter={filter} onFilterChange={setFilter}
      onAddCopy={() => setExpanded((value) => !value)}
      addCopyExpanded={expanded}
      pendingCount={jobs.filter((job) => job.status === 'pending').length}
      isStartingCorrections={false} isStoppingCorrections={false}
      onStopCorrections={() => signal('arrêt de la correction')}
      onStartCorrections={() => signal('démarrage de la correction')}
      onOpenJob={(id) => signal('ouverture de ' + id)}
      onRetryJob={(id) => signal('relance de ' + id)}
      onRemoveJob={(id) => signal('retrait de ' + id)}
      notice={message}
      onOpenCorrection={() => signal('ouverture de l’archive')}
      onOpenCurrentCopy={() => signal('ouverture de la copie courante')}
      onReviewNextCopy={() => signal('vérification de la prochaine copie')}
    >
      {expanded && <section id="teacher-copy-intake" className="panel" aria-label="Ajout de copies fictives">
        Le formulaire réel d’ajout est présenté dans « Parcours enseignant/Ajouter des copies ».
      </section>}
    </CorrectionOverview>
  </main>;
}

const meta = {
  title: 'Parcours enseignant/Suivi des copies',
  component: SuiviFictif,
  args: { mode: 'ensemble' },
  parameters: {
    docs: { description: { component: 'Suivi réel avec données fictives. Les filtres et boutons réagissent localement, sans lancer de correction ni envoyer de copie.' } },
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SuiviFictif>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EnsembleDesEtats: Story = {};
export const CorrectionEnCours: Story = { args: { mode: 'en-cours' } };
export const VerificationEtRelance: Story = { args: { mode: 'a-verifier' } };
