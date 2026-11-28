import { DesignSystemSelect } from '../../../shared/ui/components/DesignSystemSelect.tsx';
import { chooseCriterionLevel, concurrencyProfileKey } from '../../../shared/domain/concurrencyCalibration.ts';
import { useEffect, useRef, useState } from 'react';
import { criterionLevels, type CriterionLevel } from '../../../shared/domain/criterionConcurrency.ts';
import type { AiModelProfile } from '../../../shared/domain/aiModelProfiles.ts';
import { downloadJson } from '../../../shared/ui/downloadJson.ts';
import type { GradingProvider, OllamaSettings } from '../../../correction/api/index.ts';
import type { ImageInput } from '../../../shared/domain/imageInput.ts';
import { SCIENTIFIC_DIAGRAM_FIXTURES } from '../../domain/scientificDiagramFixtures.ts';
import { measureDiagramConcurrency, orderedDiagnosticVariants, diagnosticVariants, type DiagramConcurrencySample } from '../../application/diagramConcurrencyBenchmark.ts';
import { prepareBundledDiagramFile } from './ScientificDiagramProtocolPanel.tsx';

interface Props {
  visible: boolean; busy: boolean; setRunning: (active: boolean) => void; profiles: AiModelProfile[];
  prepare: (files: File[]) => Promise<ImageInput[]>;
  provider: (settings: OllamaSettings) => GradingProvider;
}

