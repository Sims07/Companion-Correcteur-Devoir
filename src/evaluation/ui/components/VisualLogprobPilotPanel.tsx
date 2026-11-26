import { useEffect, useRef, useState } from 'react';
import type { AiModelProfile } from '../../../shared/domain/aiModelProfiles.ts';
import type { ImageInput } from '../../../shared/domain/imageInput.ts';
import { getRubricSubcriteria } from '../../../correction/api/index.ts';
import { Button } from '../../../shared/ui/design-system/index.ts';
import { downloadJson } from '../../../shared/ui/downloadJson.ts';
import { diagramTargetKey } from '../../domain/scientificDiagramProtocol.ts';
import { SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC, SCIENTIFIC_DIAGRAM_FIXTURES,
  type ScientificDiagramFixtureId } from '../../domain/scientificDiagramFixtures.ts';
import { logprobChoices, summarizeLogprobRows, type LogprobPilotRow } from '../../domain/visualLogprobDecision.ts';
import { localLogprobEndpoint, runVisualLogprobPilot, type LogprobPilotCase } from '../../application/visualLogprobPilot.ts';

const labels = { present: 'Présent', absent: 'Absent', partial: 'Partiel', undetermined: 'Indéterminable' };
const targets = SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.criteria.flatMap(criterion =>
  getRubricSubcriteria(criterion).map(sub => ({
    key: diagramTargetKey(criterion.id, sub.id), criterionTitle: criterion.title,
    criterionDescription: criterion.description ?? '', title: sub.title, description: sub.description ?? '',
  })));
const suites = { pointers: ['D', 'E'], all: ['A', 'B', 'C', 'D', 'E'] } as const;

export function VisualLogprobPilotPanel({ profiles, busy, prepareCase, onBusyChange }: {
  profiles: readonly AiModelProfile[];
  busy: boolean;
  prepareCase: (id: ScientificDiagramFixtureId) => Promise<ImageInput[]>;
  onBusyChange: (running: boolean) => void;
}) {
  const available = profiles.filter(profile => localLogprobEndpoint(profile.configuration));
  const [id, setId] = useState('');
  const selected = available.find(profile => profile.id === id) ?? available[0];
  const [suite, setSuite] = useState<keyof typeof suites>('pointers');
  const [rows, setRows] = useState<LogprobPilotRow[]>([]);
  const [report, setReport] = useState<{ model: string; cases: readonly string[]; planned: number } | null>(null);
  const [message, setMessage] = useState('');
  const [running, setRunning] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const summary = summarizeLogprobRows(rows);
  const planned = targets.length * suites[suite].length;

  async function start() {
    if (!selected || busy || controller.current) return;
    const run = new AbortController();
    controller.current = run;
    setRunning(true);
    onBusyChange(true);
    setRows([]);
    const caseIds = suites[suite];
    setReport({ model: selected.configuration.analysisModel, cases: caseIds, planned });
    setMessage('Préparation locale des images…');
    try {
      const cases: LogprobPilotCase[] = [];
      for (const caseId of caseIds) {
        run.signal.throwIfAborted();
        const fixture = SCIENTIFIC_DIAGRAM_FIXTURES.find(item => item.id === caseId);
        if (!fixture) throw new Error('Cas de référence manquant');
        const images = await prepareCase(caseId);
        cases.push({ id: caseId, images, context: SCIENTIFIC_DIAGRAM_FIXTURE_RUBRIC.title, gold: fixture.gold });
      }
      setMessage('Décisions indépendantes en cours…');
      await runVisualLogprobPilot(selected.configuration, cases, targets, run.signal,
        row => setRows(previous => [...previous, row]));
      setMessage('Essai terminé — résultats expérimentaux, aucune note attribuée.');
    } catch (error) {
      setMessage(run.signal.aborted ? 'Essai arrêté — résultats partiels conservés.' :
        error instanceof Error && error.message.startsWith('Essai suspendu') ? error.message :
          'Impossible de préparer ou lancer cet essai.');
    } finally {
      controller.current = null;
      setRunning(false);
      onBusyChange(false);
    }
  }

  return <details className="diagram-lab-compare">
    <summary>Décisions visuelles par logprobs · expérimental</summary>
    <p>Tout modèle génératif multimodal compatible Responses local peut être testé, sans OCR ni modèle décisionnel dédié.
      Un appel indépendant par attendu, Thinking désactivé si le profil le permet.
      Les probabilités de tokens ne sont pas une confiance pédagogique calibrée.</p>
    {selected ? <label>Profil à tester <select value={selected.id} disabled={running || busy}
      onChange={event => setId(event.currentTarget.value)}>
      {available.map(profile => <option key={profile.id} value={profile.id}>{profile.name} · {profile.configuration.analysisModel}</option>)}
    </select></label> : <p>Sélectionnez un profil génératif utilisant un serveur local compatible Responses.</p>}
    <label>Cas synthétiques <select value={suite} disabled={running || busy}
      onChange={event => setSuite(event.currentTarget.value === 'all' ? 'all' : 'pointers')}>
      <option value="pointers">D/E — traits de rappel</option>
      <option value="all">A/B/C/D/E — tous les schémas</option>
    </select></label>
    <p>{planned} requêtes prévues. Pour comparer au génératif, lancez aussi le protocole « Image → modèle génératif » avec ce même profil et les mêmes cas.</p>
    <Button disabled={!selected || busy || running} onClick={() => { void start(); }}>Tester les logprobs</Button>
    {running && <Button variant="secondary" onClick={() => controller.current?.abort()}>Arrêter les logprobs</Button>}
    <p role="status">{message}{report && ` · ${rows.length}/${report.planned}`}</p>
    {report && rows.length > 0 && <>
      <p><strong>{report.model}</strong> · {summary.correct}/{summary.attempted} verdicts conformes aux références provisoires ;
        {' '}{summary.resolved} résolus, {summary.abstentions} abstentions, {summary.unavailable} indisponibles ;
        {' '}{summary.falsePositives} faux positifs « présent », {summary.falseNegatives} faux négatifs « absent ».
        Temps cumulé des appels : {(summary.durationMs / 1000).toFixed(1)} s.</p>
      <Button variant="secondary" onClick={() => downloadJson({
        protocol: 'visual-logprob-pilot-v1', ...report, summary, rows,
        temperature: 1, topP: 1, topLogprobs: 20, maxOutputTokens: 1,
      }, 'companion-logprobs.json')}>Exporter les décisions JSON</Button>
      <div className="responses-compatibility-results">
        <table><caption>Probabilités brutes observées (— : non observée)</caption>
          <thead><tr><th>Cas</th><th>Attendu</th><th>Référence</th><th>Token produit</th><th>Décision</th>
            {logprobChoices.map(key => <th key={key}>{labels[key]}</th>)}<th>Masse manquante</th><th>Durée</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.caseId + row.targetKey}>
            <td>{row.caseId}</td><td>{targets.find(target => target.key === row.targetKey)?.title ?? row.targetKey}</td>
            <td>{labels[row.expected]}</td><td>{row.sampled ? labels[row.sampled] : '—'}</td>
            <td title={row.reason}>{row.verdict ? labels[row.verdict] : row.status === 'unavailable' ? 'Indisponible' : 'À revoir'}</td>
            {logprobChoices.map(key => <td key={key}>{row.probabilities[key] === null ? '—' : (row.probabilities[key] * 100).toFixed(1) + '%'}</td>)}
            <td>{row.unobservedMass === null ? '—' : (row.unobservedMass * 100).toFixed(1) + '%'}</td><td>{(row.durationMs / 1000).toFixed(2)} s</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </details>;
}
