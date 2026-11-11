import { useEffect, useMemo, useState } from 'react';
import type { DiagramLabArchiveEntry } from '../../domain/diagramLabHistory.ts';
import { buildDiagramLabRadar, compareRadarCommonAxes, rankDiagramLabRadar, observedRadarScore, RADAR_AXES, RADAR_PRESETS, validRadarWeights,
  type RadarAxisId, type RadarGrouping, type RadarModelConfiguration, type RadarRankedCandidate, type RadarWeights } from '../../domain/diagramLabRadar.ts';
import { DesignSystemSelect } from './DesignSystemSelect.tsx';
import type { DiagramMethodSelection } from '../../domain/scientificDiagramProtocol.ts';
import { planMissingRadarAxis, radarPlanDescription, type RadarMissingTestRequest } from '../../domain/diagramLabRadarLaunch.ts';
import { Button } from '../design-system/index.ts';
import './ScientificDiagramRadar.css';

const PALETTE = ['#b4563d', '#287a8d', '#7556a8', '#688148'];
const STORAGE_KEY = 'companion:scientific-lab-radar-weights:v1';

function restoredWeights(): RadarWeights {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    if (validRadarWeights(parsed)) return parsed;
  } catch { /* Keep the default, no local data transmission. */ }
  return { ...RADAR_PRESETS.scientific };
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString('fr-FR') : value;
}

function point(index: number, fraction: number): [number, number] {
  const angle = Math.PI * 2 * index / RADAR_AXES.length - Math.PI / 2;
  return [350 + Math.cos(angle) * 198 * fraction, 285 + Math.sin(angle) * 198 * fraction];
}

function pointsString(fraction: number) {
  return RADAR_AXES.map((_, i) => point(i, fraction).join(',')).join(' ');
}

/** No polygon is drawn for an incomplete candidate: an absent axis is not 0%. */
function RadarPlot({ candidates, onAxis }: {
  candidates: RadarRankedCandidate[];
  onAxis: (axis: RadarAxisId) => void;
}) {
  return <svg viewBox="0 0 700 570" className="diagram-radar-svg" role="img"
      aria-label={'Comparaison radar sur huit caractéristiques pour ' + candidates.map((c) => c.name).join(', ')}>
    <title>Profil de compétences scientifiques</title>
    <desc>Échelle de 0 à 100 ; un contour fermé signifie que les huit mesures existent. Les mesures manquantes ne sont pas dessinées.</desc>
    {[.25, .5, .75, 1].map((fraction) =>
      <polygon key={fraction} points={pointsString(fraction)} fill="none" stroke="var(--ds-color-border-strong)"
        strokeDasharray={fraction === 1 ? undefined : '3 5'} strokeWidth={fraction === 1 ? 1.5 : 1} />)}
    {RADAR_AXES.map((axis, i) => {
      const [x,y] = point(i, 1);
      const [tx,ty] = point(i, 1.25);
      return <g key={axis.id}>
        <line x1={350} y1={285} x2={x} y2={y} stroke="var(--ds-color-border-strong)" strokeWidth="1" />
        <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" fill="var(--ds-color-text)" fontSize="13"
          fontWeight="600">{axis.short}</text>
      </g>;
    })}
    {[25, 50, 75, 100].map((n) =>
      <text key={n} x={358} y={285 - 198 * n / 100} fontSize="10" fill="var(--ds-color-text-muted)">{n}</text>)}
    {candidates.map((candidate, ci) => {
      const color = PALETTE[ci % PALETTE.length]!;
      const values = RADAR_AXES.map((axis) => candidate.axes[axis.id].value);
      const coordinates = values.map((n, i) => n === null ? null : point(i, n / 100));
      if (candidate.complete) return <g key={candidate.id}>
        <polygon points={coordinates.map((xy) => xy!.join(',')).join(' ')} fill={color} fillOpacity=".12"
          stroke={color} strokeWidth="2.8" strokeLinejoin="round" />
        {coordinates.map((xy, i) => <circle key={i} cx={xy![0]} cy={xy![1]} r="3" fill={color} />)}
      </g>;
      return <g key={candidate.id}>
        {coordinates.map((xy, i) => {
          const next = coordinates[(i + 1) % coordinates.length];
          return xy && next
            ? <line key={i} x1={xy[0]} y1={xy[1]} x2={next[0]} y2={next[1]} stroke={color}
                strokeWidth="2.8" strokeDasharray="6 4" />
            : null;
        })}
        {coordinates.map((xy, i) => xy
          ? <circle key={i} cx={xy[0]} cy={xy[1]} r="4" fill={color} stroke="var(--ds-color-surface)" strokeWidth="1.5" />
          : null)}
      </g>;
    })}
    {RADAR_AXES.map((axis, i) => {
      const [x,y] = point(i, 1.25);
      return <g key={axis.id} className="diagram-radar-axis-hit" role="button" tabIndex={0}
        aria-label={'Inspecter ' + axis.label}
        onClick={() => onAxis(axis.id)}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onAxis(axis.id); } }}>
        <circle cx={x} cy={y} r={33} fill="transparent" />
      </g>;
    })}
  </svg>;
}

