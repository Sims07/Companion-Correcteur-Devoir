import type { AiModelProfile } from '../../shared/domain/aiModelProfiles.ts';
import { sendLmStudioDiagramTurn } from '../../shared/adapters/ai/lmStudioDiagramChat.ts';
import { readAnswer, runVisualTrial, visualPromptVersion, type VisualCase, type VisualRow } from '../domain/controlledVisualTrial.ts';

function drawingPng(drawing: VisualCase) {
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 330;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('Création de l’image impossible.');
  c.fillStyle = '#fff'; c.fillRect(0,0,640,330);
  c.fillStyle = '#222'; c.strokeStyle = '#222'; c.lineWidth = 2;
  c.font = '24px sans-serif'; c.fillText('Cellule végétale',40,45);
  if (drawing !== 'titre sans soulignement') c.fillRect(40,50,c.measureText('Cellule végétale').width,2);
  c.strokeRect(55,90,300,200);
  c.fillStyle = '#dfecfa'; c.fillRect(80,108,140,155); c.strokeRect(80,108,140,155);
  c.beginPath(); c.arc(285,188,32,0,Math.PI*2); c.fillStyle = '#e9d2e8'; c.fill(); c.stroke();
  c.fillStyle = '#222'; c.beginPath(); c.arc(280,193,6,0,Math.PI*2); c.fill();
  c.fillText('Noyau',483,140);
  const x = drawing === 'trait déplacé' ? 181 : 292;
  const y = drawing === 'trait déplacé' ? 135 : 176;
  c.beginPath(); c.moveTo(473,136); c.lineTo(x,y); c.stroke();
  if (drawing === 'trait avec pointe') {
    c.beginPath(); c.moveTo(x+12,y-7); c.lineTo(x,y); c.lineTo(x+14,y+2); c.stroke();
  }
  return canvas.toDataURL('image/png');
}

interface State { status: 'idle'|'running'|'finished'|'stopped'|'failed'; label:string; rows:VisualRow[];
  profile:string; model:string; started:number; settings?:Record<string,unknown>; storageError?:boolean }
const empty: State = {status:'idle',label:'',rows:[],profile:'',model:'',started:0};
const key = 'companion:controlled-visual-trial:v1';
function restore(): State {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (saved?.version === visualPromptVersion && Array.isArray(saved.rows) &&
        ['finished','stopped','failed'].includes(saved.status)) return saved;
  } catch { /* Local storage can be unavailable. */ }
  return empty;
}
let state = restore();
let controller: AbortController | undefined;
const listeners = new Set<() => void>();
function update(next: State) { state = next; listeners.forEach(notify => notify()); }
export const visualTrialStore = {
  subscribe(notify: () => void) { listeners.add(notify); return () => { listeners.delete(notify); }; },
  snapshot: () => state,
  stop: () => controller?.abort(),
};
export async function startVisualTrial(profile: AiModelProfile) {
  if (controller) return;
  const cfg = profile.configuration;
  if (!/\/api\/v1\/chat\/?$/.test(cfg.endpoint.trim())) return;
  const task = new AbortController();
  controller = task;
  const settings = { think:cfg.omitReasoningParameter ? 'omis' : cfg.analysisThinking ? cfg.analysisReasoningEffort ?? 'medium' : 'off',
    context:cfg.contextLength, temperature:cfg.analysisTemperature, topP:cfg.analysisTopP,
    topK:cfg.analysisTopK, outputTokens:cfg.gradingOutputTokens ?? 256 };
  update({status:'running',label:'Préparation du témoin',started:Date.now(),rows:[],profile:profile.name,model:cfg.analysisModel,settings});
  try {
    await runVisualTrial(async (drawing,session,prompt) => {
      const response = await sendLmStudioDiagramTurn(cfg.endpoint.trim(),cfg.apiKey,session,{
        model:cfg.analysisModel, think:cfg.analysisThinking ? cfg.analysisReasoningEffort ?? 'medium' : false,
        omitReasoningParameter:cfg.omitReasoningParameter, contextLength:cfg.contextLength,
        options:{ num_predict:settings.outputTokens,temperature:cfg.analysisTemperature,top_p:cfg.analysisTopP,top_k:cfg.analysisTopK },
        messages:[{content:prompt,images:session.responseId ? [] : [drawingPng(drawing)]}],
      },{method:'POST',signal:task.signal},fetch,() => {});
      if (!response.ok) throw new Error('LM Studio · HTTP '+response.status);
      const frames = (await response.text()).split('\n').filter(Boolean);
      const content = frames.map(frame => JSON.parse(frame).message?.content ?? '').join('');
      return readAnswer(content);
    }, task.signal,(label,row) => update({...state,label,rows:row ? [...state.rows,row] : state.rows}));
    update({...state,status:'finished',label:'Essai terminé'});
  } catch (error) {
    update({...state,status:task.signal.aborted ? 'stopped' : 'failed',label:task.signal.aborted ? 'Essai arrêté'
      : error instanceof Error ? error.message : 'Échec de la lecture'});
  } finally {
    controller = undefined;
    try { localStorage.setItem(key,JSON.stringify({...state,version:visualPromptVersion})); }
    catch { update({...state,storageError:true}); }
  }
}
