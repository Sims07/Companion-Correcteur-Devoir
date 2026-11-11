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
  const evaluating = activeTool === 'diagnostic';

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

  // Primary navigation now lives in the application header, for all three destinations.
  if (evaluating) return null;

  return <section className="developer-tools" aria-label="Suivi et diagnostic">
    <div className="developer-tools-diagnostics">
      <nav className="developer-tools-subnav" aria-label="Détails du suivi">
        <button type="button" aria-pressed={activeTool === 'observability'} className={activeTool === 'observability' ? 'is-active' : ''} onClick={() => onNavigate('observability')}>Suivi des corrections</button>
        <button type="button" aria-pressed={activeTool === 'debug'} className={activeTool === 'debug' ? 'is-active' : ''} onClick={() => onNavigate('debug')}>Inspecteur réseau</button>
      </nav>
      {(failedTraces > 0 || networkErrors > 0) && <div className="developer-tools-signals" aria-label="Erreurs enregistrées">
        {failedTraces > 0 && <span className="developer-tools-signal"><strong>{failedTraces}</strong> exécution(s) en échec</span>}
        {networkErrors > 0 && <span className="developer-tools-signal"><strong>{networkErrors}</strong> requête(s) en erreur</span>}
      </div>}
      <details className="developer-tools-support">
        <summary>Aide au diagnostic et partage avec le support</summary>
        <div className="developer-tools-support-content">
          <p>Copiez un résumé technique si une correction pose problème. Il contient uniquement les dates, modèles, durées et codes HTTP — jamais les copies, barèmes, prompts, réponses ni adresses des serveurs.</p>
          <Button variant="secondary" onClick={() => { void copyDiagnostic(); }}>Copier un diagnostic technique</Button>
          {copyStatus && <p className="developer-tools-copy-status" role="status">{copyStatus}</p>}
        </div>
      </details>
    </div>
  </section>;
}
