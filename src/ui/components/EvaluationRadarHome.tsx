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
import { buildBiologyRadar, type BiologyRadarCandidate, type BiologyRadarObservation } from '../../domain/biologyTeacherRadar.ts';
import { BiologyRadarPlot } from './BiologyTeacherRadar.tsx';
import { BiologyRadarComparisonPlot } from './BiologyRadarComparisonPlot.tsx';
import { RADAR_COMPARISON_COLORS } from './RadarComparisonPalette.ts';
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
  const [comparedModels, setComparedModels] = useState<string[]>([]);
  const availableComparisons = models.filter((name) => name !== selected);
  const compared = comparison
    ? comparedModels.filter((name) => name !== selected && models.includes(name)).slice(0, 3)
    : [];
  const seriesColors = Object.fromEntries([selected, ...compared].map((name, index) =>
    [name, RADAR_COMPARISON_COLORS[index % RADAR_COMPARISON_COLORS.length]!]));
  const measuredFor = (name: string) =>
    (science.find((candidate) => candidate.id === name)?.measured ?? 0) / 8 +
    Math.max(0, ...biology.filter((candidate) => candidate.name === name)
      .map((candidate) => candidate.measured / 5));
  const [expanded, setExpanded] = useState<RadarDomain>('diagrams');
  const [variantId, setVariantId] = useState('');
  const variants = biology.filter((c) => c.name === selected);
  const bio = variants.find((c) => c.id === variantId) ?? variants[0];
  const sci = science.find((c) => c.id === selected);
  const sciences = [sci, ...compared.map((name) => science.find((c) => c.id === name))]
    .filter((candidate): candidate is NonNullable<typeof sci> => candidate !== undefined);
  // All biological results here use the same "contract by question" benchmark.
  // When a model has several provider/method variants, prefer the one with the
  // most measured axes, and use matching setup as a tie-breaker.
  const comparedBiology = (name: string): BiologyRadarCandidate | undefined =>
    biology.filter((candidate) => candidate.name === name).sort((a, b) =>
      b.measured - a.measured ||
      Number(b.method === bio?.method && b.provider === bio?.provider) -
        Number(a.method === bio?.method && a.provider === bio?.provider))[0];
  const biologies = [bio, ...compared.map(comparedBiology)]
    .filter((candidate): candidate is BiologyRadarCandidate => candidate !== undefined);
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
          <select value={selected} disabled={!models.length} onChange={(event) => {
            const next = event.target.value;
            if (comparison && comparedModels.includes(next) && selected !== next) {
              // Promoting a compared LLM to primary should not silently lose the overlay.
              setComparedModels([...comparedModels.filter((name) => name !== next && name !== selected), selected].slice(0, 3));
            }
            choose(next);
          }}>
            {!models.length && <option value="">Aucun modèle configuré ou testé</option>}
            {models.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        {models.length > 1 && (
          <Button variant="secondary" aria-expanded={comparison} onClick={() => {
            if (comparison) { setComparison(false); return; }
            if (!comparedModels.some((name) => name !== selected && models.includes(name))) {
              // Open on an actual measured candidate instead of an empty overlay.
              const preferred = [...availableComparisons].sort((a, b) => measuredFor(b) - measuredFor(a))[0];
              if (preferred) setComparedModels([preferred]);
            }
            setComparison(true);
          }}>
            {comparison ? 'Masquer la comparaison' : 'Comparer les LLM'}
          </Button>
        )}
        <Button variant="secondary" onClick={manage}>Gérer les configurations</Button>
      </header>
      {comparison && (
        <div className="radar-home-compare-controls" role="group" aria-label="Modèles à superposer">
          <span>Comparer sur les deux radars</span>
          <div className="radar-home-compare-chips">
            {compared.map((name) => (
              <span className="radar-home-compare-chip" key={name}>
                {name}
                <button type="button" aria-label={'Retirer ' + name + ' de la comparaison'}
                  onClick={() => setComparedModels(compared.filter((candidate) => candidate !== name))}>
                  ×
                </button>
              </span>
            ))}
          </div>
          {compared.length < 3 && (
            <label>
              Ajouter un LLM
              <select aria-label="Ajouter un LLM à la comparaison" value=""
                onChange={(event) => {
                  if (event.target.value && !compared.includes(event.target.value)) {
                    setComparedModels([...compared, event.target.value]);
                  }
                }}>
                <option value="">Choisir un modèle…</option>
                {availableComparisons.filter((name) => !compared.includes(name))
                  .map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          )}
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
                  <RadarPlot candidates={comparison ? sciences : sci ? [sci] : []} colors={comparison ? seriesColors : undefined} />
                ) : comparison ? (
                  <BiologyRadarComparisonPlot candidates={biologies} colors={seriesColors} />
                ) : (
                  <BiologyRadarPlot candidate={bio} />
                )}
                {comparison && (
                  <div className="radar-home-legend" aria-label={'Modèles comparés en ' + domainLabels[domain]}>
                    {(scientific ? sciences.map((candidate) => ({
                      id: candidate.id, name: candidate.name, measured: candidate.measured,
                      value: candidate.complete ? candidate.weightedScore : observedRadarScore(candidate, weights),
                      context: '',
                    })) : biologies.map((candidate) => ({
                      id: candidate.id, name: candidate.name, measured: candidate.measured,
                      value: candidate.score ?? candidate.partialScore,
                      context: candidate.provider + ' · ' + candidate.method,
                    }))).map((candidate, index) => (
                      <div key={candidate.id} className="radar-home-legend-item">
                        <span className="radar-home-legend-color" aria-hidden="true"
                          style={{ background: seriesColors[candidate.name] ?? RADAR_COMPARISON_COLORS[index % RADAR_COMPARISON_COLORS.length] }} />
                        <div>
                          <strong>{candidate.name}</strong>
                          {candidate.context && <small>{candidate.context}</small>}
                          <span>{candidate.measured ? score(candidate.value) : 'Non évalué'}</span>
                          <small>{candidate.measured === total ? 'Note globale'
                            : 'Indice partiel · ' + candidate.measured + '/' + total + ' axes'}</small>
                        </div>
                      </div>
                    ))}
                  </div>
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
