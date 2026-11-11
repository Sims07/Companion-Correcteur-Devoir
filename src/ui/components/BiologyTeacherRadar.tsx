import { useMemo, useState } from 'react';
import { aiModelRoles, correctionModelFor, type AiModelProfile } from '../../domain/aiModelProfiles.ts';
import {
  BIOLOGY_RADAR_AXES, buildBiologyRadar, type BiologyCorrectionProtocol,
  type BiologyRadarCandidate, type BiologyRadarObservation,
} from '../../domain/biologyTeacherRadar.ts';
import './BiologyTeacherRadar.css';

const PROTOCOL_NAMES: Record<BiologyCorrectionProtocol, string> = {
  contract: 'Contrat par question', standard: 'Barème standard', pilot: 'Pilote initial',
};

function RadarPlot({ candidate }: { candidate: BiologyRadarCandidate }) {
  const vertex = (index: number, value: number) => {
    const angle = 2 * Math.PI * index / BIOLOGY_RADAR_AXES.length - Math.PI / 2;
    return [260 + 112 * value * Math.cos(angle), 157 + 112 * value * Math.sin(angle)];
  };
  const polygon = (values: number[]) => values.map((value, index) => vertex(index, value).join(',')).join(' ');
  return <svg viewBox="0 0 520 330" role="img" className="biology-radar-plot"
    aria-label={'Radar de fidélité biologique pour ' + candidate.name + ' ; ' + candidate.measured + ' axes sur 5'}>
    {[0.25, 0.5, 0.75, 1].map((level) =>
      <polygon key={level} points={polygon(BIOLOGY_RADAR_AXES.map(() => level))}
        fill="none" stroke="currentColor" strokeOpacity=".17" />)}
    {BIOLOGY_RADAR_AXES.map((axis, i) => {
      const [x, y] = vertex(i, 1);
      const [lx, ly] = vertex(i, 1.3);
      return <g key={axis.id}>
        <line x1="260" y1="157" x2={x} y2={y} stroke="currentColor" strokeOpacity=".17" />
        <text x={lx} y={ly} fill="currentColor" textAnchor={i === 0 ? 'middle' : i < 3 ? 'start' : 'end'}
          fontSize="12">{['Note professeur', 'Barème', 'Bonnes réponses', 'Erreurs', 'Cas pièges'][i]}</text>
      </g>;
    })}
    <polygon points={polygon(BIOLOGY_RADAR_AXES.map((axis) => (candidate.axes[axis.id] ?? 0) / 100))}
      fill="var(--ds-color-brand-100)" fillOpacity=".75" stroke="var(--ds-color-brand-700)" strokeWidth="2.5"
      strokeLinejoin="round" />
    {BIOLOGY_RADAR_AXES.map((axis, i) => {
      const value = candidate.axes[axis.id];
      if (value === null) return null;
      const [x, y] = vertex(i, value / 100);
      return <circle key={axis.id} cx={x} cy={y} r="4" fill="var(--ds-color-brand-700)" />;
    })}
  </svg>;
}

