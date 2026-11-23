import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AiModelProfile } from '../../../shared/domain/aiModelProfiles.ts';
import { Button } from '../../../shared/ui/design-system/index.ts';
import { downloadJson } from '../../../shared/ui/downloadJson.ts';
import { drawingPng, startVisualTrial, visualTrialHistory, visualTrialStore } from '../../application/controlledVisualTrialTask.ts';
import { visualCases, visualPromptVersion, type VisualCase } from '../../domain/controlledVisualTrial.ts';

export function ControlledVisualTrial({ profiles, busy }: { profiles: readonly AiModelProfile[]; busy:boolean }) {
  const [preview,setPreview] = useState<VisualCase | ''>('');
  const [id,setId] = useState('');
  const state = useSyncExternalStore(visualTrialStore.subscribe,visualTrialStore.snapshot,visualTrialStore.snapshot);
  const [now,setNow] = useState(Date.now);
  const running = state.status === 'running';
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()),1000);
    return () => window.clearInterval(timer);
  },[running]);
  const available = profiles.filter(p => p.configuration.analysisModel && /\/api\/v1\/chat\/?$/.test(p.configuration.endpoint.trim()));
  const selected = available.find(p => p.id === id) ?? available[0];
  const resolved = state.rows.filter(r => (r.reread ?? r.first).verdict === r.expected);
  const silent = state.rows.filter(r => !r.review && (r.reread ?? r.first).verdict !== r.expected);
  const changed = state.rows.filter(r => r.order === 2 && state.rows.some(other => other.order === 1 &&
    other.drawing === r.drawing && other.target === r.target && other.first.verdict !== r.first.verdict));
  return <details className="diagram-lab-compare"><summary>Essai contrôlé · titre et trait de rappel</summary>
    <p>Quatre dessins synthétiques sont lus deux fois, dans deux ordres différents. Chaque conversation reçoit une seule image.
      Une réponse indéterminée ou sans preuve déclenche une seule relecture dans la même conversation.</p>
    <label>Inspecter un dessin <select value={preview} onChange={e => setPreview(e.target.value as VisualCase | '')}>
      <option value="">Choisir un dessin</option>{visualCases.map(c => <option key={c}>{c}</option>)}</select></label>
    {preview && <img src={drawingPng(preview)} alt={'Dessin de contrôle · '+preview} style={{maxWidth:'100%'}} />}
    {available.length > 0 ? <label>Profil LM Studio pour cet essai <select value={selected?.id} disabled={running}
      onChange={e => setId(e.target.value)}>{available.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      : <p>Sélectionnez une configuration de test avec un modèle vision et l’URL du Chat natif LM Studio (/api/v1/chat).</p>}
    <Button disabled={!selected || busy || running} onClick={() => selected && void startVisualTrial(selected)}>Lancer les lectures contrôlées</Button>
    {running && <Button variant="secondary" onClick={visualTrialStore.stop}>Arrêter les lectures</Button>}
    {state.status !== 'idle' && <p role={state.status === 'failed' ? 'alert' : 'status'}>{state.profile} · {state.label} · {state.rows.length}/16 décisions
      {running && ' · ' + Math.max(0,Math.floor((now-state.started)/1000))+' s'}</p>}
    {state.storageError && <p role="alert">Sauvegarde locale impossible. Le résultat peut être exporté.</p>}
    {state.rows.length > 0 && <><p>{resolved.length}/{state.rows.length} conformes · {silent.length} erreurs sans alerte · {state.rows.filter(r => r.review).length} à vérifier
      {' · '}{changed.length} changements de verdict initial entre les deux ordres.</p>
      <details><summary>Examiner les preuves et les relectures</summary>
        <ul>{state.rows.map(r => <li key={r.drawing+r.order+r.target}>{r.drawing} · ordre {r.order} · {r.target} · attendu {r.expected}
          {' · '}lecture {r.first.verdict} ({r.first.preuve || 'preuve absente'})
          {r.reread && ' · relecture '+r.reread.verdict+' ('+(r.reread.preuve || 'preuve absente')+')'}
          {r.review && ' · À vérifier'}</li>)}</ul></details>
      <Button variant="secondary" onClick={() => downloadJson({...state, version:visualPromptVersion},'lectures-controlees-'+state.started+'.json')}>Exporter cet essai</Button></>}
    <details><summary>Essais enregistrés</summary>
      {visualTrialHistory().length === 0 ? <p>Aucun passage enregistré.</p> : <ul>{visualTrialHistory().map(item =>
        <li key={item.started}>{item.profile} · {new Date(item.started).toLocaleString('fr-FR')} · {item.rows.length}/16 décisions
          {' · '}{item.rows.filter(r => (r.reread ?? r.first).verdict === r.expected).length} conformes
          <Button variant="secondary" onClick={() => downloadJson({...item,version:visualPromptVersion},'lectures-controlees-'+item.started+'.json')}>Exporter</Button>
        </li>)}</ul>}
    </details>
  </details>;
}
