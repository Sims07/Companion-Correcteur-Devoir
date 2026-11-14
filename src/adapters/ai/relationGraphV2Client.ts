import type { ImageInput } from '../../domain/imageInput.ts';
import {
  DIAGRAM_RELATIONS_V2_PROMPT, DIAGRAM_RELATIONS_V2_SCHEMA,
  parseObservedRelationGraphV2, type ObservedRelationGraphV2,
} from '../../domain/scientificDiagramRelationGraphV2.ts';
import { blindGraphCompatibleUrl, blindGraphLocalUrl } from './blindDiagramGraphClient.ts';
import { currentFetch } from './currentFetch.ts';
import { createOpenAiCompatibleFetch } from './openAiCompatibleTransport.ts';

export interface RelationGraphV2Request {
  endpoint: string;
  apiCompatible?: boolean;
  apiKey?: string;
  model: string;
  image: ImageInput;
  signal?: AbortSignal;
}

/** The experimental reader receives no rubric or reference answer. Both Ollama
 * and explicitly selected OpenAI-compatible routes retain the user's endpoint. */
export async function extractVisualRelationGraphV2(
  request: RelationGraphV2Request, transport: typeof fetch = currentFetch,
): Promise<ObservedRelationGraphV2> {
  const compatible = request.apiCompatible === true;
  const url = compatible ? blindGraphCompatibleUrl(request.endpoint) : blindGraphLocalUrl(request.endpoint);
  const send = compatible
    ? createOpenAiCompatibleFetch({endpoint:request.endpoint,apiKey:request.apiKey ?? ''}, transport)
    : transport;
  if (!request.model.trim() || request.model.length > 150) throw new Error('Modèle Vision V2 manquant.');
  if (!request.image.base64 || !/^image\/(png|jpeg|webp)$/.test(request.image.mimeType)) {
    throw new Error('Image V2 non valide.');
  }
  let validationMessage = '';
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (request.signal?.aborted) throw new DOMException('Traitement interrompu.', 'AbortError');
    const reply = await send(url, {
      method:'POST',headers:{'content-type':'application/json'},signal:request.signal,
      body:JSON.stringify({
        model:request.model,
        messages:[
          {role:'system',content:DIAGRAM_RELATIONS_V2_PROMPT},
          {role:'user',content:attempt === 1
            ? 'Décris les traits de rappel et leurs points de contact sur ce dessin original. Utilise des identifiants courts (l1, s1), jamais des phrases. Pour uncertain/missing : targetId=unknown et tipX=tipY=-1.'
            : 'Le graphe précédent est invalide : ' + validationMessage
              + ' Réexamine les pixels. Chaque identifiant doit être court et repris à l’identique dans leaders. Si la cible est douteuse, status=uncertain, targetId=unknown, tipX=tipY=-1. Ne devine aucune destination.',
            images:[compatible ? `data:${request.image.mimeType};base64,${request.image.base64}` : request.image.base64]},
        ],
        stream:false,format:compatible ? 'json' : DIAGRAM_RELATIONS_V2_SCHEMA,
        think:false,keep_alive:0,
        options:{temperature:0,num_predict:2400,num_ctx:4096},
      }),
    });
    if (!reply.ok) throw new Error('Lecture du graphe V2 indisponible ; vérifiez le modèle et le serveur sélectionnés.');
    let payload: unknown;
    try {payload = await reply.json();} catch {throw new Error('Réponse Vision V2 illisible.');}
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('Réponse Vision V2 invalide.');
    }
    const raw = (payload as {message?:{content?:unknown}}).message?.content;
    try {
      if (typeof raw !== 'string' || !raw.trim()) throw new Error('Observation V2 vide.');
      return parseObservedRelationGraphV2(raw);
    } catch (error) {
      if (request.signal?.aborted) throw new DOMException('Traitement interrompu.', 'AbortError');
      validationMessage = error instanceof Error ? error.message : 'Graphe invalide.';
      if (attempt === 2) {
        // A malformed experimental observation must not discard the entire
        // grading campaign. Return NO relation evidence, not fabricated links.
        // The following grading stage still sees the original pixels and must
        // explicitly request a teacher check of unresolved pointers.
        return {labels: [], structures: [], leaders: [], layout: 'unclear',
          complete: false, validationIssue: 'Observation de relations V2 non concluante après deux essais : ' + validationMessage};
      }
    }
  }
  throw new Error('Observation de relations V2 indisponible.');
}
