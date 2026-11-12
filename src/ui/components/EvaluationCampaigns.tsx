import { useMemo, useState } from 'react';
import type { BiologyRadarObservation } from '../../domain/biologyTeacherRadar.ts';
import type { DiagramLabArchiveEntry } from '../../domain/diagramLabHistory.ts';
import { buildDiagramLabRadar } from '../../domain/diagramLabRadar.ts';
import type { ModelEvaluationRecord } from '../../domain/modelEvaluation.ts';
import { domainLabels } from './EvaluationRadarHome.tsx';

type Domain = keyof typeof domainLabels;
export interface CampaignFilter { domain?: Domain; model?: string; ids?: string[] }
export function EvaluationCampaigns({ diagrams, biology, records, filter, onDiagram, onCustom }: {
  diagrams: DiagramLabArchiveEntry[]; biology: BiologyRadarObservation[]; records: ModelEvaluationRecord[];
  filter: CampaignFilter; onDiagram: (id?: string) => void; onCustom: (id?: string) => void;
}) {
  const [domain, setDomain] = useState(filter.domain ?? '');
  const [model, setModel] = useState(filter.model ?? '');
  const [ids, setIds] = useState(filter.ids);
  const rows = useMemo(() => {
    const science = diagrams.map(entry => ({
      id: entry.id, domain: 'diagrams' as const, date: entry.createdAt, models: buildDiagramLabRadar([entry], 'model').map(c => c.id),
      title: entry.title, status: entry.state === 'running' ? 'En cours' : entry.experimentCount === entry.successfulCount ? 'Terminée' : 'Incomplète',
      detail: entry.successfulCount + '/' + entry.experimentCount + ' passages réussis', observations: [] as BiologyRadarObservation[],
    }));
    const groups = new Map<string, BiologyRadarObservation[]>();
    for (const o of biology) {
      const key = o.campaignId ?? o.id;
      const group = groups.get(key) ?? [];
      group.push(o); groups.set(key, group);
    }
    const bio = [...groups].map(([id, observations]) => ({
      id, domain: 'biology' as const, date: observations.map(o => o.recordedAt).sort().at(-1)!,
      models: [...new Set(observations.map(o => o.model))], title: 'Correction biologique',
      status: observations.every(o => o.status === 'success') ? 'Terminée' : 'Incomplète', detail: '', observations,
    }));
    const custom = records.map(r => ({
      id: r.id, domain: 'custom' as const, date: r.completedAt, models: [...new Set(r.configurations.flatMap(c =>
        r.stage === 'vision' ? [c.visionModel] : r.stage === 'analysis' ? [c.analysisModel] : [c.visionModel, c.analysisModel]))],
      title: r.assignmentTitle, status: r.results.every(v => v.status === 'success') ? 'Terminée' : 'Incomplète',
      detail: r.results.length + ' résultat(s)', observations: [] as BiologyRadarObservation[],
    }));
    return [...science, ...bio, ...custom].sort((a,b) => b.date.localeCompare(a.date));
  }, [diagrams, biology, records]);
  const visible = rows.filter(r => (!domain || domain === r.domain) && (!model || r.models.includes(model)) &&
    (!ids || ids.includes(r.id) || r.observations.some(o => ids.includes(o.id))));
  return <section className="campaign-index" aria-label="Campagnes d’évaluation"><h2>Campagnes</h2><header>
    <label>Domaine<select value={domain} onChange={e => { setDomain(e.target.value); setIds(undefined); }}>
      <option value="">Tous les domaines</option>{Object.entries(domainLabels).map(([id,name]) => <option value={id} key={id}>{name}</option>)}</select></label>
    <label>Modèle<select value={model} onChange={e => { setModel(e.target.value); setIds(undefined); }}><option value="">Tous les modèles</option>
      {[...new Set([...rows.flatMap(r => r.models), model].filter(Boolean))].sort().map(name => <option key={name}>{name}</option>)}</select></label>
    {ids && <button onClick={() => { setIds(undefined); setDomain(''); setModel(''); }}>Toutes les campagnes</button>}
    <button onClick={() => onDiagram()}>Archives scientifiques</button><button onClick={() => onCustom()}>Comparer les essais sur copie</button>
    </header>{!visible.length && <p>Aucune campagne pour cette sélection.</p>}
    {visible.map(row => <details key={row.domain + row.id} open={ids?.length === 1 || undefined}><summary>
      {new Date(row.date).toLocaleString('fr-FR')} · {domainLabels[row.domain]} · <b>{row.models.join(', ')}</b> · {row.title} · {row.status}
    </summary>{row.detail && <p>{row.detail}</p>}{row.domain === 'biology' ? <ul>{row.observations.map(o => <li key={o.id}>
      {o.model} · {o.profile} · {o.method} · {o.protocol} · copie {o.caseId} · professeur {o.referenceScore}/10 · modèle {o.score ?? '—'}/10
    </li>)}</ul> : <button onClick={() => row.domain === 'diagrams' ? onDiagram(row.id) : onCustom(row.id)}>Ouvrir le résultat</button>}</details>)}
  </section>;
}
