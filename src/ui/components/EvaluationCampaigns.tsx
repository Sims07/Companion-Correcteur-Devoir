import { Button } from '../design-system/index.ts';
import { countedUsableBiologyGrades, buildEvaluationIssueReport } from '../../domain/evaluationIssueReport.ts';
import { biologyCampaignIssues, customCampaignIssues, diagramCampaignIssues } from '../../domain/evaluationCampaignIssues.ts';
import { EvaluationIssueButton } from './EvaluationIssueButton.tsx';
import { useMemo, useState } from 'react';
import './EvaluationCampaigns.css';
import type { BiologyRadarObservation } from '../../domain/biologyTeacherRadar.ts';
import type { DiagramLabArchiveEntry } from '../../domain/diagramLabHistory.ts';
import { diagramCampaignModels } from '../../domain/diagramLabRadar.ts';
import type { ModelEvaluationRecord } from '../../domain/modelEvaluation.ts';
import { PILOT_PROTOCOL_ID } from '../../domain/pilotEvaluationProtocol.ts';
import { QUESTION_CONTRACT_PROTOCOL_ID } from '../../domain/questionContractPilot.ts';
import { domainLabels } from './EvaluationRadarHome.tsx';

type Domain = keyof typeof domainLabels;
export interface CampaignFilter {
  domain?: Domain;
  model?: string;
  ids?: string[];
}
export function EvaluationCampaigns({
  diagrams,
  biology,
  records,
  filter,
  onDiagram,
  onCustom,
}: {
  diagrams: DiagramLabArchiveEntry[];
  biology: BiologyRadarObservation[];
  records: ModelEvaluationRecord[];
  filter: CampaignFilter;
  onDiagram: (id?: string) => void;
  onCustom: (id?: string) => void;
}) {
  const [domain, setDomain] = useState(filter.domain ?? '');
  const [model, setModel] = useState(filter.model ?? '');
  const [ids, setIds] = useState(filter.ids);
  const [selectedCampaign, setSelectedCampaign] = useState<string | null>(null);
  const rows = useMemo(() => {
    const science = diagrams.map((entry) => {
      const issues = diagramCampaignIssues(entry);
      return {
      id: entry.id,
      domain: 'diagrams' as const,
      date: entry.createdAt,
      models: diagramCampaignModels(entry),
      title: entry.title,
      status:
        entry.state === 'running'
          ? 'En cours'
          : issues.length === 0 && entry.experimentCount > 0 && entry.experimentCount === entry.successfulCount
            ? 'Terminée'
            : 'Incomplète',
      detail: entry.successfulCount + '/' + entry.experimentCount + ' passages réussis',
      observations: [] as BiologyRadarObservation[],
      issues,
      stats: { successful: entry.successfulCount, total: entry.experimentCount },
    };
    });
    const groups = new Map<string, BiologyRadarObservation[]>();
    for (const o of biology) {
      const key = o.campaignId ?? o.id;
      const group = groups.get(key) ?? [];
      group.push(o);
      groups.set(key, group);
    }
    const bio = [...groups].map(([id, observations]) => ({
      id,
      domain: 'biology' as const,
      date: observations
        .map((o) => o.recordedAt)
        .sort()
        .at(-1)!,
      models: [...new Set(observations.map((o) => o.model))],
      title: 'Correction biologique',
      status: countedUsableBiologyGrades(observations) === observations.length ? 'Terminée' : 'Résultats partiels',
      detail: countedUsableBiologyGrades(observations) + '/' + observations.length + ' notes exploitables',
      observations,
      issues: biologyCampaignIssues(observations),
      stats: { successful: countedUsableBiologyGrades(observations), total: observations.length },
    }));
    const coveredDates = new Set(biology.map((o) => o.recordedAt));
    const isPilot = (record: ModelEvaluationRecord) =>
      ['pilot-' + PILOT_PROTOCOL_ID, 'pilot-' + QUESTION_CONTRACT_PROTOCOL_ID].includes(record.assignmentId);
    const custom = records
      .filter((r) => !isPilot(r) || !coveredDates.has(r.completedAt))
      .map((r) => {
        const issues = customCampaignIssues(r);
        return {
        id: r.id,
        campaign: r.campaignId,
        domain: isPilot(r) ? ('biology' as const) : ('custom' as const),
        date: r.completedAt,
        models: [
          ...new Set(
            r.configurations.flatMap((c) =>
              r.stage === 'vision'
                ? [c.visionModel]
                : r.stage === 'analysis'
                  ? [c.analysisModel]
                  : [c.visionModel, c.analysisModel],
            ),
          ),
        ],
        title: r.assignmentTitle,
        status: r.results.length > 0 && issues.length === 0 ? 'Terminée' : 'Incomplète',
        detail: r.results.length + ' résultat(s)',
        observations: [] as BiologyRadarObservation[],
        issues,
        stats: { successful: r.results.filter((v) => v.status === 'success').length, total: r.results.length },
      };
      });
    return [...science, ...bio, ...custom].sort((a, b) => b.date.localeCompare(a.date));
  }, [diagrams, biology, records]);
  const visible = rows.filter(
    (r) =>
      (!domain || domain === r.domain) &&
      (!model || r.models.includes(model)) &&
      (!ids ||
        ids.includes(r.id) ||
        ('campaign' in r && r.campaign && ids.includes(r.campaign)) ||
        r.observations.some((o) => ids.includes(o.id))),
  );
  const selected = visible.find((row) => row.domain + ':' + row.id === selectedCampaign) ?? visible[0];
  const uniqueModels = new Set(rows.flatMap((row) => row.models)).size;
  const partialCount = rows.filter((row) => row.status === 'Incomplète' || row.status === 'Résultats partiels').length;

  return (
    <section className="campaign-index" aria-label="Campagnes d’évaluation">
      <div className="campaign-index-heading">
        <div>
          <p className="eyebrow">HISTORIQUE · TOUS LES DOMAINES</p>
          <h2>Historique des évaluations</h2>
          <p>Retrouvez vos tests de biologie, de schémas scientifiques et sur copies. Sélectionnez une campagne pour consulter son bilan.</p>
        </div>
        <div className="campaign-index-actions">
          <Button variant="secondary" onClick={() => onDiagram()}>Archives scientifiques</Button>
          <Button variant="secondary" onClick={() => onCustom()}>Comparer les essais sur copie</Button>
        </div>
      </div>
      <div className="campaign-index-stats" aria-label="Résumé de l’historique">
        <div><strong>{rows.length}</strong><span>Campagnes conservées</span></div>
        <div><strong>{uniqueModels}</strong><span>Modèles rencontrés</span></div>
        <div><strong>{partialCount}</strong><span>Résultats à examiner</span></div>
      </div>
      <div className="campaign-index-filters">
        <label>
          Domaine
          <select value={domain} onChange={(e) => { setDomain(e.target.value); setIds(undefined); setSelectedCampaign(null); }}>
            <option value="">Tous les domaines</option>
            {Object.entries(domainLabels).map(([id, name]) => <option value={id} key={id}>{name}</option>)}
          </select>
        </label>
        <label>
          Modèle
          <select value={model} onChange={(e) => { setModel(e.target.value); setIds(undefined); setSelectedCampaign(null); }}>
            <option value="">Tous les modèles</option>
            {[...new Set([...rows.flatMap((r) => r.models), model].filter(Boolean))].sort().map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        {ids && <Button variant="secondary" onClick={() => {
          setIds(undefined);
          setDomain('');
          setModel('');
          setSelectedCampaign(null);
        }}>Toutes les campagnes</Button>}
        <span className="campaign-index-count">{visible.length} campagne(s) affichée(s)</span>
      </div>

      {visible.length === 0 ? <p className="campaign-index-empty">Aucune campagne pour cette sélection. Modifiez les filtres pour retrouver vos résultats.</p> :
        <div className="campaign-index-layout">
          <div className="campaign-index-list" role="group" aria-label="Campagnes enregistrées">
            {visible.map((row) => (
              <button key={row.domain + row.id} type="button" className="campaign-index-item"
                aria-pressed={selected?.domain === row.domain && selected.id === row.id}
                onClick={() => setSelectedCampaign(row.domain + ':' + row.id)}>
                <strong>{row.title}</strong>
                <small>{new Date(row.date).toLocaleString('fr-FR')} · {domainLabels[row.domain]}</small>
                <span>{row.models.join(' · ') || 'Modèle non renseigné'}</span>
                <small>{row.detail} · {row.status}</small>
              </button>
            ))}
          </div>
          {selected && <article className="campaign-index-detail" key={selected.domain + selected.id}>
            <div className="campaign-index-detail-head">
              <div>
                <p className="eyebrow">RÉSULTAT ENREGISTRÉ · {domainLabels[selected.domain].toLocaleUpperCase('fr-FR')}</p>
                <h3>{selected.title}</h3>
                <p>{new Date(selected.date).toLocaleString('fr-FR')} · {selected.models.join(', ') || 'Modèle non renseigné'}</p>
              </div>
              <span className={'campaign-index-status ' + (selected.status === 'Terminée' ? 'is-complete' : '')}>{selected.status}</span>
            </div>
            <div className="campaign-index-detail-stats">
              <div><strong>{selected.stats.successful}</strong><span>Résultats exploitables</span></div>
              <div><strong>{selected.stats.total}</strong><span>Résultats enregistrés</span></div>
            </div>
            <p className="campaign-index-detail-summary">{selected.detail}</p>
            {(selected.status === 'Incomplète' || selected.status === 'Résultats partiels' || selected.issues.length > 0) && (
              <div className="campaign-index-issues" aria-label="Anomalies de cette campagne">
                <strong>{selected.issues.length
                  ? selected.issues.length + ' passage(s) à signaler'
                  : 'Campagne incomplète : diagnostic disponible'}</strong>
                {selected.issues.length > 0 && <ul>
                  {selected.issues.slice(0, 3).map((issue, index) => <li key={index}>{issue}</li>)}
                </ul>}
                {selected.issues.length > 3 && <small>Et {selected.issues.length - 3} autre(s) anomalie(s) dans le rapport.</small>}
                <p>Partage uniquement des métadonnées de diagnostic, jamais les copies, prompts ou réponses brutes.</p>
                <EvaluationIssueButton makeReport={() => buildEvaluationIssueReport({
                  journey: selected.domain, status: selected.status, model: selected.models.join(', '),
                  campaignId: selected.id, observations: selected.observations, stats: selected.stats,
                  issues: selected.issues,
                })} />
              </div>
            )}
            {selected.observations.length ? (
              <div className="campaign-index-observations">
                <h4>Notes par copie</h4>
                <div className="campaign-index-table-scroll">
                  <table>
                    <thead><tr><th>Modèle</th><th>Protocole / méthode</th><th>Copie</th><th>Professeur</th><th>Modèle</th></tr></thead>
                    <tbody>{selected.observations.map((o) => (
                      <tr key={o.id}>
                        <td>{o.model} · {o.profile}</td>
                        <td>{o.protocol} · {o.method}{o.prompts?.map((prompt) =>
                          prompt.promptId === 'grading.incremental' && prompt.promptVersion != null && (
                            <small key={JSON.stringify(prompt)}> · Correction par critère v{prompt.promptVersion}</small>
                          ))}</td>
                        <td>{o.caseId}</td>
                        <td>{o.referenceScore}/10</td>
                        <td>{o.score ?? '—'}/10</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            ) : selected.domain === 'diagrams' ? (
              <div className="campaign-index-detail-action">
                <p>Consultez les mesures par schéma, les décisions et la comparaison avec les essais précédents.</p>
                <Button variant="secondary" onClick={() => onDiagram(selected.id)}>Analyser ce rapport scientifique</Button>
              </div>
            ) : (
              <div className="campaign-index-detail-action">
                <p>Retrouvez les résultats détaillés de cette évaluation sur copie.</p>
                <Button variant="secondary" onClick={() => onCustom(selected.id)}>Ouvrir le résultat</Button>
              </div>
            )}
          </article>}
        </div>}
    </section>
  );
}
