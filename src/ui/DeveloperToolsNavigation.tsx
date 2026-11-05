import { useEffect, useState } from 'react';
import { loadNetworkHistory, networkInspectorEvent } from '../adapters/network/networkInspector.ts';
import type { ObservabilityTrace } from '../domain/observability.ts';
import { buildSupportDiagnosticReport } from '../domain/supportDiagnosticReport.ts';
import { Button } from './design-system/components/Button.tsx';
import './developerTools.css';

export type DeveloperTool = 'observability' | 'debug' | 'diagnostic';

type Props = {
  activeTool: DeveloperTool;
  traces: ObservabilityTrace[];
  onNavigate: (tool: DeveloperTool) => void;
};

const tools: { id: DeveloperTool; title: string; description: string; index: string }[] = [
  { id: 'observability', title: 'Observabilité', description: 'Suivre les corrections et les erreurs', index: '01' },
  { id: 'debug', title: 'Inspecteur réseau', description: 'Comprendre les échanges avec les modèles', index: '02' },
  { id: 'diagnostic', title: 'Évaluation des modèles', description: 'Tester et comparer des configurations', index: '03' },
];

export function DeveloperToolsNavigation({ activeTool, traces, onNavigate }: Props) {
  const [networkErrors, setNetworkErrors] = useState(() => loadNetworkHistory().filter((record) => record.state === 'error').length);
  const [copyStatus, setCopyStatus] = useState('');

  useEffect(() => {
    const refresh = () => setNetworkErrors(loadNetworkHistory().filter((record) => record.state === 'error').length);
    window.addEventListener(networkInspectorEvent, refresh);
    refresh();
    return () => window.removeEventListener(networkInspectorEvent, refresh);
  }, []);

  const failedTraces = traces.filter((trace) => trace.outcome === 'error').length;

  async function copyDiagnostic() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard-unavailable');
      const report = buildSupportDiagnosticReport({ traces, requests: loadNetworkHistory(), generatedAt: new Date().toISOString() });
      await navigator.clipboard.writeText(report);
      setCopyStatus('Diagnostic technique copié. Vérifiez son contenu avant de le partager.');
    } catch {
      setCopyStatus('Copie impossible : vérifiez l’autorisation du presse-papiers dans votre navigateur.');
    }
  }

  return <section className="developer-tools" aria-label="Outils IA">
    <div className="developer-tools-heading">
      <div className="developer-tools-intro">
        <p className="eyebrow">ESPACE TECHNIQUE · ATELIER PÉDAGOGIQUE</p>
        <h2>Outils IA</h2>
        <p>Comprendre les corrections, examiner les échanges ou comparer les modèles. Ces outils restent séparés du parcours du professeur.</p>
      </div>
      <div className="developer-tools-signals" aria-label="État des diagnostics locaux">
        <div className="developer-tools-signal">
          <strong>{failedTraces}</strong>
          <span>exécution(s) en échec</span>
        </div>
        <div className="developer-tools-signal">
          <strong>{networkErrors}</strong>
          <span>requête(s) en erreur</span>
        </div>
      </div>
    </div>
    <nav className="developer-tools-nav" aria-label="Navigation des outils IA">
      {tools.map((tool) => <button key={tool.id} type="button"
        className={activeTool === tool.id ? 'developer-tools-link is-active' : 'developer-tools-link'}
        aria-current={activeTool === tool.id ? 'page' : undefined}
        onClick={() => onNavigate(tool.id)}>
        <span className="developer-tools-link-index" aria-hidden="true">{tool.index}</span>
        <span className="developer-tools-link-copy"><strong>{tool.title}</strong><small>{tool.description}</small></span>
      </button>)}
    </nav>
    <details className="developer-tools-support">
      <summary>Aide au diagnostic et partage avec le support</summary>
      <div className="developer-tools-support-content">
        <p>Copiez un résumé technique si une correction pose problème. Il contient uniquement les dates, modèles, durées et codes HTTP — jamais les copies, barèmes, prompts, réponses ni adresses des serveurs.</p>
        <Button variant="secondary" onClick={() => { void copyDiagnostic(); }}>Copier un diagnostic technique</Button>
        {copyStatus && <p className="developer-tools-copy-status" role="status">{copyStatus}</p>}
      </div>
    </details>
  </section>;
}
