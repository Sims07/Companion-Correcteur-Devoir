import { DEFAULT_ZOOM_BUDGET } from '../../../shared/domain/smartZoomBudget.ts';
import { responsesEndpoint } from '../../../shared/domain/lmStudioTransport.ts';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { AiModelConfiguration, AiModelProfile } from '../../../shared/domain/aiModelProfiles.ts';
import { sendLmStudioZoomDiagramTurn, type ZoomConversation } from '../../../shared/adapters/ai/lmStudioDiagramZoom.ts';
import type { ZoomEvidence, ZoomRegion } from '../../../shared/adapters/image/cropOriginalDiagram.ts';
import { inspectFraming, makeZoomWitness, targetRegion } from './zoomWitness.ts';

function frame(region: ZoomRegion, border: string): CSSProperties {
  return { position: 'absolute', boxSizing: 'border-box', border, pointerEvents: 'none',
    left: region.x * 100 + '%', top: region.y * 100 + '%',
    width: region.width * 100 + '%', height: region.height * 100 + '%' };
}

export function ZoomWitnessPanel({ profiles, current, visible, busy }: {
  profiles: readonly AiModelProfile[]; current: Pick<AiModelConfiguration, 'endpoint' | 'apiCompatible' | 'apiKey' | 'analysisModel' | 'analysisThinking' | 'analysisReasoningEffort' | 'omitReasoningParameter' | 'gradingOutputTokens' | 'analysisTemperature' | 'analysisTopP' | 'smartZoomBudget'>; visible: boolean; busy: boolean;
}) {
  const choices = [{ id: '', name: 'Réglages courants', configuration: current }, ...profiles]
    .map(p => ({ ...p, testEndpoint: p.configuration.apiCompatible && p.configuration.analysisModel
      ? responsesEndpoint(p.configuration.endpoint) : undefined }));
  const [id, choose] = useState<string | undefined>(undefined);
  const selected = choices.find(p => p.id === id) ?? choices.find(p => p.testEndpoint) ?? choices[0];
  const controller = useRef<AbortController | null>(null);
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [status, setStatus] = useState('');
  const [answer, setAnswer] = useState('');
  const [witness, setWitness] = useState<ReturnType<typeof makeZoomWitness>>();
  const [budgetOverride, setBudgetOverride] = useState<number | undefined>();
  const budget = budgetOverride ?? selected?.configuration.smartZoomBudget ?? DEFAULT_ZOOM_BUDGET;
  const [results, setResults] = useState<Array<{ model: string; budget: number; inspected: number; rejected: number; duration: number; verdict: string }>>([]);
  const [crops, setCrops] = useState<ZoomEvidence[]>([]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!running) return;
    const start = Date.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  async function run() {
    if (controller.current || !selected?.testEndpoint) return;
    const ac = new AbortController();
    controller.current = ac;
    setRunning(true); setSeconds(0); setCrops([]); setAnswer(''); setWitness(undefined);
    const c = selected.configuration;
    setStatus('En attente de ' + c.analysisModel);
    const startedAt = Date.now();
    const conversation: ZoomConversation = {};
    let verdict = 'Aucune réponse';
    let attempts = 0;
    let inspected = 0;
    try {
      const sheet = makeZoomWitness();
      setWitness(sheet);
      const response = await sendLmStudioZoomDiagramTurn(selected.testEndpoint, c.apiKey, conversation, {
        model: c.analysisModel, criterionLabel: 'Cadrage du noyau B', zoomBudget: budget,
        think: c.analysisThinking && (c.analysisReasoningEffort ?? 'medium'),
        omitReasoningParameter: c.omitReasoningParameter,
        options: { num_predict: c.gradingOutputTokens, temperature: c.analysisTemperature, top_p: c.analysisTopP },
        messages: [{ content: 'Utilise inspect_region pour cadrer au plus près le noyau entier de la cellule B et lire le code inscrit au centre. Réponds uniquement par les quatre chiffres lus.', images: [sheet.preview] }],
      }, [{ mimeType: 'image/png', base64: sheet.original.split(',')[1] }], { signal: ac.signal }, fetch,
      metadata => {
        if (metadata && typeof metadata === 'object' && 'smartZoom' in metadata) attempts++;
      }, evidence => {
        if (ac.signal.aborted) return;
        inspected++;
        setCrops(previous => [...previous, evidence]);
        setStatus('Zoom obtenu · attente de la lecture du modèle');
      });
      if (!response.ok) throw new Error('LM Studio a répondu HTTP ' + response.status);
      const result = await response.json();
      ac.signal.throwIfAborted();
      if (result.done_reason === 'length') throw new Error('Limite de génération atteinte pendant le test de zoom.');
      const finalAnswer = result.message.content.trim();
      if (!finalAnswer) throw new Error('LM Studio Responses n’a renvoyé aucune réponse finale pour le test de zoom.');
      setAnswer(finalAnswer);
      verdict = finalAnswer === sheet.code ? 'Correct' : 'Incorrect';
      setStatus(c.analysisModel + ' · ' + (inspected ? inspected + ' zoom(s) obtenu(s)' : attempts ? 'Demande de zoom rejetée' : 'Aucun appel de zoom'));
    } catch (error) {
      verdict = ac.signal.aborted ? 'Arrêté' : error instanceof Error ? error.message : 'Échec';
      setStatus(ac.signal.aborted ? 'Essai arrêté' : error instanceof Error ? error.message : 'Échec du test');
    } finally {
      setResults(previous => [{ model: c.analysisModel, budget, inspected, rejected: conversation.zoomRejections?.['Cadrage du noyau B'] ?? 0, duration: Math.round((Date.now() - startedAt) / 1000), verdict }, ...previous].slice(0, 20));
      controller.current = null;
      setRunning(false);
    }
  }

  return <section hidden={!visible} className="panel" aria-label="Test du zoom">
    <details><summary>Vérifier le zoom du modèle</summary>
      <p>Le modèle reçoit un aperçu de deux cellules et doit cadrer le noyau de B pour lire son code.</p>
      <label>Profil LM Studio <select value={selected?.id ?? ''} disabled={running || !choices.length}
        onChange={event => choose(event.target.value)}>{choices.map(p => <option key={p.id} value={p.id}>{p.name} · {p.configuration.analysisModel || 'Modèle non renseigné'}{p.testEndpoint ? '' : ' · Non compatible'}</option>)}</select></label>
      {selected?.testEndpoint ? <p className="hint">Test via Responses : {selected.testEndpoint}. Le profil enregistré reste inchangé. Le serveur et le modèle doivent accepter les outils et les images.</p> : <p>Ce profil ne fournit pas une adresse compatible Responses et un modèle d’analyse. Configurez un profil LM Studio.</p>}
      <label>Budget de zoom du test <select value={budgetOverride === undefined ? '' : String(budgetOverride)} disabled={running}
        onChange={event => setBudgetOverride(event.target.value ? Number(event.target.value) : undefined)}>
        <option value="">Profil ({selected?.configuration.smartZoomBudget ?? DEFAULT_ZOOM_BUDGET})</option>
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
      </select></label>
      <button type="button" className="primary-button" disabled={!selected?.testEndpoint || busy || running} onClick={() => void run()}>Tester le cadrage</button>
      {running && <button type="button" onClick={() => controller.current?.abort()}>Arrêter le test</button>}
      <p role="status">{status}{running && ' · ' + seconds + ' s'}</p>
      {witness && <><p>Référence en vert pointillé. Chaque cadre bleu numéroté correspond à un zoom demandé.</p>
        <div style={{ position: 'relative', maxWidth: 720 }}>
          <img alt="Schéma témoin avec la zone attendue et les cadres demandés" src={witness.original} style={{ display: 'block', width: '100%' }} />
          <span style={frame(targetRegion, '3px dashed green')} />
          {crops.map((crop, i) => <span key={i} style={{ ...frame(crop.region, '2px solid #075ba7'), color: '#075ba7' }}>{i + 1}</span>)}
        </div>
        {crops.map((crop, i) => {
          const { coverage, occupancy } = inspectFraming(crop.region);
          return <figure key={i}><figcaption>Zoom {i + 1} · {crop.cropWidth} × {crop.cropHeight} px · cible couverte à {Math.round(coverage * 100)} % · {Math.round(occupancy * 100)} % du cadre occupé par la cible</figcaption>
            <img alt={'Recadrage réel ' + (i + 1)} src={'data:' + crop.image.mimeType + ';base64,' + crop.image.base64} style={{ maxWidth: '100%' }} /></figure>;
        })}
        {answer && <p>Réponse du modèle : {answer} · Code attendu : {witness.code} · {answer === witness.code ? 'Lecture correcte' : 'Lecture à vérifier'}</p>}
      </>}
      {results.length > 0 && <><h4>Comparer les budgets de zoom</h4><div style={{ overflowX: 'auto' }}><table aria-label="Comparaison des budgets de zoom"><thead><tr><th>Modèle</th><th>Zooms / budget</th><th>Rejets</th><th>Durée</th><th>Verdict</th></tr></thead><tbody>{results.map((result, i) => <tr key={i}><td>{result.model}</td><td>{result.inspected}/{result.budget}</td><td>{result.rejected}</td><td>{result.duration} s</td><td>{result.verdict}</td></tr>)}</tbody></table></div></>}
    </details>
  </section>;
}
