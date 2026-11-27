import { chooseCriterionLevel, concurrencyProfileKey } from '../../../shared/domain/concurrencyCalibration.ts';
import { useEffect, useRef, useState } from 'react';
import { criterionLevels, type CriterionLevel } from '../../../shared/domain/criterionConcurrency.ts';
import type { AiModelProfile } from '../../../shared/domain/aiModelProfiles.ts';
import { downloadJson } from '../../../shared/ui/downloadJson.ts';
import type { GradingProvider, OllamaSettings } from '../../../correction/api/index.ts';
import type { ImageInput } from '../../../shared/domain/imageInput.ts';
import { SCIENTIFIC_DIAGRAM_FIXTURES } from '../../domain/scientificDiagramFixtures.ts';
import { measureDiagramConcurrency, type DiagramConcurrencySample } from '../../application/diagramConcurrencyBenchmark.ts';
import { prepareBundledDiagramFile } from './ScientificDiagramProtocolPanel.tsx';

interface Props {
  visible: boolean; busy: boolean; setRunning: (active: boolean) => void; profiles: AiModelProfile[];
  prepare: (files: File[]) => Promise<ImageInput[]>;
  provider: (settings: OllamaSettings) => GradingProvider;
}

export function DiagramConcurrencyPanel({ visible, busy, profiles, prepare, provider, setRunning }: Props) {
  const [selected, select] = useState('');
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
    const settings = { ...config, criterionConcurrency: undefined, thinking: config.analysisThinking, thinkingLevel: config.analysisThinking ? config.analysisReasoningEffort : undefined,
      diagnosticStrategy: 'single' as const, criterionByCriterion: true };
    setRunning(true); setStarted(Date.now()); setSeconds(0); setStatus('Préparation des images de référence…');
    setSamples([]); setMemory({}); setModel(config.analysisModel);
    const rows: DiagramConcurrencySample[] = [];
    try {
      setProfileKey(concurrencyProfileKey(config));
      const cases = [];
      for (const fixture of SCIENTIFIC_DIAGRAM_FIXTURES.filter(f => ['A', 'B', 'C'].includes(f.id))) {
        task.signal.throwIfAborted();
        cases.push({ fixture, images: await prepare([await prepareBundledDiagramFile(fixture.id)]) });
      }
      setStatus('Préchauffage du modèle…');
      const warmup = await measureDiagramConcurrency(cases[0]!.fixture, cases[0]!.images, 1, () => provider(settings), task.signal, () => {});
      if (warmup.errors.length) throw new Error(warmup.errors.join(' · '));
      for (const level of criterionLevels.filter(value => value <= limit)) {
        for (const { fixture, images } of cases) {
          const progress = (n: number) => setStatus('Cas ' + fixture.id + ' · concurrence ' + level + ' · ' + n + '/4 critères terminés');
          progress(0);
          const row = await measureDiagramConcurrency(fixture, images, level, () => provider(settings), task.signal, progress);
          task.signal.throwIfAborted();
          rows.push(row); setSamples([...rows]);
        }
      }
      const recommendation = chooseCriterionLevel(rows);
      try {
        localStorage.setItem(concurrencyProfileKey(config), String(recommendation));
        setStatus('Comparaison terminée. Mode automatique pour ce profil · ' + recommendation + ' critère(s) simultané(s).');
      } catch { setStatus('Comparaison terminée. Enregistrement local du niveau automatique indisponible.'); }
    } catch (error) {
      setStatus(task.signal.aborted ? 'Comparaison arrêtée.' : 'Échec de la comparaison · ' + String(error));
    } finally { controller.current = null; setStarted(null); setRunning(false); }
  }
  if (!visible) return null;
  return <section className="panel" aria-label="Parallélisme des schémas">
    <h3>Comparer la concurrence sur les schémas</h3>
    <p>Cas A, B et C · 19 sous-critères par copie. Le barème comporte quatre critères indépendants. Un plafond de huit peut donc mobiliser quatre appels au maximum.</p>
    <label>Profil génératif <select value={profile?.id ?? ''} disabled={started !== null} onChange={e => select(e.target.value)}>
      {eligible.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label>Concurrence maximale <select value={limit} disabled={started !== null} onChange={e => setLimit(Number(e.target.value) as CriterionLevel)}>
      {[2, 4, 8].map(n => <option key={n}>{n}</option>)}</select></label>
    <button className="primary-button" disabled={!profile || busy || started !== null} onClick={() => void run()}>Comparer les niveaux de concurrence</button>
    {started !== null && <button onClick={() => controller.current?.abort()}>Arrêter la comparaison</button>}
    <p role="status">{status} {started !== null && seconds + ' s'}</p>
    {!!samples.length && <><h4>{model}</h4><table><thead><tr>{['Cas', 'Plafond / pic client', 'Durée', 'Tokens/s cumulés', 'Décisions exactes / 19', 'Erreurs'].map(h => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{samples.map(s => <tr key={s.caseId + s.level}><td>{s.caseId}</td><td>{s.level} / {s.peak}</td><td>{(s.durationMs / 1000).toFixed(1)} s</td>
      <td>{s.tokensPerSecond?.toFixed(1) ?? 'Indisponible'}</td><td>{s.exact} ({s.measured} évaluées)</td><td>{s.errors.join(' · ') || '0'}</td></tr>)}</tbody></table>
      <p>Pic mémoire du processus modèle, à relever sur le serveur pendant chaque série.</p>
      {Array.from(new Set(samples.map(s => s.level))).map(n => <label key={n}>Niveau {n} (Go) <input type="number" min="0" step="any" value={memory[n] ?? ''} onChange={e => setMemory({ ...memory, [n]: e.target.value })}/></label>)}
      <button onClick={() => downloadJson({ model, profileKey, samples, peakMemoryGB: memory }, 'companion-parallelisme.json')}>Exporter la comparaison JSON</button></>}
  </section>;
}
