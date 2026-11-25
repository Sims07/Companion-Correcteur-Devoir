import { useEffect, useState } from 'react';
import type { AnnotationGenerationState } from './useCopyAnnotationGeneration.ts';

const phases = {
  preparing: 'Préparation des pages…',
  waiting: 'Attente du modèle local…',
  receiving: 'Lecture de la réponse…',
  validating: 'Vérification des remarques et des emplacements…',
};

export function CopyAnnotationGenerationControls({ state, disabled, onGenerate, onStop, label = 'Générer les annotations' }: {
  state: AnnotationGenerationState;
  disabled: boolean;
  onGenerate: () => void;
  onStop: () => void;
  label?: string;
}) {
  const startedAt = state.status === 'running' ? state.startedAt : undefined;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (startedAt === undefined) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  return <div>
    <div className="copy-annotation-actions">
      <button type="button" className="primary-button" disabled={disabled || state.status === 'running'} onClick={onGenerate}>
        {state.status === 'error' ? 'Réessayer' : label}
      </button>
      {state.status === 'running' && <button type="button" className="secondary-button" onClick={onStop}>Arrêter</button>}
    </div>
    {state.status === 'running' && <p role="status">{phases[state.phase]} <span aria-hidden="true">{Math.max(0, Math.floor((now - state.startedAt) / 1000))} s</span></p>}
    {state.status === 'done' && <p role="status">{state.count ? `${state.count} suggestion(s) prête(s) à examiner.` : 'Aucune nouvelle suggestion.'}</p>}
    {state.status === 'cancelled' && <p role="status">Génération interrompue.</p>}
    {state.status === 'error' && <p role="alert">{state.message}</p>}
  </div>;
}