export function BiologyTeacherRadar({ history, profiles, busy, onEvaluate, onShowTests }: {
  history: readonly BiologyRadarObservation[];
  profiles: readonly AiModelProfile[];
  busy: boolean;
  onEvaluate: (profileId: string) => void;
  onShowTests: (scenario: 'contracts' | 'repeatability' | 'copies') => void;
}) {
  const [protocol, setProtocol] = useState<BiologyCorrectionProtocol>('contract');
  const [selectedId, setSelectedId] = useState('');
  const measured = useMemo(() => buildBiologyRadar(history, protocol), [history, protocol]);
  const configured = profiles.map((profile) => {
    const method = profile.configuration.correctionMethod;
    const model = correctionModelFor(method, aiModelRoles(profile.configuration));
    const provider = profile.configuration.apiCompatible ? 'openai-compatible' : 'ollama';
    return { profileId: profile.id, model, provider, method,
      id: [provider, method, model].join('::') };
  }).filter((item) => item.model.trim().length > 0 && item.method !== 'visual-decision');
  const candidates = [...measured];
  for (const item of configured) if (!candidates.some((candidate) => candidate.id === item.id)) {
    candidates.push({
      id: item.id, name: item.model, provider: item.provider, method: item.method,
      protocol, axes: { grade: null, rubric: null, positives: null, negatives: null, traps: null },
      measured: 0, score: null, partialScore: null, gradeDifference: null, observations: [],
    });
  }
  const selected = candidates.find((item) => item.id === selectedId) ?? candidates[0];
  const matchingProfile = configured.find((item) => item.id === selected?.id);
  const available = measured.filter((item) => item.score !== null);
  const missing = BIOLOGY_RADAR_AXES.filter((axis) => selected?.axes[axis.id] === null);
  const scores = selected?.observations ?? [];
  return <section className="biology-radar-workspace" aria-label="Radar de correction biologique">
    <div className="biology-radar-overview">
      <div className="biology-radar-pickers">
        <label>Choisir un LLM
          <select aria-label="Choisir un LLM biologique" value={selected?.id ?? ''} onChange={(event) => setSelectedId(event.target.value)}>
            {!candidates.length && <option value="">Aucun modèle configuré ou testé</option>}
            {candidates.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.method === 'decision' ? 'Décisionnel' : 'Génératif'}{item.provider === 'openai-compatible' ? ' · API' : ''}</option>)}
          </select>
        </label>
        <label>Protocole de correction
          <select aria-label="Protocole du radar biologique" value={protocol} onChange={(event) => { setProtocol(event.target.value as BiologyCorrectionProtocol); setSelectedId(''); }}>
            {Object.entries(PROTOCOL_NAMES).map(([id, name]) => <option value={id} key={id}>{name}</option>)}
          </select>
        </label>
      </div>
      {selected ? <>
        <div className="biology-radar-headline" aria-label="Résultat biologique du LLM">
          <div className="biology-radar-grade">
            <span>{selected.score === null ? 'Indice partiel de fidélité' : 'Fidélité à la correction du professeur'}</span>
            <strong>{selected.score ?? selected.partialScore ?? '—'} <small>/ 100</small></strong>
            <small>{selected.score === null
              ? 'Score global non disponible tant que les 5 axes ne sont pas mesurés.'
              : 'Score pondéré : note 40 %, barème 25 %, bonnes réponses 15 %, erreurs 15 %, pièges 5 %.'}</small>
          </div>
          <div className="biology-radar-grade-meta">
            <strong>{selected.gradeDifference === null ? '—' : selected.gradeDifference.toLocaleString('fr-FR') + ' pt'}</strong>
            <span>Écart moyen de note avec le professeur, sur 10</span>
            <strong>{selected.measured} / 5</strong>
            <span>Caractéristiques mesurées</span>
          </div>
        </div>
        <div className="biology-radar-actions">
          <button type="button" className="primary-button" disabled={busy || !matchingProfile || protocol === 'pilot'}
            onClick={() => { if (matchingProfile) onEvaluate(matchingProfile.profileId); }}>Évaluer le modèle</button>
          <span>{protocol === 'pilot' ? 'Pour le pilote initial, utilisez les tests Vision et analyse.'
            : matchingProfile ? 'Lance automatiquement les cas A/B/C puis les pièges D/E/F/G pour ce modèle.'
              : 'Enregistrez une configuration IA avec ce modèle pour lancer les batteries.'}</span>
        </div>
      </> : <p>Aucune configuration disponible. Ajoutez un LLM dans la gestion des configurations IA.</p>}
    </div>
    {selected && <>
      <div className="biology-radar-layout">
        <div className="biology-radar-visual">
          <RadarPlot candidate={selected} />
          <p>Une caractéristique absente n’est ni une erreur ni un zéro : le radar reste partiel tant que sa batterie n’a pas été validée.</p>
        </div>
        <div className="biology-radar-details">
          <h3>Accord avec la correction de référence</h3>
          {BIOLOGY_RADAR_AXES.map((axis) => <div className="biology-radar-axis" key={axis.id}>
            <div><strong>{axis.label}</strong><strong>{selected.axes[axis.id] === null ? 'Non mesuré' : selected.axes[axis.id] + ' / 100'}</strong></div>
            <progress max="100" value={selected.axes[axis.id] ?? 0} aria-label={axis.label} />
            <small>{axis.detail}</small>
          </div>)}
          {missing.length > 0 && <div className="biology-radar-missing">
            <strong>Tests à compléter</strong>
            <p>{missing.map((axis) => axis.label).join(' · ')}</p>
            <button type="button" className="secondary-button" onClick={() => onShowTests(
              missing.length === 1 && missing[0]?.id === 'traps' ? 'repeatability' : protocol === 'pilot' ? 'copies' : 'contracts',
            )}>Voir les tests biologiques</button>
          </div>}
        </div>
      </div>
      <section className="biology-radar-comparison" aria-label="Comparaison avec les notes du professeur">
        <h3>Copies de référence</h3>
        <div className="pilot-evaluation-table-scroll"><table className="pilot-evaluation-table">
          <thead><tr><th>Copie</th><th>Professeur</th><th>LLM</th><th>Décisions correctes</th></tr></thead>
          <tbody>{['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((caseId) => {
            const item = scores.find((observation) => observation.caseId === caseId);
            return <tr key={caseId}><th scope="row">{caseId}</th>
              <td>{item ? item.referenceScore + '/10' : '—'}</td>
              <td>{item?.score !== null && item?.score !== undefined ? item.score + '/10' : '—'}</td>
              <td>{item ? item.decisions.filter((decision) => decision.awarded !== null && decision.awarded === decision.expected).length + '/10' : '—'}</td>
            </tr>;
          })}</tbody>
        </table></div>
        <p>Références synthétiques établies avec un barème enseignant ; ce classement devra être confirmé sur des copies réelles annotées. Une note totale juste ne suffit pas si les points sont attribués aux mauvais critères.</p>
      </section>
    </>}
    <section className="biology-radar-comparison" aria-label="Classement de correction biologique">
      <h3>Classement des LLM</h3>
      {available.length ? <div className="pilot-evaluation-table-scroll"><table className="pilot-evaluation-table">
        <thead><tr><th>Rang</th><th>LLM</th><th>Fidélité / 100</th><th>Écart moyen</th></tr></thead>
        <tbody>{available.map((item, index) => <tr key={item.id}>
          <th scope="row">{index + 1}</th><td>{item.name} · {item.method}</td>
          <td>{item.score}</td><td>{item.gradeDifference} pt / 10</td>
        </tr>)}</tbody>
      </table></div> : <p>Aucun classement définitif : il faut les copies A/B/C et les quatre cas pièges pour chaque modèle.</p>}
    </section>
  </section>;
}
