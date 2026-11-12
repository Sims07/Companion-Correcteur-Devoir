import { Button } from '../design-system/index.ts';
import { useMemo, useState } from 'react';
import type { AiModelProfile } from '../../domain/aiModelProfiles.ts';
import type { DiagramLabArchiveEntry } from '../../domain/diagramLabHistory.ts';
import {
  buildDiagramLabRadar,
  observedRadarScore,
  rankDiagramLabRadar,
} from '../../domain/diagramLabRadar.ts';
import {
  planRadarModelEvaluation,
  resolveModelProfile,
  type RadarMissingTestRequest,
} from '../../domain/diagramLabRadarLaunch.ts';
import { buildBiologyRadar, type BiologyRadarObservation } from '../../domain/biologyTeacherRadar.ts';
import { BiologyRadarPlot } from './BiologyTeacherRadar.tsx';
import { RadarPlot, restoredWeights } from './ScientificDiagramRadar.tsx';
import './EvaluationRadarHome.css';

export type RadarDomain = 'diagrams' | 'biology';
export const domainLabels = { diagrams: 'Schémas scientifiques', biology: 'Biologie', custom: 'Ma copie' };
export function EvaluationRadarHome({
  entries,
  history,
  profiles,
  model,
  choose,
  busy,
  manage,
  details,
  campaigns,
  runScience,
  runBiology,
}: {
  entries: DiagramLabArchiveEntry[];
  history: BiologyRadarObservation[];
  profiles: AiModelProfile[];
  model: string;
  choose: (id: string) => void;
  busy: boolean;
  manage: () => void;
  details: (domain: RadarDomain, model: string) => void;
  campaigns: (domain: RadarDomain, model: string, ids: string[]) => void;
  runScience: (request: Omit<RadarMissingTestRequest, 'id'>) => void;
  runBiology: (profile: string, baseline: boolean, traps: boolean) => void;
}) {
  const [weights] = useState(restoredWeights);
  const science = useMemo(
    () => rankDiagramLabRadar(buildDiagramLabRadar(entries, 'model', profiles), weights),
    [entries, profiles, weights],
  );
  const biology = useMemo(() => buildBiologyRadar(history, 'contract'), [history]);
  const models = [...new Set([...science.map((c) => c.id), ...history.map((o) => o.model)])].sort();
  const selected = models.includes(model) ? model : (science[0]?.id ?? models[0] ?? '');
  const [comparison, setComparison] = useState(false);
  const [expanded, setExpanded] = useState<RadarDomain>('diagrams');
  const [variantId, setVariantId] = useState('');
  const variants = biology.filter((c) => c.name === selected);
  const bio = variants.find((c) => c.id === variantId) ?? variants[0];
  const sci = science.find((c) => c.id === selected);
  const plan = sci && resolveModelProfile(profiles, 'model', sci, planRadarModelEvaluation(sci));
  const profile = profiles.find(
    (p) =>
      p.configuration.analysisModel === selected &&
      p.configuration.correctionMethod !== 'visual-decision' &&
      (!bio ||
        (bio.method === p.configuration.correctionMethod &&
          bio.provider === (p.configuration.apiCompatible ? 'openai-compatible' : 'ollama'))),
  );
  const score = (value: number | null | undefined) =>
    value == null ? '—' : value.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' / 100';
  return (
    <section className="radar-home" aria-label="Tableau de bord des radars">
      <header>
        <label>
          Choisir un LLM
          <select value={selected} disabled={!models.length} onChange={(e) => choose(e.target.value)}>
            {!models.length && <option value="">Aucun modèle configuré ou testé</option>}
            {models.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        {models.length > 1 && (
          <Button variant="secondary" aria-expanded={comparison} onClick={() => setComparison(!comparison)}>
            Comparer les LLM
          </Button>
        )}
        <Button variant="secondary" onClick={manage}>Gérer les configurations</Button>
      </header>
      {comparison && (
        <div className="radar-comparison">
          <table>
            <caption>Notes complètes par domaine</caption>
            <thead>
              <tr>
                <th>LLM</th>
                <th>Schémas scientifiques</th>
                <th>Biologie · contrat par question</th>
              </tr>
            </thead>
            <tbody>
              {models.map((name) => (
                <tr key={name}>
                  <th>
                    <Button variant="secondary" onClick={() => choose(name)}>{name}</Button>
                  </th>
                  <td>{score(science.find((c) => c.id === name)?.weightedScore)}</td>
                  <td>
                    {biology
                      .filter((c) => c.name === name)
                      .map((c) => (
                        <div key={c.id}>
                          {score(c.score)} · {c.provider} · {c.method}
                        </div>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="radar-home-pair">
        {(['diagrams', 'biology'] as const).map((domain) => {
          const scientific = domain === 'diagrams';
          const count = (scientific ? sci : bio)?.measured ?? 0;
          const total = scientific ? 8 : 5;
          const value = scientific
            ? sci && observedRadarScore(sci, weights)
            : (bio?.score ?? bio?.partialScore);
          const ids = scientific
            ? Object.values(sci?.axes ?? {}).flatMap((axis) => axis.evidence.map((e) => e.reportId))
            : (bio?.observations.map((o) => o.id) ?? []);
          return (
            <article key={domain} aria-label={domainLabels[domain]} data-expanded={expanded === domain}>
              <div className="radar-home-summary">
                <h3>{domainLabels[domain]}</h3>
                <strong className="radar-home-score">{count ? score(value) : 'À évaluer'}</strong>
                <p>
                  {count === total ? 'Note globale' : count ? 'Indice partiel' : 'Aucune mesure'} · {count}/
                  {total} axes
                </p>
                {!scientific && bio?.gradeDifference != null && (
                  <p>
                    Écart moyen avec le professeur sur 10 :{' '}
                    <b>{bio.gradeDifference.toLocaleString('fr-FR')} pt</b>
                  </p>
                )}
                {!scientific && variants.length > 1 && (
                  <label>
                    Configuration biologique
                    <select value={bio?.id} onChange={(e) => setVariantId(e.target.value)}>
                      {variants.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.provider} · {c.method}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <Button variant="secondary"
                  className="radar-mobile-toggle"
                  aria-expanded={expanded === domain}
                  onClick={() => setExpanded(domain)}
                >
                  Afficher le graphique
                </Button>
              </div>
              <div className="radar-home-plot">
                {scientific ? (
                  <RadarPlot candidates={sci ? [sci] : []} />
                ) : (
                  <BiologyRadarPlot candidate={bio} />
                )}
              </div>
              <div className="radar-home-actions">
                {count < total && (
                  <Button
                    disabled={
                      busy || !(scientific ? plan && profiles.some((p) => p.id === plan.profileId) : profile)
                    }
                    onClick={() => {
                      if (scientific && plan) runScience(plan);
                      else if (!scientific && profile)
                        runBiology(
                          profile.id,
                          !bio ||
                            bio.axes.grade === null ||
                            bio.axes.rubric === null ||
                            bio.axes.positives === null ||
                            bio.axes.negatives === null,
                          !bio || bio.axes.traps === null,
                        );
                    }}
                  >
                    {count
                      ? 'Compléter les tests'
                      : 'Évaluer en ' + (scientific ? 'schémas scientifiques' : 'biologie')}
                  </Button>
                )}
                {ids.length > 0 && (
                  <Button variant="secondary" onClick={() => campaigns(domain, selected, ids)}>Voir les campagnes</Button>
                )}
                <Button variant="secondary" onClick={() => details(domain, selected)}>Détail du radar</Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
