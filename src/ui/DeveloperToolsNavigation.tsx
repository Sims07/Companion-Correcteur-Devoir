import { useEffect, useState } from 'react';
import { loadNetworkHistory, networkInspectorEvent } from '../adapters/network/networkInspector.ts';
import type { ObservabilityTrace } from '../domain/observability.ts';
import './developerTools.css';

export type DeveloperTool = 'observability' | 'debug' | 'diagnostic';

type Props = {
  activeTool: DeveloperTool;
  traces: ObservabilityTrace[];
  onNavigate: (tool: DeveloperTool) => void;
};

const tools: { id: DeveloperTool; title: string; description: string }[] = [
  { id: 'observability', title: 'Observabilité', description: 'Exécutions, erreurs et prompts' },
  { id: 'debug', title: 'Inspecteur réseau', description: 'Appels HTTP et réponses' },
  { id: 'diagnostic', title: 'Évaluation des modèles', description: 'Essais et comparaisons' },
];

export function DeveloperToolsNavigation({ activeTool, traces, onNavigate }: Props) {
  const [networkErrors, setNetworkErrors] = useState(() => loadNetworkHistory().filter((record) => record.state === 'error').length);

  useEffect(() => {
    const refresh = () => setNetworkErrors(loadNetworkHistory().filter((record) => record.state === 'error').length);
    window.addEventListener(networkInspectorEvent, refresh);
    refresh();
    return () => window.removeEventListener(networkInspectorEvent, refresh);
  }, []);

  const failedTraces = traces.filter((trace) => trace.outcome === 'error').length;

  return <section className="developer-tools" aria-label="Outils IA">
    <div className="developer-tools-heading">
      <div>
        <p className="eyebrow">DIAGNOSTIC & EXPÉRIMENTATION</p>
        <h2>Outils IA</h2>
        <p>Pour comprendre un incident de correction ou comparer des modèles. Ces outils techniques ne sont pas nécessaires au professeur au quotidien.</p>
      </div>
      <div className="developer-tools-signals" aria-label="État des diagnostics locaux">
        <span>{failedTraces} exécution(s) en échec</span>
        <span>{networkErrors} requête(s) en erreur</span>
      </div>
    </div>
    <nav className="developer-tools-nav" aria-label="Navigation des outils IA">
      {tools.map((tool) => <button key={tool.id} type="button"
        className={activeTool === tool.id ? 'developer-tools-link is-active' : 'developer-tools-link'}
        aria-current={activeTool === tool.id ? 'page' : undefined}
        onClick={() => onNavigate(tool.id)}>
        <strong>{tool.title}</strong>
        <small>{tool.description}</small>
      </button>)}
    </nav>
  </section>;
}