export function ScientificDiagramRadar({ entries, onOpenReport, onRunMissing, profileIds, profiles = [], busy }: {
  entries: DiagramLabArchiveEntry[];
  onOpenReport: (id: string) => void;
  onRunMissing: (request: Omit<RadarMissingTestRequest, 'id'>) => void;
  profileIds: readonly string[];
  profiles?: readonly RadarModelConfiguration[];
  busy: boolean;
}) {
  const [grouping, setGrouping] = useState<RadarGrouping>('model');
  const [modelId, setModelId] = useState('');
  const [comparisonModelId, setComparisonModelId] = useState('');
  const [family, setFamily] = useState<'grading' | 'graph'>('grading');
  const [weights, setWeights] = useState<RadarWeights>(restoredWeights);
  const [preset, setPreset] = useState<'scientific' | 'balanced' | 'throughput' | 'custom'>(() => {
    const key = Object.entries(RADAR_PRESETS).find(([, presetWeights]) =>
      RADAR_AXES.every((axis) => presetWeights[axis.id] === weights[axis.id]))?.[0];
    return (key as 'scientific' | 'balanced' | 'throughput' | undefined) ?? 'custom';
  });
  const [picked, setPicked] = useState<string[] | null>(null);
  const [axis, setAxis] = useState<RadarAxisId>('arrows');
  const [focus, setFocus] = useState('');
  const candidates = useMemo(() => buildDiagramLabRadar(entries, grouping, profiles), [entries, grouping, profiles]);
  const filtered = useMemo(() => grouping !== 'method' ? candidates : candidates.filter((candidate) =>
    candidate.methods.some((method) => method.startsWith('blind-graph')) === (family === 'graph')), [candidates, grouping, family]);
  const partial = useMemo(() => grouping === 'method'
    ? compareRadarCommonAxes(filtered, weights) : null, [filtered, grouping, weights]);
  const ranked = useMemo(() => {
    const rows = rankDiagramLabRadar(filtered, weights);
    if (!partial) return rows;
    const indexed = new Map(partial.rows.map((item) => [item.id, item.score]));
    return [...rows].sort((a, b) => (indexed.get(b.id) ?? -1) - (indexed.get(a.id) ?? -1));
  }, [filtered, weights, partial]);
  const activeModel = grouping === 'model' ? ranked.find((item) => item.id === modelId) ?? ranked[0] ?? null : null;
  const comparedModel = grouping === 'model'
    ? ranked.find((item) => item.id === comparisonModelId && item.id !== activeModel?.id) ?? null : null;
  const selected = grouping === 'model'
    ? [activeModel, comparedModel].filter((item): item is RadarRankedCandidate => item !== null)
    : picked === null ? ranked.slice(0, 3) : ranked.filter((c) => picked.includes(c.id));
  const examined = grouping === 'model' ? activeModel : ranked.find((c) => c.id === focus) ?? selected[0] ?? ranked[0] ?? null;
  const evidence = examined?.axes[axis] ?? null;

  /** A model may be saved in several profiles. Launch with an actual profile
   * that uses the selected LLM for EACH requested protocol, never a random
   * saved profile sharing its display label. */
  function planFor(candidate: RadarRankedCandidate, target: RadarAxisId) {
    const plan = planMissingRadarAxis(candidate, target, grouping);
    if (!plan || grouping !== 'model') return plan;
    if (!profiles.length) return plan; // Compatibility with historical archives and older embeds.
    const matching = profiles.find((profile) => {
      const needsGrading = plan.steps.some((step) => step.protocol !== 'graph');
      const needsGraph = plan.steps.some((step) => step.protocol === 'graph');
      const cfg = profile.configuration;
      const graphModel = cfg.visionModel.trim() || cfg.analysisModel.trim();
      return (!needsGrading || cfg.analysisModel.trim() === candidate.id)
        && (!needsGraph || graphModel === candidate.id);
    });
    if (!matching) return null;
    const config = profiles.find((profile) => profile.id === matching.id)?.configuration;
    const method: DiagramMethodSelection = config?.analysisModel.trim() === config?.visionModel.trim()
      ? 'direct-image-generative' : 'vision-then-analysis';
    return {
      ...plan, profileId: matching.id, profileName: matching.name,
      steps: plan.steps.map((step) => ({
        ...step, method: step.protocol === 'graph' ? step.method : method,
      })),
    };
  }
  const missingPlan = examined ? planFor(examined, axis) : null;
  const profileAvailable = examined ? (grouping === 'model' && profiles.length
    ? Boolean(missingPlan && profileIds.includes(missingPlan.profileId))
    : profileIds.includes(examined.profileId)) : false;
  const eligible = ranked.filter((c) => grouping !== 'method' ? c.weightedScore !== null
    : partial?.rows.some((row) => row.id === c.id && row.score !== null));
  const missingAxes = examined ? RADAR_AXES.filter((item) => examined.axes[item.id].value === null) : [];
  const indicative = examined ? observedRadarScore(examined, weights) : null;

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(weights)); }
    catch { /* Non-persistent preferences do not prevent testing. */ }
  }, [weights]);

  function toggle(id: string) {
    const active = picked === null ? ranked.slice(0, 3).map((c) => c.id) : picked;
    if (active.includes(id)) { setPicked(active.filter((selectedId) => selectedId !== id)); return; }
    if (active.length < 4) setPicked([...active, id]);
  }

  return <section className="diagram-radar-workspace" aria-label="Radar des candidats scientifiques">
    <div className="diagram-radar-intro">
      <p className="eyebrow">SYNTHÈSE · BATTERIES AUTOMATIQUES</p>
      <h3>Quel LLM choisir pour les schémas scientifiques ?</h3>
      <p>Choisissez d’abord un modèle pour retrouver son radar, ses résultats et les tests restants. Les scores portent sur les protocoles enregistrés et leurs méthodes, pas sur une performance universelle du modèle.</p>
    </div>
    {grouping === 'model' && <section className="diagram-radar-model-overview" aria-label="Bilan du LLM sélectionné">
      <div className="diagram-radar-model-pickers">
        <label>Choisir un LLM
          <DesignSystemSelect aria-label="Choisir un LLM" value={activeModel?.id ?? ''} disabled={!ranked.length}
            onChange={(event) => { setModelId(event.currentTarget.value); setComparisonModelId(''); }}>
            {ranked.length ? [...ranked].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
              .map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)
              : <option value="">Aucun modèle configuré ou testé</option>}
          </DesignSystemSelect>
        </label>
        <label>Comparer avec un autre LLM (facultatif)
          <DesignSystemSelect aria-label="Comparer avec un autre LLM" value={comparedModel?.id ?? ''}
            disabled={ranked.length < 2 || !activeModel} onChange={(event) => setComparisonModelId(event.currentTarget.value)}>
            <option value="">Aucun · afficher un seul modèle</option>
            {ranked.filter((candidate) => candidate.id !== activeModel?.id)
              .map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
          </DesignSystemSelect>
        </label>
      </div>
      {activeModel && <div className="diagram-radar-model-scorecard" aria-live="polite">
        <div className="diagram-radar-score-number">
          <span>Note globale · {activeModel.name}</span>
          <strong>{activeModel.weightedScore === null ? '—' :
            activeModel.weightedScore.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' / 100'}</strong>
          <small>{activeModel.complete ? '8/8 caractéristiques mesurées · score pondéré' :
            'Note indisponible : il reste des tests à effectuer'}</small>
        </div>
        <div className="diagram-radar-score-coverage">
          <strong>{activeModel.measured} / 8</strong>
          <span>caractéristiques évaluées</span>
          {indicative !== null && !activeModel.complete && <small>
            Indice partiel : {indicative.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}/100 · non comparable à une note globale
          </small>}
        </div>
        {comparedModel && <div className="diagram-radar-score-compare">
          <span>{comparedModel.name}</span>
          <strong>{comparedModel.weightedScore === null ? 'Pas de note globale' :
            comparedModel.weightedScore.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' / 100'}</strong>
          <small>{comparedModel.measured}/8 caractéristiques</small>
        </div>}
      </div>}
      {activeModel && <div className="diagram-radar-remaining" aria-label="Tests restant à faire pour ce LLM">
        <div><h4>{missingAxes.length ? 'Caractéristiques à compléter' : 'Toutes les caractéristiques sont mesurées'}</h4>
          <p>{missingAxes.length
            ? missingAxes.length + ' caractéristique(s) non évaluée(s) · lancez directement une batterie disponible.'
            : 'Les huit axes sont alimentés par les campagnes locales enregistrées.'}</p></div>
        {missingAxes.length > 0 && <div className="diagram-radar-remaining-list">
          {missingAxes.map((item) => {
            const plan = planFor(activeModel, item.id);
            return <div key={item.id} className="diagram-radar-remaining-item">
              <button type="button" onClick={() => setAxis(item.id)}>{item.label}</button>
              {plan && profileIds.includes(plan.profileId)
                ? <Button variant="secondary" disabled={busy} onClick={() => onRunMissing(plan)}>Lancer</Button>
                : <small>Profil compatible requis</small>}
            </div>;
          })}
        </div>}
      </div>}
    </section>}
    <div className="diagram-radar-toolbar">
      <label>Regrouper les candidats
        <DesignSystemSelect value={grouping} onChange={(event) => { setGrouping(event.currentTarget.value as RadarGrouping); setPicked(null); setFocus(''); setComparisonModelId(''); }}>
          <option value="model">Par LLM · vue principale</option>
          <option value="profile">Par profil IA · bilan consolidé</option>
          <option value="method">Par profil + méthode + consigne · diagnostic</option>
        </DesignSystemSelect>
      </label>
      {grouping === 'method' && <label>Famille de méthodes
        <DesignSystemSelect value={family} onChange={(event) => {
          setFamily(event.currentTarget.value as typeof family); setPicked(null); setFocus('');
        }}>
          <option value="grading">Notation des schémas</option>
          <option value="graph">Extraction du graphe</option>
        </DesignSystemSelect>
      </label>}
      <label>Priorité du classement
        <DesignSystemSelect value={preset} onChange={(event) => {
          const value = event.currentTarget.value as typeof preset;
          if (value !== 'custom') setWeights({ ...RADAR_PRESETS[value] });
          setPreset(value);
        }}>
          <option value="scientific">Précision scientifique</option>
          <option value="balanced">Équilibré</option>
          <option value="throughput">Efficacité</option>
          <option value="custom">Mes pondérations</option>
        </DesignSystemSelect>
      </label>
    </div>
    <div className="diagram-radar-layout">
      <div className="diagram-radar-visual">
        {ranked.length ? <>
          <RadarPlot candidates={selected} onAxis={setAxis} />
          <div className="diagram-radar-legend" role="group" aria-label="Candidats affichés sur le radar">
            {ranked.map((candidate) => {
              const ix = selected.findIndex((c) => c.id === candidate.id);
              return <label key={candidate.id} className="diagram-radar-legend-item">
                <input type="checkbox" checked={ix >= 0} disabled={ix === -1 && selected.length >= 4}
                  onChange={() => toggle(candidate.id)} />
                <span aria-hidden="true" className="diagram-radar-legend-dot"
                  style={{ background: ix >= 0 ? PALETTE[ix] : 'var(--ds-color-border-strong)' }} />
                <span><strong>{candidate.name}</strong><small>{candidate.measured}/8 axes · {candidate.complete ? 'profil mesuré' : 'profil incomplet'}</small></span>
              </label>;
            })}
          </div>
          <p className="diagram-radar-footnote">Maximum quatre candidats superposés. Contour continu : huit axes disponibles ; pointillés : mesures partielles. Une répétition unique ne permet pas de mesurer la stabilité.</p>
        </> : <p className="diagram-radar-empty">Aucune campagne scientifique exploitable. Lancez une batterie automatique, puis revenez ici : les résultats enregistrés seront évalués sans nouvel appel IA.</p>}
      </div>
      <aside className="diagram-radar-inspector" aria-label="Explication des scores">
        <h4>Lire les huit caractéristiques</h4>
        <div className="diagram-radar-axis-buttons" role="group" aria-label="Axe à examiner">
          {RADAR_AXES.map((item) => <button type="button" key={item.id} aria-pressed={axis === item.id}
            onClick={() => setAxis(item.id)}>{item.label}
              {examined?.axes[item.id].value === null && <small>À mesurer</small>}
            </button>)}
        </div>
        <div className="diagram-radar-evidence">
          <h4>{RADAR_AXES.find((item) => item.id === axis)?.label}</h4>
          <p>{RADAR_AXES.find((item) => item.id === axis)?.detail}</p>
          <label>Afficher les preuves de
            <DesignSystemSelect value={examined?.id ?? ''} disabled={!ranked.length} onChange={(event) => setFocus(event.currentTarget.value)}>
              {ranked.length ? ranked.map((candidate) =>
                <option value={candidate.id} key={candidate.id}>{candidate.name}</option>) : <option value="">Aucun candidat</option>}
            </DesignSystemSelect>
          </label>
          {evidence && <><strong className="diagram-radar-axis-score">
            {evidence.value === null ? 'Non mesuré' : evidence.value.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' / 100'}
          </strong>
          <p>{evidence.reason}</p>
          {evidence.value === null && examined && <div className="diagram-radar-next-test">
            {missingPlan ? <>
              <strong>Compléter cet axe</strong>
              <p>{radarPlanDescription(missingPlan.steps)} sur le profil {examined.name}. Les schémas sont déjà intégrés.</p>
              <Button disabled={busy || !profileAvailable} onClick={() => onRunMissing(missingPlan)}>
                {missingPlan.steps.length > 1 ? 'Lancer les batteries manquantes' : 'Lancer le test manquant'}
              </Button>
              {!profileAvailable && <p role="status">Le profil d’origine n’existe plus dans les configurations IA. Recréez-le avant de relancer ce test.</p>}
              {busy && <p role="status">Une évaluation est déjà en cours. Terminez-la ou arrêtez-la avant d’en lancer une autre.</p>}
            </> : <p>Cette mesure ne peut pas être attribuée à cette méthode : la lecture indépendante du graphe et la notation sont deux algorithmes distincts. Passez en vue « Par profil IA » pour lancer les batteries adaptées.</p>}
          </div>}
          {evidence.evidence.map((source, index) =>
            <div key={source.reportId + index} className="diagram-radar-source">
              <strong>{source.detail}</strong>
              {source.total > 0 && <span>{source.observed.toLocaleString('fr-FR')} / {source.total.toLocaleString('fr-FR')}</span>}
              <small>{dateLabel(source.createdAt)} · {source.protocol}</small>
              <Button variant="secondary" onClick={() => onOpenReport(source.reportId)}>Consulter la campagne</Button>
            </div>)}</>}
        </div>
      </aside>
    </div>
    <section className="diagram-radar-ranking" aria-label="Classement des candidats">
      <div className="diagram-radar-ranking-heading"><div><h4>Classement et couverture des tests</h4>
        <p>{grouping === 'profile'
          ? 'Le classement global exige huit axes mesurés : aucun score inventé sur une batterie manquante.'
          : 'Classement exploratoire uniquement sur les mêmes axes disponibles pour toutes les méthodes sélectionnées, jamais un score global sur huit.'}</p></div>
        <strong>{eligible.length} candidat(s) classable(s){partial ? ' · ' + partial.weightedAxes.length + ' axes communs' : ''}</strong></div>
      <div className="pilot-evaluation-table-scroll"><table className="pilot-evaluation-table">
        <thead><tr><th>Rang</th><th>Profil ou méthode</th><th>Score pondéré</th><th>Axes disponibles</th><th>Dernière campagne</th></tr></thead>
        <tbody>{ranked.map((candidate) => <tr key={candidate.id}>
          <td>{!eligible.some((c) => c.id === candidate.id) ? '—' : eligible.findIndex((c) => c.id === candidate.id) + 1}</td>
          <th scope="row">{candidate.name}<small className="diagram-radar-model-list">{candidate.models.join(' · ') || 'Modèle non précisé'}</small></th>
          <td><strong>{(() => {
            const score = grouping === 'method' ? partial?.rows.find((row) => row.id === candidate.id)?.score ?? null : candidate.weightedScore;
            return score === null ? 'Non classé' : score.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + '/100' + (grouping === 'method' ? ' · partiel' : '');
          })()}</strong></td>
          <td>{candidate.measured} / 8</td><td>{dateLabel(candidate.updatedAt)}</td>
        </tr>)}</tbody>
      </table></div>
      {grouping === 'profile' && ranked.some((item) => item.methods.length > 1) &&
        <p className="diagram-radar-footnote">Certains profils utilisent plusieurs méthodes ou variantes de consigne. Leurs observations sont agrégées par attendu, sans moyenner les pourcentages. Passez en vue « profil + méthode » pour isoler les stratégies ; les axes absents ne sont pas reconstitués à partir d’un autre parcours.</p>}
      {grouping === 'method' &&
        <p className="diagram-radar-footnote">Le protocole de graphe indépendant utilise une méthode distincte. Il reste séparé des méthodes de notation : aucune mesure de graphe n’est attribuée artificiellement à une méthode qui ne l’a pas exécuté. Un classement partiel exige au moins quatre axes communs et deux candidats.</p>}
    </section>
    <details className="diagram-radar-weights">
      <summary>Pondérations et méthode de calcul</summary>
      <p>Réglez chaque axe de 0 à 5. Un axe à poids zéro reste affiché, mais ne participe pas au classement. Toute modification est enregistrée localement sur cet appareil.</p>
      <div className="diagram-radar-weight-grid">
        {RADAR_AXES.map((item) => <label key={item.id}>
          <span>{item.label}</span>
          <input type="range" min={0} max={5} step={1} value={weights[item.id]}
            aria-label={'Poids : ' + item.label}
            onChange={(event) => {
              const n = Number(event.currentTarget.value);
              const next = { ...weights, [item.id]: n };
              if (validRadarWeights(next)) { setWeights(next); setPreset('custom'); }
            }} />
          <strong>{weights[item.id]}</strong>
        </label>)}
      </div>
      <Button variant="secondary" onClick={() => { setWeights({ ...RADAR_PRESETS.scientific }); setPreset('scientific'); }}>Rétablir les pondérations scientifiques</Button>
      <p className="diagram-radar-footnote">Score global = somme des scores disponibles × poids / somme des poids, uniquement si les 8 axes existent. Graphisme = exactitude A/B/C ; flèches = justesse D/E ; biologie = mutations détectées sous témoin vérifié ; relations = moitié mutations détectées, moitié relations correctes préservées ; robustesse = absence de faux rejets et de faux positifs ; stabilité = réponses déterminées identiques après répétitions ; couverture = réponses déterminées / attendus ; performance = 100 ÷ (1 + temps moyen / 60 s). Les références sont synthétiques et provisoires. Ces scores ne sont ni des probabilités calibrées ni une validation pédagogique.</p>
    </details>
  </section>;
}
