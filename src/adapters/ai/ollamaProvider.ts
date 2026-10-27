import type { GradingProvider, GradingRequest, OllamaModel, OllamaSettings } from '../../ports/aiProvider.ts';

interface OllamaChatResponse {
  message?: { content?: string };
  error?: string;
  done?: boolean;
}

async function readOllamaStream(response: Response, onChunk?: (chunk: string) => void): Promise<string> {
  if (!response.body) throw new Error('Ollama n’a pas fourni de flux de réponse lisible.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as OllamaChatResponse;
    if (event.error) throw new Error('Ollama signale une erreur pendant la génération.');
    const chunk = event.message?.content ?? '';
    if (chunk) { content += chunk; onChunk?.(chunk); }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) consumeLine(line);
    }
    buffer += decoder.decode();
    consumeLine(buffer);
  } finally { reader.releaseLock(); }
  if (!content.trim()) throw new Error('Ollama a retourné une réponse vide.');
  return content;
}

interface OllamaTagsResponse {
  models?: Array<{ name?: string }>;
}

function normalizedEndpoint(endpoint: string): string {
  const value = endpoint.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(value)) throw new Error('L’adresse Ollama doit commencer par http:// ou https://.');
  return value;
}

/** Sends a small text-only request first so the UI can confirm that the selected model actually responds. */
export async function checkOllamaReady(
  settings: OllamaSettings,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const endpoint = normalizedEndpoint(settings.endpoint);
  if (!settings.model.trim()) throw new Error('Choisissez un modèle Ollama.');
  const response = await fetchImpl(`${endpoint}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: settings.model,
      stream: false,
      think: false,
      messages: [{ role: 'user', content: 'Ceci est un test de disponibilité, aucune copie à analyser. Réponds uniquement par le mot PRÊT.' }],
    }),
  });
  if (!response.ok) throw new Error(`Le test de disponibilité Ollama a échoué (HTTP ${response.status}).`);
  const data = await response.json() as OllamaChatResponse;
  if (data.error) throw new Error('Ollama signale une erreur pendant le test de disponibilité.');
  if (!data.message?.content?.trim()) throw new Error('Le modèle Ollama n’a pas répondu au test de disponibilité.');
}

export async function listOllamaModels(endpoint: string, fetchImpl: typeof fetch = fetch): Promise<OllamaModel[]> {
  const response = await fetchImpl(`${normalizedEndpoint(endpoint)}/api/tags`);
  if (!response.ok) throw new Error(`Connexion Ollama impossible (HTTP ${response.status}). Vérifiez Ollama et ses autorisations CORS.`);
  const data = await response.json() as OllamaTagsResponse;
  return (data.models ?? []).map((model) => model.name).filter((name): name is string => Boolean(name)).map((name) => ({ name }));
}

/** Browser-side adapter: sends requests only to the endpoint explicitly configured by the teacher. */
export function createOllamaProvider(
  settings: OllamaSettings,
  fetchImpl: typeof fetch = fetch,
): GradingProvider {
  return {
    id: 'ollama',
    async generate(request: GradingRequest, onChunk?: (chunk: string) => void): Promise<string> {
      const endpoint = normalizedEndpoint(settings.endpoint);
      if (!settings.model.trim()) throw new Error('Choisissez un modèle Ollama.');
      if (!request.question.trim()) throw new Error('La consigne de correction est vide.');
      if (!request.images?.length) throw new Error('Ajoutez au moins une photo ou un PDF avant de lancer la correction.');

      const prompt = [
        'RÔLE : tu assistes un enseignant universitaire en biologie. Tu proposes une correction, tu ne prends jamais la décision finale.',
        'CONTRAT DE SORTIE : retourne uniquement un objet JSON valide conforme au schéma fourni. Pas de Markdown, pas de texte avant ou après. Utilise les identifiants de critères exactement tels qu’ils apparaissent dans le barème.',
        'FIDÉLITÉ AU BARÈME : évalue chaque critère séparément selon sa description et son maximum de points. N’ajoute, ne fusionne et ne supprime aucun critère. N’invente pas de sous-critères, de pénalités ou d’attendus absents du barème. Ne pénalise l’orthographe ou la formulation que si le barème le prévoit. Accepte une formulation scientifiquement équivalente lorsqu’elle exprime correctement la notion attendue.',
        'LECTURE DE LA COPIE : commence par identifier ce qui est réellement lisible dans la copie, puis évalue cette réponse avec le barème. N’infère pas qu’un élément est présent s’il est absent, coupé ou illisible. Ne confonds pas une mauvaise lecture de l’écriture manuscrite avec une erreur scientifique. Pour les schémas, légendes, symboles, unités et formules, ne décris que ce que tu peux réellement distinguer. Une réponse substantielle visible ne doit pas être notée zéro simplement parce qu’elle est formulée autrement que prévu.',
        'JUSTIFICATION : pour chaque critère, donne une rationale concise expliquant le lien entre la réponse observée et le barème, et une evidence courte, fidèle et repérable dans la copie. Si aucune preuve textuelle fiable ne peut être citée, dis-le explicitement dans evidence ; ne fabrique jamais de citation.',
        'NOTATION CALIBRÉE : ne donne jamais automatiquement le maximum. Le maximum est mérité uniquement si la copie démontre tous les éléments essentiels explicitement attendus par ce critère. Distingue les éléments corrects, partiels, manquants et erronés, puis attribue les points en conséquence. Une réponse globalement bonne ne justifie pas à elle seule le maximum sur tous les critères. La confiance décrit la certitude de lecture/interprétation, pas le niveau de maîtrise : une réponse très lisible peut mériter une note partielle ou nulle, et une confiance élevée ne signifie pas une note élevée.',
        'BARÈME DE POINTS : utilise réellement la description de chaque critère et son maximum. Pour chaque critère, indique dans rationale quels attendus sont présents et lesquels manquent ou sont incorrects, puis explique pourquoi cela justifie le nombre de points choisi. N’invente pas de sous-points si le barème ne les détaille pas ; répartis proportionnellement les points uniquement selon les éléments démontrés. Ne récompense pas deux fois le même élément dans plusieurs critères, sauf si le barème le prévoit.',
        'NOTATION : points doit être un nombre compris entre 0 et maxPoints du critère. Attribue seulement les points justifiables par la copie et le barème. N’utilise pas zéro comme valeur par défaut : zéro signifie que les éléments observés ne répondent effectivement pas aux attendus du critère, ou qu’aucune réponse n’est présente et lisible. Si la copie semble contenir une réponse mais que tu ne peux pas la lire, indique cette limite et demande une clarification concrète au lieu de traiter automatiquement la réponse comme absente. confidence vaut low, medium ou high selon la lisibilité et la solidité de l’interprétation, pas selon le ton de la réponse.',
        'INCERTITUDE : utilise confidence="low" uniquement pour le critère réellement incertain. Explique précisément ce qui est incertain. Pose une question au professeur uniquement si une ambiguïté concrète, identifiable et susceptible de changer la note doit être tranchée. La question doit citer cette ambiguïté. N’écris jamais des questions génériques comme « pouvez-vous vérifier ce critère ? ». Si aucun point précis ne nécessite de clarification, laisse questionForTeacher vide et questionsForTeacher vide. Une confiance faible n’impose pas à elle seule une question.',
        'EXHAUSTIVITÉ ET COHÉRENCE : retourne exactement une entrée pour chaque critère du barème, sans doublon ni identifiant inconnu. Si la copie ne contient pas de réponse identifiable pour un critère, évalue seulement ce que le barème autorise et explique l’absence de preuve ; si tu ne peux pas déterminer si une réponse est absente ou illisible, demande confirmation.',
        'AUTO-VÉRIFICATION AVANT RÉPONSE : relis chaque note et vérifie qu’elle est soutenue par une preuve concrète. Pour chaque note maximale, vérifie explicitement que tous les attendus du critère sont démontrés. Vérifie que la somme des points ne dépasse pas le total du barème et que la synthèse ne prétend pas que la réponse est complète si des attendus manquent.',
        'SCHÉMA JSON : {"summary":"résumé prudent","criteria":[{"criterionId":"identifiant exact","points":0,"rationale":"justification liée au barème, avec éléments présents et manquants","evidence":"preuve observable ou limite de lecture explicite","confidence":"low|medium|high","questionForTeacher":""}],"questionsForTeacher":[]}. summary doit signaler que la proposition est à vérifier. questionForTeacher peut être une chaîne vide si aucune clarification n’est nécessaire.',
        'La note et les explications sont des propositions de travail, jamais une validation définitive. N’affirme pas avoir vérifié un élément que tu ne peux pas lire.',
        `BARÈME (JSON) :\n${request.rubric}`,
        `CONSIGNE DE L’ENSEIGNANT :\n${request.question}`,
      ].join('\n\n');

      let response: Response;
      try {
        response = await fetchImpl(`${endpoint}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: settings.model,
            stream: true,
            think: false,
            format: 'json',
            messages: [{
              role: 'user',
              content: prompt,
              images: request.images.map((image) => image.base64),
            }],
          }),
        });
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : 'erreur réseau inconnue';
        throw new Error(
          `Connexion à Ollama interrompue pendant l’analyse (modèle « ${settings.model} », ${request.images.length} image(s)). Vérifiez que le serveur Ollama fonctionne toujours, que la mémoire disponible suffit et consultez ses journaux. Détail réseau : ${detail}`,
        );
      }
      if (!response.ok) throw new Error(`Ollama a répondu avec le statut HTTP ${response.status}.`);
      try { return await readOllamaStream(response, onChunk); }
      catch (cause) {
        if (cause instanceof SyntaxError) throw new Error('Le flux envoyé par Ollama est mal formé. Vérifiez la version du serveur.');
        throw cause;
      }
    },
  };
}
