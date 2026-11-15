import { buildRadarTimelineExport } from '../../domain/radarTimelineExport.ts';
import { remainingBiologyMethods, type BiologyMethod } from '../../domain/radarRemainingMethods.ts';
import {
  activeBiologyObservations, activeScienceEntries, biologyMethodLabels, loadRadarMethodExclusions,
  methodIsActive, observedRadarMethodId, saveRadarMethodExclusions, toggleRadarMethodExclusion,
} from '../../domain/radarMethodExclusions.ts';
import { scienceMethodProgress } from '../../domain/radarMethodProgress.ts';
import { biologyPoints, biologyRunMethodLabel, campaignGroups, scienceMethods, sciencePoints, trialSteps, type ScienceMethod, type TimelinePoint } from '../../domain/radarTimeline.ts';
import { RadarTimeline } from './RadarTimeline.tsx';
import { buildRadarAnalysisExport, isRadarBenchmark } from '../../domain/radarAnalysisExport.ts';
import { downloadJson } from '../../../shared/ui/downloadJson.ts';
import { Button } from '../../../shared/ui/design-system/index.ts';
import { useMemo, useState } from 'react';
import type { AiModelProfile } from '../../../shared/domain/aiModelProfiles.ts';
import { isNativeDecisionModel } from '../../../correction/api/index.ts';
import type { DiagramLabArchiveEntry } from '../../domain/diagramLabHistory.ts';
import {
  buildDiagramLabRadar,
  diagnoseGraphRadarMeasurement,
  observedRadarScore,
  rankDiagramLabRadar,
} from '../../domain/diagramLabRadar.ts';
import {
  planRadarModelEvaluation,
  resolveModelProfile,
  type RadarMissingTestRequest,
} from '../../domain/diagramLabRadarLaunch.ts';
import { BIOLOGY_RADAR_AXES, buildBiologyRadar, type BiologyRadarCandidate, type BiologyRadarObservation } from '../../domain/biologyTeacherRadar.ts';
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
  runScienceBatch,
  runBiologyBatch,
  initialLab = null,
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
  runBiology: (profile: string, baseline: boolean, traps: boolean, variant?: 'standard' | 'contract') => void;
  runScienceBatch?: (requests: Array<Omit<RadarMissingTestRequest, 'id'>>) => void;
  runBiologyBatch?: (profileId: string, methods: BiologyMethod[]) => void;
  initialLab?: RadarDomain | null;
}) {
  const [weights] = useState(restoredWeights);
  const [excluded, setExcluded] = useState(loadRadarMethodExclusions);
  const enabled = (domain: RadarDomain, methodId: string) => methodIsActive(excluded, domain, methodId);
  const eligibleEntries = useMemo(() => activeScienceEntries(entries, excluded, weights), [entries, excluded, weights]);
  const eligibleHistory = useMemo(() => activeBiologyObservations(history, excluded), [history, excluded]);
  const science = useMemo(
    () => rankDiagramLabRadar(buildDiagramLabRadar(eligibleEntries, 'model', profiles), weights),
    [eligibleEntries, profiles, weights],
  );
  const biology = useMemo(() => enabled('biology', 'contract') || enabled('biology', 'standard')
    ? buildBiologyRadar(eligibleHistory, enabled('biology', 'contract') ? 'contract' : 'standard')
    : [], [eligibleHistory, excluded]);
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
    (science.find((candidate) => candidate.id === name)?.measured ?? 0) / 9 +
    Math.max(0, ...biology.filter((candidate) => candidate.name === name)
      .map((candidate) => candidate.measured / BIOLOGY_RADAR_AXES.length));
  const [lab, setLab] = useState<RadarDomain | null>(initialLab);
  const [explicitMethod, setExplicitMethod] = useState({diagrams:false, biology:false});
  const [expanded, setExpanded] = useState<RadarDomain>('diagrams');
  const [variantId, setVariantId] = useState('');
  const variants = biology.filter((c) => c.name === selected);
  // The saved configuration is authoritative for the next run. Historical
  // results from another correction method must not disable or score it.
  const profile = profiles.find((p) =>
    p.configuration.analysisModel === selected &&
    p.configuration.correctionMethod !== 'visual-decision');
  const activeBio = profile && variants.find((candidate) =>
    candidate.method === profile.configuration.correctionMethod &&
    candidate.provider === (profile.configuration.apiCompatible ? 'openai-compatible' : 'ollama'));
  const bio = variants.find((candidate) => candidate.id === variantId) ??
    activeBio ?? (profile ? undefined : variants[0]);
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
  const graphDiagnostic = sci?.axes.relations.value === null
    ? diagnoseGraphRadarMeasurement(eligibleEntries, selected) : null;
  const plan = sci && resolveModelProfile(profiles, 'model', sci, planRadarModelEvaluation(sci, eligibleEntries));
  const misconfiguredDecisionVision = profiles.some((profile) =>
    profile.configuration.analysisModel === selected &&
    profile.configuration.correctionMethod === 'decision' &&
    !profile.configuration.apiCompatible &&
    isNativeDecisionModel(profile.configuration.visionModel));
  const [method, setMethod] = useState<ScienceMethod>('pixel-v1');
  const [bioMethod, setBioMethod] = useState<'standard' | 'contract'>('contract');
  const activeScienceMethod = enabled('diagrams', method) ? method
    : (Object.keys(scienceMethods) as ScienceMethod[]).find(id => enabled('diagrams', id));
  const activeBioMethodAllowed = (id: 'standard' | 'contract') => enabled('biology', id) &&
    (!profile || enabled('biology', observedRadarMethodId('biology', biologyRunMethodLabel(
      id, profile.configuration.correctionMethod,
      profile.configuration.apiCompatible ? 'openai-compatible' : 'ollama'))));
  const activeBioMethod = activeBioMethodAllowed(bioMethod) ? bioMethod
    : (['contract', 'standard'] as const).find(activeBioMethodAllowed);
  const scientificProgress = useMemo(() => scienceMethodProgress(entries, selected), [entries, selected]);
  function toggleMethod(domain: RadarDomain, id: string) {
    if (busy) return;
    const next = toggleRadarMethodExclusion(excluded, domain, id);
    setExcluded(next);
    saveRadarMethodExclusions(next);
  }
  // Resume only missing batteries under the existing trial ID. A completed but
  // indeterminate graph receives at most one different, targeted reading.
  const scienceBatchPlans = scientificProgress.flatMap(progress => {
    if (!sci || !enabled('diagrams', progress.method) || progress.complete || !progress.steps.length) return [];
    const request = resolveModelProfile(profiles, 'model', sci, {
      profileId: sci.profileId, profileName: sci.name, modelId: selected,
      axis: progress.missing[0] ?? 'graphics', steps: progress.steps,
    }, progress.method);
    return request && request.steps.length && profiles.some(profile => profile.id === request.profileId)
      ? [{ method: progress.method, request, trial: progress.trial }] : [];
  });
  const missingBiology = profile
    ? remainingBiologyMethods(history, selected, profile.id).filter(activeBioMethodAllowed)
    : [];

  const fullPlan = sci && activeScienceMethod && resolveModelProfile(profiles, 'model', sci, {
    profileId: sci.profileId, profileName: sci.name, axis: 'graphics', steps: trialSteps(activeScienceMethod),
  }, activeScienceMethod);
  const timeline = useMemo(() => ({
    diagrams: campaignGroups(entries.filter(isRadarBenchmark), e => e.trial?.id ?? e.id).flatMap<TimelinePoint>(group => {
      const last = [...group].sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0]!;
      const calculated = sciencePoints(group, weights);
      // Stored snapshots can predate later resumed batteries within the same
      // trial. Recompute axes/score from archived evidence, not from a stale snapshot.
      return calculated.map(point => {
        const stored = last.timeline?.find(p => p.model === point.model);
        return stored ? { ...stored, ...point } : { ...point, reconstructed: true };
      });
    }),
    biology: campaignGroups(history, row => row.campaignId ?? row.id).flatMap(group => {
      const saved = group.flatMap(row => row.timeline ? [row.timeline] : []);
      return biologyPoints(group).map(point => {
        const stored = saved.find(p => p.id === point.id && p.date === point.date);
        // Recompute grade metrics from archived teacher-keyed decisions even when an
        // earlier snapshot recorded the obsolete five-axis weighting.
        return stored ? {...stored, ...point, reconstructed: true} : {...point, reconstructed: true};
      });
    }),
  }), [entries, history, weights]);
  const score = (value: number | null | undefined) =>
    value == null ? '—' : value.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' / 100';
  const chosenSciencePlan = explicitMethod.diagrams || !enabled('diagrams', 'pixel-v1') ? fullPlan : plan;
  const canLaunchScience = (request: typeof fullPlan) =>
    Boolean(request && profiles.some(p => p.id === request.profileId));
  function launchChosen(domain: RadarDomain) {
    if (domain === 'diagrams' && fullPlan && activeScienceMethod) {
      runScience({...fullPlan, trial:{id:crypto.randomUUID(), method:activeScienceMethod, weights}});
    } else if (domain === 'biology' && profile && activeBioMethod) {
      runBiology(profile.id, true, true, activeBioMethod);
    }
  }
  function markChosen(domain: RadarDomain) {
    setExplicitMethod(previous => ({...previous, [domain]:true}));
  }
  if (lab) {
    const scientific = lab === 'diagrams';
    return <RadarTimeline key={lab + selected} domain={lab} exclusions={excluded}
      onToggleMethod={id => toggleMethod(lab, id)} methodSelectionDisabled={busy}
      domainLabel={domainLabels[lab]} model={selected}
      onBack={() => setLab(null)} points={timeline[lab].filter(p => p.model === selected)}
      onExport={() => {
        const date = new Date().toISOString();
        const report = buildRadarTimelineExport(lab, selected, timeline[lab], entries, history, weights, date, excluded);
        const filenameModel = selected.replace(/[^a-zA-Z0-9._-]+/g, '-');
        downloadJson(report, 'companion-methodes-' + lab + '-' + filenameModel + '-' + date.replace(/:/g, '-') + '.json');
      }}
      selectMethod={point => {
        markChosen(lab);
        if (point.scienceMethod && enabled('diagrams', point.scienceMethod)) setMethod(point.scienceMethod);
        if (point.biologyMethod && enabled('biology', point.biologyMethod)) setBioMethod(point.biologyMethod);
      }}>
      <label>Méthode du prochain essai (pour « Évaluer avec cette méthode »)
        {scientific ? <select value={activeScienceMethod ?? ''} disabled={!activeScienceMethod}
          onChange={e => { setMethod(e.target.value as ScienceMethod); markChosen(lab); }}>
          {!activeScienceMethod && <option value="">Aucune méthode active</option>}
          {Object.entries(scienceMethods).map(([id, item]) =>
            <option key={id} value={id} disabled={!enabled('diagrams', id)}>{item.label}{!enabled('diagrams', id) ? ' (exclue)' : ''}</option>)}
        </select> : <select value={activeBioMethod ?? ''} disabled={!activeBioMethod}
          onChange={e => { setBioMethod(e.target.value as typeof bioMethod); markChosen(lab); }}>
          {!activeBioMethod && <option value="">Aucune méthode active</option>}
          {(['contract', 'standard'] as const).map(id =>
            <option key={id} value={id} disabled={!activeBioMethodAllowed(id)}>{biologyMethodLabels[id]}{!activeBioMethodAllowed(id) ? ' (exclue)' : ''}</option>)}
        </select>}
      </label>
      {scientific && <p className="radar-method-help">« Évaluer avec cette méthode » utilise le choix ci-dessus. « Évaluer toutes les méthodes restantes » lance séparément les méthodes non exclues, dans l'ordre de la file, quel que soit le choix affiché. La stratégie de chaque campagne peut différer du moteur exécuté pour une batterie : le suivi indique les deux informations. « Comparer Think OFF / ON » dans Tests lance deux parcours déjà disponibles séparément ici, et non une troisième méthode.</p>}
      <p className="radar-method-guide-link"><a href="#method-science-guide">Lire les fiches scientifiques des méthodes{scientific ? ' (petites pointes, longs traits…)' : ''}</a></p>
      <div className="radar-method-launch-actions">
        <Button disabled={busy || !(scientific ? activeScienceMethod && canLaunchScience(fullPlan) : profile && activeBioMethod)}
          onClick={() => launchChosen(lab)}>Évaluer avec cette méthode</Button>
        <Button variant="secondary" disabled={busy || (scientific ? !runScienceBatch || !scienceBatchPlans.length : !runBiologyBatch || !missingBiology.length)}
          onClick={() => {
            if (scientific) runScienceBatch?.(scienceBatchPlans.map(({ method: nextMethod, request, trial }) => ({
              ...request, trial: trial ?? { id: crypto.randomUUID(), method: nextMethod, weights },
            })));
            else if (profile) runBiologyBatch?.(profile.id, missingBiology);
          }}>Évaluer toutes les méthodes restantes ({scientific ? scienceBatchPlans.length : missingBiology.length})</Button>
      </div>
      {scientific && <section className="radar-method-audit" aria-label={'État des ' + Object.keys(scienceMethods).length + ' méthodes scientifiques'}>
        <h3>Bilan de complétude par méthode</h3>
        <p>Une campagne terminée n'est pas forcément un radar complet. Les relances ciblées
          conservent le même essai et ne refont pas les batteries déjà exploitables.</p>
        <div className="radar-method-audit-scroll"><table>
          <thead><tr><th>Méthode</th><th>Passages réussis</th><th>Axes mesurés</th><th>État et diagnostic</th><th>Action</th></tr></thead>
          <tbody>{scientificProgress.map(progress => {
            const excludedMethod = !enabled('diagrams', progress.method);
            const next = scienceBatchPlans.find(item => item.method === progress.method);
            return <tr key={progress.method} data-excluded={excludedMethod}>
              <th scope="row">{progress.label}{excludedMethod && <small> · Exclue</small>}</th>
              <td>{progress.successful}/{progress.planned}{progress.failed > 0 ? ' · ' + progress.failed + ' échec(s)' : ''}</td>
              <td>{progress.measured}/9</td>
              <td><strong>{excludedMethod ? 'Exclue · non relancée' : progress.complete ? 'Complet' :
                progress.interrupted ? 'Interrompu / partiel' :
                !progress.trial ? 'Non testé' : next ? 'Partiel · à reprendre' : 'Partiel · bloqué'}</strong>
                {!progress.complete && <details><summary>Pourquoi ?</summary><p>{progress.reason}</p>
                  <ul>{progress.batteries.map(battery => <li key={battery.protocol}>
                    {{reference: 'Référence A/B/C', arrows: 'Flèches D/E', semantic: 'Biologie S0–S5', graph: 'Relations S0–S5'}[battery.protocol]}
                    {' · '}{battery.successful}/{battery.planned} passages réussis{battery.failed > 0 && ' · ' + battery.failed + ' en échec'}
                  </li>)}</ul></details>}
              </td>
              <td><Button variant="secondary" disabled={busy || excludedMethod || !runScience || !next}
                onClick={() => {
                  if (!next) return;
                  runScience({...next.request, trial: next.trial ??
                    {id: crypto.randomUUID(), method: next.method, weights}});
                }}>Relancer les manquants</Button></td>
            </tr>;
          })}</tbody>
        </table></div>
      </section>}
      {scientific && scientificProgress.some(progress => enabled('diagrams', progress.method) &&
        !progress.complete && !scienceBatchPlans.some(plan => plan.method === progress.method)) &&
        <p role="note">Certaines méthodes n'ont plus de relance automatique sûre ou n'ont pas de profil compatible.
          Leur diagnostic reste consultable ci-dessus ; elles ne sont pas déclarées complètes.</p>}
      {(scientific ? scientificProgress.filter(progress => enabled('diagrams', progress.method)).length > 0 &&
          scientificProgress.filter(progress => enabled('diagrams', progress.method)).every(progress => progress.complete)
        : profile && (['contract', 'standard'] as const).some(id => enabled('biology', id)) && !missingBiology.length) &&
        <p role="status">Toutes les méthodes actives de ce modèle possèdent un radar complet.</p>}
      {!activeScienceMethod && scientific && <p role="status">Toutes les méthodes sont exclues : réactivez-en une ci-dessus pour évaluer.</p>}
      {!activeBioMethod && !scientific && <p role="status">Toutes les méthodes sont exclues : réactivez-en une ci-dessus pour évaluer.</p>}
    </RadarTimeline>;
  }
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
        <Button variant="secondary" disabled={!history.length && !entries.some(isRadarBenchmark)}
          onClick={() => {
            const date = new Date().toISOString();
            downloadJson(buildRadarAnalysisExport(entries, history, weights, date, excluded),
              'companion-radars-' + date.replace(/:/g, '-') + '.json');
          }}>Exporter tous les résultats</Button>
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
          const total = scientific ? 9 : BIOLOGY_RADAR_AXES.length;
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
              {scientific && graphDiagnostic &&
                ['retry', 'exhausted', 'unusable'].includes(graphDiagnostic.kind) && (
                  <p className="radar-home-graph-status" role="status">
                    <strong>Relations · tests terminés, mesure indéterminée.</strong>{' '}
                    {graphDiagnostic.message}
                  </p>
                )}
              <div className="radar-home-actions">
                {(scientific ? (explicitMethod.diagrams || (count < total && (Boolean(plan) || misconfiguredDecisionVision))) : true) && (
                  <Button
                    disabled={
                      busy || !(scientific ? activeScienceMethod && canLaunchScience(chosenSciencePlan) : profile && activeBioMethod)
                    }
                    onClick={() => {
                      if (explicitMethod[domain] || (scientific && !enabled('diagrams', 'pixel-v1'))) launchChosen(domain);
                      else if (scientific && plan && activeScienceMethod) runScience({ ...plan, trial: {
                        id: crypto.randomUUID(), method: activeScienceMethod, weights,
                      } });
                      else if (!scientific && profile && activeBioMethod === 'standard')
                        runBiology(profile.id, true, true, 'standard');
                      else if (!scientific && profile && activeBioMethod)
                        runBiology(
                          profile.id,
                          !activeBio || activeBio.measured === total ||
                            activeBio.axes.grade === null ||
                            activeBio.axes.rubric === null ||
                            activeBio.axes.positives === null ||
                            activeBio.axes.negatives === null ||
                            activeBio.axes.critical === null,
                          !activeBio || activeBio.measured === total || activeBio.axes.traps === null,
                        );
                    }}
                  >
                    {explicitMethod[domain] ? 'Évaluer · ' + (scientific ? activeScienceMethod ? scienceMethods[activeScienceMethod].label : 'méthode exclue' : activeBioMethod ? biologyMethodLabels[activeBioMethod] : 'méthode exclue') : !scientific && activeBio?.measured === total
                      ? 'Relancer l’évaluation'
                      : scientific && plan?.steps.length === 1 && plan.steps[0]?.protocol === 'graph' && plan.steps[0]?.zoom
                        ? 'Seconde lecture ciblée'
                      : count ? 'Compléter les tests'
                        : 'Évaluer en ' + (scientific ? 'schémas scientifiques' : 'biologie')}
                  </Button>
                )}
                {scientific && !plan && misconfiguredDecisionVision && !busy && (
                  <small role="alert">Modèle décisionnel utilisé en Vision : ce modèle ne prend pas en charge /api/chat. Choisissez un lecteur Vision génératif dans « Gérer les configurations ».</small>
                )}
                {ids.length > 0 && (
                  <Button variant="secondary" onClick={() => campaigns(domain, selected, ids)}>Voir les campagnes</Button>
                )}
                <Button variant="secondary" onClick={() => setLab(domain)}>Analyse des méthodes</Button>
                <Button variant="secondary" onClick={() => details(domain, selected)}>Détail du radar</Button>
              </div>

            </article>
          );
        })}
      </div>
    </section>
  );
}