export function DiagramConcurrencyPanel({ visible, busy, profiles, prepare, provider, setRunning }: Props) {
  const [selected, select] = useState('');
  const [diagnosticMode, setDiagnosticMode] = useState(false);
  const [repetitions, setRepetitions] = useState(3);
  const [engine, setEngine] = useState('');
  const [runMetadata, setRunMetadata] = useState({ engine: '', repetitions: 3 });
  const [limit, setLimit] = useState<CriterionLevel>(4);
  const [status, setStatus] = useState('');
  const [started, setStarted] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [samples, setSamples] = useState<DiagramConcurrencySample[]>([]);
  const [model, setModel] = useState('');
  const [profileKey, setProfileKey] = useState('');
  const [memory, setMemory] = useState<Record<number, string>>({});
  const controller = useRef<AbortController | null>(null);
  const eligible = profiles.filter(p => p.configuration.correctionMethod === 'generative' && !p.configuration.hybridVisualLogprobs && p.configuration.analysisModel);
  const profile = eligible.find(p => p.id === selected) ?? eligible[0];
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (started === null) return;
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [started]);

  async function run() {
    if (!profile || busy || controller.current) return;
    const task = new AbortController();
    controller.current = task;
    const config = profile.configuration;
    const groups = !diagnosticMode && limit === 8 ? 8 : 4;
    const settings = { ...config, criterionConcurrency: undefined, thinking: config.analysisThinking, thinkingLevel: config.analysisThinking ? config.analysisReasoningEffort : undefined,
      diagnosticStrategy: 'single' as const, criterionByCriterion: true };
    setRunning(true); setStarted(Date.now()); setSeconds(0); setStatus('Préparation des images de référence…');
    setSamples([]); setMemory({}); setModel(config.analysisModel);
    setRunMetadata({ engine: engine.trim(), repetitions });
    const rows: DiagramConcurrencySample[] = [];
    try {
      setProfileKey(concurrencyProfileKey(config, groups));
      const cases = [];
      for (const fixture of SCIENTIFIC_DIAGRAM_FIXTURES.filter(f => ['A', 'B', 'C'].includes(f.id))) {
        task.signal.throwIfAborted();
        cases.push({ fixture, images: await prepare([await prepareBundledDiagramFile(fixture.id)]) });
      }
      setStatus('Préchauffage du modèle…');
      const warmup = await measureDiagramConcurrency(cases[0]!.fixture, cases[0]!.images, 1, () => provider(settings), task.signal, () => {}, groups);
      if (warmup.errors.length) throw new Error(warmup.errors.join(' · '));
      if (diagnosticMode) {
        for (let repetition = 1; repetition <= repetitions; repetition++) {
          for (const [caseIndex, { fixture, images }] of cases.entries()) {
            for (const variant of orderedDiagnosticVariants(repetition, caseIndex)) {
              task.signal.throwIfAborted();
              const progress = (n: number) => setStatus('Répétition ' + repetition + '/' + repetitions + ' · Cas ' + fixture.id + ' · ' + variant.id + ' · ' + n + '/4 groupes terminés');
              progress(0);
              const row = await measureDiagramConcurrency(fixture, images, variant.level, () => provider(settings), task.signal, progress, 4, { variant, repetition });
              task.signal.throwIfAborted();
              rows.push(row); setSamples([...rows]);
            }
          }
        }
        setStatus('Diagnostic terminé. Aucun réglage automatique modifié.');
        return;
      }
      for (const level of criterionLevels.filter(value => value <= limit)) {
        for (const { fixture, images } of cases) {
          const progress = (n: number) => setStatus('Cas ' + fixture.id + ' · concurrence ' + level + ' · ' + n + '/' + groups + ' groupes terminés');
          progress(0);
          const row = await measureDiagramConcurrency(fixture, images, level, () => provider(settings), task.signal, progress, groups);
          task.signal.throwIfAborted();
          rows.push(row); setSamples([...rows]);
        }
      }
      const recommendation = chooseCriterionLevel(rows);
      try {
        localStorage.setItem(concurrencyProfileKey(config, groups), String(recommendation));
        setStatus('Comparaison terminée. Mode automatique pour ce profil · ' + recommendation + ' critère(s) simultané(s).');
      } catch { setStatus('Comparaison terminée. Enregistrement local du niveau automatique indisponible.'); }
    } catch (error) {
      setStatus(task.signal.aborted ? 'Comparaison arrêtée.' : 'Échec de la comparaison · ' + String(error));
    } finally { controller.current = null; setStarted(null); setRunning(false); }
  }
  if (!visible) return null;
  return <section className="panel" aria-label="Parallélisme des schémas">
    <h3>Comparer la concurrence sur les schémas</h3>
    <p>Cas A, B et C · 19 sous-critères par copie. {!diagnosticMode && limit === 8 ? 'Les 19 sous-critères sont répartis en huit groupes identiques à tous les niveaux, y compris en séquentiel.' : 'Chaque niveau traite les quatre critères du barème de référence.'}</p>
    <label>Profil génératif <DesignSystemSelect value={profile?.id ?? ''} disabled={started !== null} onChange={e => select(e.target.value)}>
      {eligible.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</DesignSystemSelect></label>
    <label>Campagne <DesignSystemSelect value={diagnosticMode ? 'diagnostic' : 'calibration'} disabled={started !== null} onChange={e => { setDiagnosticMode(e.target.value === 'diagnostic'); setSamples([]); setStatus(''); }}>
      <option value="calibration">Comparer les niveaux (calibration)</option>
      <option value="diagnostic">Diagnostic qualité du parallélisme</option>
    </DesignSystemSelect></label>
    {!diagnosticMode && <p>Le niveau 1 conserve la conversation séquentielle ; les niveaux parallèles renvoient les images à chaque groupe, sans contexte partagé. Les anciennes calibrations ne sont pas réutilisées.</p>}
    {diagnosticMode ? <>
      <p>Diagnostic uniquement : mêmes images, barème et profil. Aucun changement du niveau automatique. Ordre des variantes alterné.</p>
      <p>{diagnosticVariants.map(v => v.id + ' : ' + v.label).join(' · ')}</p>
      <label>Répétitions par cas et variante <DesignSystemSelect value={repetitions} disabled={started !== null} onChange={e => setRepetitions(Number(e.target.value))}>
        <option value={1}>1 (exploratoire)</option><option value={3}>3</option><option value={5}>5</option>
      </DesignSystemSelect></label>
      <label>Moteur d’exécution (déclaration manuelle) <input value={engine} disabled={started !== null} onChange={e => setEngine(e.target.value)} placeholder="Ex. oMLX, version…" /></label>
    </> : <label>Concurrence maximale <DesignSystemSelect value={limit} disabled={started !== null} onChange={e => setLimit(Number(e.target.value) as CriterionLevel)}>
      {[2, 4, 8].map(n => <option key={n}>{n}</option>)}</DesignSystemSelect></label>}
    <button className="primary-button" disabled={!profile || busy || started !== null} onClick={() => void run()}>{diagnosticMode ? 'Lancer le diagnostic qualité' : 'Comparer les niveaux de concurrence'}</button>
    {started !== null && <button onClick={() => controller.current?.abort()}>Arrêter la comparaison</button>}
    <p role="status">{status} {started !== null && seconds + ' s'}</p>
    {!!samples.length && <><h4>{model}</h4><table><thead><tr>{[...(diagnosticMode ? ['Variante / répétition'] : []), 'Cas', 'Plafond / pic client', 'Durée', 'Tokens/s cumulés', 'Décisions exactes / 19', 'Erreurs'].map(h => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{samples.map(s => <tr key={s.caseId + ':' + (s.diagnostic?.variant ?? s.level) + ':' + (s.diagnostic?.repetition ?? 0)}>{diagnosticMode && <td>{s.diagnostic?.variant} / {s.diagnostic?.repetition}</td>}<td>{s.caseId}</td><td>{s.level} / {s.peak}</td><td>{(s.durationMs / 1000).toFixed(1)} s</td>
      <td>{s.tokensPerSecond?.toFixed(1) ?? 'Indisponible'}</td><td>{s.exact} ({s.measured} évaluées)</td><td>{s.errors.join(' · ') || '0'}</td></tr>)}</tbody></table>
      {!diagnosticMode && <><p>Pic mémoire du processus modèle, à relever sur le serveur pendant chaque série.</p>
      {Array.from(new Set(samples.map(s => s.level))).map(n => <label key={n}>Niveau {n} (Go) <input type="number" min="0" step="any" value={memory[n] ?? ''} onChange={e => setMemory({ ...memory, [n]: e.target.value })}/></label>)}
      </>}
      <button onClick={() => downloadJson(diagnosticMode ? { schemaVersion: 1, model, profileKey, engine: runMetadata.engine || null, repetitions: runMetadata.repetitions, complete: samples.length === runMetadata.repetitions * 15, samples } : { schemaVersion: 2, model, profileKey, parallelContextMode: 'independent', sequentialContextMode: 'cumulative', samples, peakMemoryGB: memory }, diagnosticMode ? 'companion-parallelisme-diagnostic.json' : 'companion-parallelisme.json')}>Exporter la comparaison JSON</button></>}
  </section>;
}
